//! Protocol 1. Framing follows Handy's MIT-licensed worker protocol; limits
//! are specific to live dictation (not Handy's offline audio limits).
use serde_json::Value;
use std::io::{self, Read, Write};

pub const MAX_JSON: usize = 131_072;
pub const MAX_PCM: usize = 64_000;

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub fn read(input: &mut impl Read) -> io::Result<Option<(Value, Vec<f32>)>> {
    let mut length = [0; 4];
    // Only an EOF before the first byte is a clean end of the protocol.
    match input.read(&mut length[..1])? {
        0 => return Ok(None),
        _ => input.read_exact(&mut length[1..])?,
    }
    let size = u32::from_le_bytes(length) as usize;
    if size == 0 || size > MAX_JSON {
        return Err(invalid("invalid JSON length"));
    }
    let mut json = vec![0; size];
    input.read_exact(&mut json)?;
    let request = serde_json::from_slice(&json).map_err(|_| invalid("invalid JSON"))?;
    input.read_exact(&mut length)?;
    let size = u32::from_le_bytes(length) as usize;
    if size > MAX_PCM || size % 4 != 0 {
        return Err(invalid("invalid PCM length"));
    }
    let mut bytes = vec![0; size];
    input.read_exact(&mut bytes)?;
    let pcm: Vec<_> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
        .collect();
    if pcm.iter().any(|sample| !sample.is_finite()) {
        return Err(invalid("non-finite PCM"));
    }
    Ok(Some((request, pcm)))
}

pub fn write(output: &mut impl Write, response: &Value) -> io::Result<()> {
    let json = serde_json::to_vec(response)?;
    if json.len() > MAX_JSON {
        return Err(invalid("response exceeds protocol limit"));
    }
    output.write_all(&(json.len() as u32).to_le_bytes())?;
    output.write_all(&json)?;
    output.write_all(&0_u32.to_le_bytes())?;
    output.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;
    #[test]
    fn multiple_frames_and_clean_eof() {
        let mut bytes = Vec::new();
        write(&mut bytes, &json!({"type":"hello"})).unwrap();
        write(&mut bytes, &json!({"type":"shutdown"})).unwrap();
        let mut input = Cursor::new(bytes);
        assert_eq!(read(&mut input).unwrap().unwrap().0["type"], "hello");
        assert_eq!(read(&mut input).unwrap().unwrap().0["type"], "shutdown");
        assert!(read(&mut input).unwrap().is_none());
    }
    #[test]
    fn rejects_truncation_and_oversized_allocations() {
        for length in 1..4 {
            assert!(read(&mut Cursor::new(vec![1; length])).is_err());
        }
        assert!(read(&mut Cursor::new(u32::MAX.to_le_bytes())).is_err());
        let mut bytes = Vec::new();
        write(&mut bytes, &json!({"type":"feed"})).unwrap();
        bytes.truncate(bytes.len() - 4);
        bytes.extend(3_u32.to_le_bytes());
        assert!(read(&mut Cursor::new(bytes)).is_err());
    }
    #[test]
    fn fragmented_reader_and_nonfinite_audio() {
        struct Fragmented(Cursor<Vec<u8>>);
        impl Read for Fragmented {
            fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
                let n = out.len().min(1);
                self.0.read(&mut out[..n])
            }
        }
        let mut bytes = Vec::new();
        write(&mut bytes, &json!({"type":"feed"})).unwrap();
        assert!(read(&mut Fragmented(Cursor::new(bytes.clone())))
            .unwrap()
            .is_some());
        bytes.truncate(bytes.len() - 4);
        bytes.extend(4_u32.to_le_bytes());
        bytes.extend(f32::NAN.to_le_bytes());
        assert!(read(&mut Cursor::new(bytes)).is_err());
    }
}
