# Session chat: диктовка

## Speech Input — composer

Composer loads public /speech-input/dictation.js, enables only its own microphone
(the attachment button remains disabled) and updates text through draftRevision,
fit and refresh only on actual value changes. Speech blocks send() itself, queue,
Enter and Ctrl/Cmd+Enter; agent Stop remains independent. Speech status has its
own aria-live element and cannot overwrite the provider error. setVisible forwards
to the dictation owner; manual edits synchronously cancel before late results.
Undelivered-send recovery does not overwrite a draft reserved by active dictation.
All UI code is shared; Linux/Windows/mobile capability is unavailable, as in the
speech-input contract. No provider route is called by the microphone.

Browser check: test/speech-composer.browser.mjs takes a Playwright entry path and
an artifact folder, owns an ephemeral server and isolated Chromium contexts. It
uses synthetic MediaStream/native/provider fixtures with real AudioWorklet,
resampling, WebSocket and composer; verifies both themes, Enter/queue/function
guards, explicit send, agent Stop, manual edits, late permission cleanup and hide.
No physical microphone/Safari acceptance is inferred from this fixture.

## Question card

Free-text answers attach the same public field adapter only to allowOther rows.
Snapshots go through writeOther and the card sync, never the message route.
The card button and send(id) guard every active speech owner including Cmd/Ctrl+Enter.
Changing answer choices cancels speech synchronously; closed/replaced/forgotten
cards dispose controllers. Parent setVisible propagates without changing choice
or attempt state; stale async module loads cannot attach to a replaced card.
The microphone/status are hidden with the own-answer field. UI is shared on all
OS; capture capability is the browser/service contract, not a provider feature.

Browser check test/speech-question.browser.mjs verifies the real production card
and speech transport with a synthetic MediaStream: both themes, writeOther state,
all send guards, only the answer route after explicit send, manual edits/poll,
option changes, hide and forgotten/closed-card cleanup. Screenshots inspected.

Legacy browser runner now uses an ephemeral port, mounts the public speech files
and exposes unavailable speech in non-speech fixtures. m28 composer and m33 question
regressions pass at dark 1280 and light 390 without capturing a microphone.
