# Cluster: speech-input / local-recognition

## Purpose

Изолирует вычислительный runtime от процесса Kit.

## Public interface

| Module | Responsibility |
| --- | --- |
| speech-helper | Protocol 1: hello/load/begin/feed/finish/cancel/shutdown |
| speech-service | Каталог, управляемые модели, supervisor, поток и защищённый WebSocket |

## Invariants

Только stdio у worker; лимиты кадров и один активный поток.

## Dependencies

Pinned transcribe-cpp 0.4.2; Handy как донор узкого worker-протокола.
