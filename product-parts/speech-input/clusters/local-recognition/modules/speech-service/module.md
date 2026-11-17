# Module: speech-service

Part `speech-input`, cluster `local-recognition`. Public entry `src/index.ts`,
alias `#speech-service`.

## Purpose

Каталог и управляемое хранилище моделей, поток, supervisor и локальный HTTP/WebSocket.

## Public interface

SPEECH_MODELS/DEFAULT_MODEL_ID, SpeechModel, SpeechError(code/message),
createModelStore({root, settingsFile, platform?, catalog?, fetch?, inUse?}).
Store: selected(), model(id), list(), verify(id), select(id), download(id),
cancel(id), remove(id), close(), downloading(). download returns one shared promise
per model; callers must handle its rejection. list has missing/downloading/installed/error,
receivedBytes and a public error. verify hashes the file before runtime load.

## Invariants

Only pinned catalog URLs and controlled filenames. Partial download never installed.
Size/SHA-256 then fsync and atomic rename. Download inactivity times out at 45 s.
Files/root must be regular, no symlink traversal. Foreign cache untouched.
Active model cannot be changed/deleted. Persisted choice uses data-store atomic JSON.

## Dependencies

Public `#data-store`; Node fs, crypto, path and fetch. Three verified Voxtral
quantizations from Handy aca8985190c3ad7f361d8a80cb30f179513ed690.

## Поведение на ОС

Model storage is shared Node code on macOS, Linux and Windows. Injected platform
controls atomic rename/retries via data-store; tests cover all three. Actual
inference availability is checked by the runtime, not inferred from the catalog.

## Tests

Verified download and restart selection, bad hash, partial cleanup, cancellation,
one download per model, tampered bytes, invalid id, symlink and in-use deletion.

## Streaming facade

createSpeechService(options) exposes status, begin(id, emit) → lease, download,
cancelDownload, select, remove, close. Lease.ready confirms native begin; feed(pcm,
audioSeq) serializes finite PCM, finish drains feeds once (idempotent), cancel kills
the worker immediately. One owner, ≤128000 queued PCM bytes, 120-min maximum.
A loaded model is reused; idle runtime unloads after 60 seconds. Integrity is
verified before loading. Native crash/timeout invalidates the worker; retry is explicit.

registerSpeechRoutes({router, server, speech}) exposes GET /api/speech and POST
/api/speech/models/:id/download|cancel|select|remove, returning public model state.
Upgrade /api/speech/stream requires exact same Origin/Host/port, loopback local/remote,
protocolVersion 1 and dictationId. Binary frames: u32 audioSeq LE then PCM, ≤64004
bytes; JSON ≤4096 bytes, ≤60 messages/s, inactivity timeout 90 s, no compression.
No audio/text broadcast or persistence. Only that socket receives ready, transcript,
final or error with its dictationId; feed responses acknowledge audioSeq. Socket
close cancels; service shutdown terminates sockets before HTTP close.

Helper stdout decoder bounds allocations, handles fragmented frames and validates
handshake. Public HelperClient/HelperMessage enable deterministic crash/queue tests.
Linux/win32 paths and availability are tested with injected platform.

Real opt-in runtime check: test/runtime-switch.smoke.mjs takes helper/Q8/Q4/WAV and optional Q6,
links verified test files into a temporary store, selects each through the public
service and records actual native load paths. All supplied variants must emit Russian
updates before EOF and a non-truncated final. Test cleanup closes the native process
and removes only its temporary links. This is separate from UI/mock tests.

## Worker failure containment (T009)

Child stdin/stdout error listeners stay installed for its lifetime, including late
EPIPE after cancellation. I/O errors and stdout EOF reject the pending command,
invalidate the decoder and reap the worker; no error event escapes to Kit.
Malformed/oversized/unsolicited frames and watchdog timeout also terminate it.
createHelperClient accepts optional launch/timeoutMs injection for failure tests;
production always uses no-shell spawn and the 30/90-second watchdog defaults.
An explicit retry constructs a fresh worker; no hidden inference retry occurs.
Tests cover fragmented frames, concurrent requests, EPIPE on both streams, partial
EOF, malformed frame, spawn/exit, timeout and service recovery after failed hello.
