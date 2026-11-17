# Cluster: speech-input / browser-input

## Purpose

Захват микрофона и безопасная передача снимков текста владельцу поля.

## Public interface

| Module | Responsibility |
| --- | --- |
| speech-input | attachDictation для поля; backend static mount |

## Invariants

Нет вызова провайдера, автоматической отправки или переноса диктовки в другое поле.

## Dependencies

Same-origin speech-service API; MediaDevices, AudioWorklet, AudioContext, WebSocket.
