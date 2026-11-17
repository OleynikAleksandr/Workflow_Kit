#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod native;
mod protocol;
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
use serde_json::json;
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
use std::io;

fn main() {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let result = native::run();
    #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
    let result = unsupported();
    if let Err(error) = result {
        eprintln!("speech helper: {error}");
        std::process::exit(1);
    }
}

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn unsupported() -> io::Result<()> {
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    while let Some((request, _)) = protocol::read(&mut input)? {
        if request["type"] == "shutdown" {
            break;
        }
        protocol::write(
            &mut output,
            &json!({"type":"error", "code":"unavailable", "message":"Native speech requires macOS Apple Silicon"}),
        )?;
    }
    Ok(())
}
