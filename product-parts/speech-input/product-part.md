# Product part: speech-input

## Purpose

Локальная потоковая диктовка в поля Workflow Kit. Не отправляет сообщения.

## Public interface

| Cluster | Responsibility |
| --- | --- |
| local-recognition | Нативный helper и служба моделей/потока |
| browser-input | Захват и адаптер поля |

## Invariants

Один поток принадлежит одному полю. Аудио и текст не записываются в общие журналы.

## Dependencies

Публичные интерфейсы data-store, http-server, cli и session-chat.

Browser public entry: /speech-input/dictation.js, attachDictation; its backend
mount comes through #speech-input. Audio never enters the provider channel.
