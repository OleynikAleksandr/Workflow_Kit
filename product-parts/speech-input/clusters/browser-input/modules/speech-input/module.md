# Module: speech-input

Part `speech-input`, cluster `browser-input`. Backend public entry src/index.ts
(`#speech-input`), browser public entry `/speech-input/dictation.js`.

## Purpose

Микрофон → mono float32 16kHz → ограниченный WebSocket; снимки текста в один черновик.

## Public interface

speechInputMount() exposes static `/speech-input/`. attachDictation({input, button,
onText, onState?, onError?, canStart?, limit?}) returns state/blockingSend getters,
start/stop/cancel/refresh/sync/setVisible/dispose. Caller owns revisions, persistence,
layout and all send guards; onText must use its normal state update path.
Capture/connection factories can be injected in browser tests; production defaults
use real browser APIs and the server protocol. No mock recognition in production.

## Invariants

AudioContext activates on click stack before awaits. Permission, native ready and
worklet preparation precede listening. Stop ends tracks immediately, flushes one
short packet then finalizes; cancel synchronously invalidates the field generation.
Late permission after cancel stops received tracks. Stateful 48-tap windowed-sinc
low-pass resampling retains phase/history across blocks; worklet emits 200ms packets.

Connection validates dictationId and monotonic eventSeq, acknowledges audioSeq,
limits unacknowledged/buffered audio to 128000 bytes and times out prepare/finalize.
Samples encode explicitly little-endian. Field range retains prefix/suffix and
initial selection; only snapshots replace its text, no committed append duplication.
Boundary spacing is local to that range, no whole-draft trim. UTF-16 clipping
keeps surrogate pairs. Editing, navigation, IME, hide/dispose/pagehide synchronously
cancel; DOM removal is observed only during active capture. No focus-based migration.

## Dependencies

Web platform APIs only. No React/Tauri, cloud keys, browser speech API or batch fallback.

## Поведение на ОС

Local secure macOS browser on loopback with AudioWorklet/MediaDevices is eligible;
server independently enforces platform and loopback access. UI platform detection
is a capability hint, never server authorization. Linux/Windows/mobile/remote UI
stays unavailable. Resampling and field logic are platform-independent and tested.

## Tests

Resampling block continuity/exact duration, anti-alias rejection, snapshots,
selection/suffix, Unicode clipping and injected platform/client capabilities.
Real microphone permission/Safari behavior requires separate live validation.

Opt-in test/real-browser.smoke.mjs runs production createApp with isolated Unicode
paths, real helper/GGUF, WebSocket, worklet and composer. Russian WAV feeds a synthetic
MediaStream only after listening; text must arrive before EOF and never send.
Tracks/contexts close on Stop. This does not verify hardware permission or Safari.

Opt-in test/installed-browser.smoke.mjs <playwright> <url> <wav> <out> drives an
installed instance (spec speech-integration 2.3): it opens the real panel of the
instance (/), adds a composer card and routes only the WAV, so dom.js, composer,
speech-input modules, the worklet, /api/speech and the WebSocket come from the
installed service and its own helper (no WFK_SPEECH_HELPER). A routed document is
not used: Chromium's local network access checks block its WebSocket to loopback.
It requires available=true, Russian text in the draft, no sends, closed tracks and
contexts, no browser errors; it writes installed-browser.json with first text and
Stop times.

## AudioWorklet backpressure and errors (T010)

Worklet → main MessagePort allows at most 8 unacknowledged 200-ms packets
(102400 PCM bytes / 1.6 s). Main acknowledges sequence only after synchronous
onPacket handoff to the independently bounded connection queue. Unknown/duplicate
acks do not enlarge this window. Overflow sends one overload and stops processing;
no packet dropping or hidden restart. Stop flushes before finalizing, Cancel/error
closes port, tracks and AudioContext; late permission tracks are stopped.
Known permission/device DOMExceptions have actionable Russian messages.

worklet.test.ts stalls main and checks the actual worklet source, finite window,
terminal overload, acknowledgements, exact sample count and finish. Opt-in
capture-negative.browser.mjs verifies real worklet overload during a main-thread
stall, saved draft, mocked permission/device failures, device-ended, Stop/Cancel
resource cleanup and no browser errors. Hardware permission remains a live check.
