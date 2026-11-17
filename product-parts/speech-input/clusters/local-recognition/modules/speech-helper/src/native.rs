//! Narrow adaptation of Handy worker.rs at aca8985190c3ad7f361d8a80cb30f179513ed690.
//! Copyright (c) 2025 CJ Pais, MIT. See THIRD_PARTY_NOTICES.md.
use crate::protocol;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{self, BufReader};
use std::os::fd::FromRawFd;
use std::sync::mpsc::{self, Receiver};
use transcribe_cpp::{Model, ModelOptions, RunOptions, Session, Stream, StreamOptions};

type Incoming = (Value, Vec<f32>);
fn error(message: impl ToString) -> Value {
    json!({"type":"error","code":"engine-error","message":message.to_string()})
}

pub fn run() -> io::Result<()> {
    // Keep a private stdout descriptor: native libraries also print to fd 1.
    let fd = unsafe { libc::dup(libc::STDOUT_FILENO) };
    if fd < 0 {
        return Err(io::Error::last_os_error());
    }
    let mut output = unsafe { File::from_raw_fd(fd) };
    if unsafe { libc::dup2(libc::STDERR_FILENO, libc::STDOUT_FILENO) } < 0 {
        return Err(io::Error::last_os_error());
    }
    let (tx, rx) = mpsc::sync_channel::<Incoming>(2);
    std::thread::spawn(move || {
        let mut input = BufReader::new(io::stdin().lock());
        loop {
            match protocol::read(&mut input) {
                Ok(Some(request)) => {
                    if tx.send(request).is_err() {
                        return;
                    }
                }
                // Exit even when native code is hung; the parent closes stdin.
                Ok(None) => unsafe { libc::_exit(0) },
                Err(e) => {
                    eprintln!("speech protocol: {e}");
                    unsafe { libc::_exit(1) }
                }
            }
        }
    });
    let init = transcribe_cpp::init_backends_default().map_err(|e| e.to_string());
    let mut session: Option<Session> = None;
    while let Ok((request, _)) = rx.recv() {
        let response = match request["type"].as_str().unwrap_or("") {
            "hello" => match &init {
                Ok(()) => {
                    json!({"type":"hello","protocolVersion":1,"sampleRate":16000,"runtime":"transcribe-cpp/0.4.2"})
                }
                Err(e) => error(e),
            },
            "load" => {
                session = None;
                let model = Model::load_with(
                    request["path"].as_str().unwrap_or(""),
                    &ModelOptions::default(),
                );
                match model {
                    Ok(model) => {
                        if !model
                            .capabilities()
                            .map(|c| c.supports_streaming)
                            .unwrap_or(false)
                        {
                            error("Model does not support native streaming")
                        } else {
                            match model.session() {
                                Ok(s) => {
                                    session = Some(s);
                                    json!({"type":"loaded","backend":model.backend(),"architecture":model.arch(),"rssPeakBytes":rss_peak()})
                                }
                                Err(e) => error(e),
                            }
                        }
                    }
                    Err(e) => error(e),
                }
            }
            "begin" => {
                if let Some(s) = session.as_mut() {
                    let outcome = match s.stream(&RunOptions::default(), &StreamOptions::default())
                    {
                        Ok(stream) => {
                            protocol::write(&mut output, &json!({"type":"ready"}))?;
                            serve(stream, &rx, &mut output)?
                        }
                        Err(e) => Some(error(e)),
                    };
                    if let Some(mut final_result) = outcome {
                        final_result["truncated"] = json!(s.was_truncated());
                        protocol::write(&mut output, &final_result)?;
                    }
                    continue;
                } else {
                    error("No model loaded")
                }
            }
            "shutdown" => {
                protocol::write(&mut output, &json!({"type":"ended"}))?;
                break;
            }
            _ => error("No active stream or unknown command"),
        };
        protocol::write(&mut output, &response)?;
    }
    Ok(())
}

fn serve(
    mut stream: Stream<'_>,
    rx: &Receiver<Incoming>,
    output: &mut File,
) -> io::Result<Option<Value>> {
    let mut seq: u64 = 0;
    while let Ok((request, pcm)) = rx.recv() {
        let kind = request["type"].as_str().unwrap_or("");
        if kind == "cancel" {
            stream.reset();
            protocol::write(output, &json!({"type":"ended"}))?;
            return Ok(None);
        }
        if kind != "feed" && kind != "finish" {
            protocol::write(output, &error("A stream is active"))?;
            continue;
        }
        let update = if kind == "feed" {
            stream.feed(&pcm)
        } else {
            stream.finalize()
        };
        seq += 1;
        let response = match update {
            Ok(update) => {
                let text = stream.text();
                json!({"type":if kind=="finish" {"final"} else {"transcript"},
                    "eventSeq":seq,"committed":text.committed,"tentative":text.tentative,
                    "changed":update.committed_changed||update.tentative_changed,
                    "bufferedMs":update.buffered_ms,"inputMs":update.input_received_ms,
                    "truncated":stream.last_status().is_some()})
            }
            Err(e) => error(e),
        };
        let failed = response["type"] == "error";
        if kind == "finish" {
            return Ok(Some(response));
        }
        protocol::write(output, &response)?;
        if failed {
            return Ok(None);
        }
    }
    Ok(None)
}

fn rss_peak() -> i64 {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) } == 0 {
        usage.ru_maxrss
    } else {
        0
    }
}
