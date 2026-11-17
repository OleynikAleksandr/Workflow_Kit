# Module: speech-helper

Part `speech-input`, cluster `local-recognition`. Public entry: executable
`wfk-speech-helper`, built from Cargo.toml. No Node native addon.

## Purpose

Изолированный процесс распознавания с native streaming; не захватывает микрофон.

## Public interface

Protocol 1: `[u32 JSON length LE][JSON UTF-8][u32 PCM length LE][PCM f32 LE]`.
JSON requests: type hello, load (absolute managed path), begin, feed, finish,
cancel, shutdown. One request/one response. Responses: hello (protocolVersion,
sampleRate, runtime), loaded (backend/architecture), ready, transcript/final
(eventSeq, committed/tentative snapshots, bufferedMs/inputMs, truncated), ended,
error (code/message). JSON ≤131072 bytes, PCM ≤64000 bytes, mono finite f32 16kHz.

## Invariants

EOF shuts down even during native computation. Native stdout redirected to stderr;
private duplicate fd carries protocol. Input queue holds at most two frames.
Invalid lengths/JSON/PCM terminate the worker. Session must be loaded before begin;
feed/finish require an active stream. Failed streams need a new begin.

## Dependencies

transcribe-cpp =0.4.2 and transcribe-cpp-sys =0.4.2, Cargo.lock; serde_json, libc.
Adapted design/worker code: Handy aca8985190c3ad7f361d8a80cb30f179513ed690 (MIT).

## Поведение на ОС

macOS ARM64: native Metal, checked runtime streaming capability. macOS Intel,
Linux, Windows x64/ARM64: explicit unavailable response, no native dependency.
Microphone permissions belong to the browser. No OS programs are invoked.

## Tests

cargo test --locked: fragmented/multiple frames, EOF/truncation, invalid lengths,
nonfinite PCM. Real Russian audio validation is separate from protocol unit tests.
