# M8: захваты ответов Kimi Code 2.5.2

Реальные ответы сервера `kimi web` и stdin хуков, снятые 2026-11-09 на стенде (отдельный
`KIMI_CODE_HOME`, подставная модель `fake/fake`). Пути стенда заменены на `/home/user`;
секретов в захватах нет. Это источник фикстур тестов `provider-kimi` (`test/fixtures`):
имя файла фикстуры — заголовок раздела. Факты и правила — в
[Протоколе](../planning/M8-kimi-protocol.md).

## meta.json

`GET /api/v1/meta`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "server_version": "2.5.2",
  "capabilities": {
   "websocket": true,
   "file_upload": true,
   "fs_query": true,
   "mcp": true,
   "tasks": true
  },
  "server_id": "01M70X1N2969CFKJV8GGC1AT8C",
  "started_at": "2026-11-09T19:37:30.954Z",
  "open_in_apps": [],
  "dangerous_bypass_auth": false,
  "backend": "v2",
  "experimental_flags": {
   "notify_user": false,
   "wait_for": true,
   "subagent_fork": false,
   "tower": false,
   "tool-select": false
  },
  "features": [
   {
    "name": "skill",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "btw",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "dateChange",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "plan",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "fileHistory",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "externalHooks",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "debugEvents",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "swarm",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "goal",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "tower",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "usage",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "cron",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "reminder",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "tokenCounting",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "sessionInit",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "todo",
    "state": "Active",
    "meta": {}
   },
   {
    "name": "notify",
    "state": "Active",
    "meta": {}
   }
  ]
 },
 "request_id": "01M70XCD60AJWS82ZMGZTJT0NY"
}
```

## auth.json

`GET /api/v1/auth`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "models_ready": true,
  "providers_count": 1,
  "managed_provider": null
 },
 "request_id": "01M70XCD6GCD5QGCCT4SY9YYCV"
}
```

## config.json

`GET /api/v1/config`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "default_model": "fake/fake",
  "default_permission_mode": "yolo",
  "providers": {
   "fake": {
    "type": "kimi",
    "base_url": "http://127.0.0.1:58201/v1",
    "has_api_key": true
   }
  },
  "models": {
   "fake/fake": {
    "provider": "fake",
    "model": "fake",
    "maxContextSize": 262144,
    "capabilities": [
     "tool_use"
    ],
    "displayName": "Fake",
    "has_api_key": false
   }
  },
  "hooks": [
   {
    "event": "SessionStart",
    "command": "python3 /home/user/hooklog.py SessionStart",
    "timeout": 10
   },
   {
    "event": "UserPromptSubmit",
    "command": "python3 /home/user/hooklog.py UserPromptSubmit",
    "timeout": 10
   },
   {
    "event": "Stop",
    "command": "python3 /home/user/hooklog.py Stop",
    "timeout": 10
   },
   {
    "event": "StopFailure",
    "command": "python3 /home/user/hooklog.py StopFailure",
    "timeout": 10
   },
   {
    "event": "Interrupt",
    "command": "python3 /home/user/hooklog.py Interrupt",
    "timeout": 10
   },
   {
    "event": "SubagentStart",
    "command": "python3 /home/user/hooklog.py SubagentStart",
    "timeout": 10
   },
   {
    "event": "SubagentStop",
    "command": "python3 /home/user/hooklog.py SubagentStop",
    "timeout": 10
   },
   {
    "event": "TurnStarted",
    "command": "python3 /home/user/hooklog.py TurnStarted",
    "timeout": 10
   },
   {
    "event": "SessionEnd",
    "command": "python3 /home/user/hooklog.py SessionEnd",
    "timeout": 10
   }
  ],
  "workspace": {
   "requireTrust": true
  },
  "extra_skill_dirs": [],
  "merge_all_available_skills": true,
  "builtin_product_skills": true,
  "extra_agent_dirs": [],
  "default_plan_mode": false,
  "cron": {
   "debug": false,
   "noJitter": false,
   "noStale": false,
   "disabled": false,
   "manualTick": false
  },
  "read": {},
  "identity": {},
  "swarm": {
   "timeoutMs": 7200000
  },
  "subagent": {
   "timeoutMs": 7200000
  },
  "token_counting": {
   "strategy": "measured+estimated"
  },
  "image": {},
  "mcp": {},
  "task": {},
  "background": {},
  "database": {},
  "watch": {},
  "thinking": {},
  "loop_control": {},
  "services": {},
  "permission": {},
  "yolo": true
 },
 "request_id": "01M70XCD70PMQ2HR7K19QA1TJQ"
}
```

## workspaces.json

`GET /api/v1/workspaces`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "items": [
   {
    "id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
    "root": "/home/user/kwork",
    "name": "kwork",
    "kind": "managed",
    "additional_dirs": [],
    "created_at": "2026-11-09T19:37:38.697Z",
    "last_opened_at": "2026-11-09T19:38:18.987Z",
    "session_count": 2
   },
   {
    "id": "wm_b71c79ab-a017-4632-b6a3-84fd57e28fab",
    "root": "/home/user/kwork",
    "name": "kwork",
    "kind": "managed",
    "additional_dirs": [],
    "created_at": "2026-11-09T19:37:45.843Z",
    "last_opened_at": "2026-11-09T19:37:45.843Z",
    "session_count": 0
   }
  ]
 },
 "request_id": "01M70XCD7HQANV0VSHE6RN17FB"
}
```

## trust.json

`POST /api/v1/workspaces/{id}/trust`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "trusted": true
 },
 "request_id": "01M70XCD958E7JCS50584KCAJE"
}
```

## v2-sessions.json

`GET /api/v2/sessions`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "items": [
   {
    "id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "workspace": {
     "id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
     "cwd": "/home/user/kwork"
    },
    "meta": {
     "title": "Kit test 2",
     "last_prompt": "queued one",
     "created_at": 1794253098998,
     "updated_at": 1794253398243,
     "archived": false,
     "archived_at": null
    },
    "activity": {
     "status": "idle",
     "model": "fake/fake"
    }
   },
   {
    "id": "session_8109bd97-fc58-4bf4-a404-6a6112791e42",
    "workspace": {
     "id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
     "cwd": "/home/user/kwork"
    },
    "meta": {
     "title": "Kit test",
     "last_prompt": "hello two",
     "created_at": 1794253065997,
     "updated_at": 1794253086878,
     "archived": false,
     "archived_at": null
    },
    "activity": {
     "status": "failed",
     "model": ""
    }
   }
  ],
  "total": 2,
  "has_more": false,
  "next_page_token": null
 },
 "request_id": "01M70XCD820MMS8CAF3XFTJ4FR"
}
```

## session-idle.json

`GET /api/v1/sessions/{id}` — сессия свободна.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
  "workspace_id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
  "title": "Kit test 2",
  "created_at": "2026-11-09T19:38:18.998Z",
  "updated_at": "2026-11-09T19:43:18.243Z",
  "busy": false,
  "main_turn_active": false,
  "pending_interaction": "none",
  "last_turn_reason": "completed",
  "archived": false,
  "last_prompt": "queued one",
  "metadata": {
   "cwd": "/home/user/kwork"
  },
  "agent_config": {
   "model": "fake/fake"
  },
  "usage": {
   "input_tokens": 0,
   "output_tokens": 0,
   "cache_read_tokens": 0,
   "cache_creation_tokens": 0,
   "total_cost_usd": 0,
   "context_tokens": 0,
   "context_limit": 0,
   "turn_count": 0
  },
  "permission_rules": [],
  "message_count": 0
 },
 "request_id": "01M70XCD31KA99CR13RWZR6M8N"
}
```

## session-busy.json

`GET /api/v1/sessions/{id}` — идёт ход в этом сервере.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
  "workspace_id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
  "title": "Kit test 2",
  "created_at": "2026-11-09T19:38:18.998Z",
  "updated_at": "2026-11-09T19:43:16.810Z",
  "busy": true,
  "main_turn_active": true,
  "pending_interaction": "none",
  "archived": false,
  "last_prompt": "SLOW two",
  "metadata": {
   "cwd": "/home/user/kwork"
  },
  "agent_config": {
   "model": "fake/fake"
  },
  "usage": {
   "input_tokens": 0,
   "output_tokens": 0,
   "cache_read_tokens": 0,
   "cache_creation_tokens": 0,
   "total_cost_usd": 0,
   "context_tokens": 0,
   "context_limit": 0,
   "turn_count": 0
  },
  "permission_rules": [],
  "message_count": 0
 },
 "request_id": "01M70XC824TX4YPMPFJHC8THVX"
}
```

## prompt-running.json

`POST …/prompts` — ход начат.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "prompt_id": "kit-p12",
  "user_message_id": "kit-p12",
  "status": "running",
  "content": [
   {
    "type": "text",
    "text": "SLOW two"
   }
  ],
  "created_at": "2026-11-09T19:43:16.781Z"
 },
 "request_id": "01M70XC6S8D63XF1S1HDZM9WHQ"
}
```

## prompt-queued.json

`POST …/prompts` во время хода.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "prompt_id": "kit-p13",
  "user_message_id": "kit-p13",
  "status": "queued",
  "content": [
   {
    "type": "text",
    "text": "queued one"
   }
  ],
  "created_at": "2026-11-09T19:43:18.141Z"
 },
 "request_id": "01M70XC82THR06AYB1FJWB8YDR"
}
```

## messages.json

`GET …/messages`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "items": [
   {
    "id": "msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000021",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "assistant",
    "content": [
     {
      "type": "text",
      "text": "answer 9"
     }
    ],
    "created_at": "2026-11-09T19:43:18.197Z"
   },
   {
    "id": "kit-p13",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "user",
    "content": [
     {
      "type": "text",
      "text": "queued one"
     }
    ],
    "created_at": "2026-11-09T19:43:18.196Z",
    "metadata": {
     "origin": {
      "kind": "user"
     }
    }
   },
   {
    "id": "msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000019",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "user",
    "content": [
     {
      "type": "text",
      "text": "<system-reminder>\nThe previous turn was interrupted by the user before completion; any partial output shown above is incomplete. The user's next message continues the conversation.\n</system-reminder>"
     }
    ],
    "created_at": "2026-11-09T19:43:18.163Z",
    "metadata": {
     "origin": {
      "kind": "injection",
      "variant": "interruption",
      "ownerPromptId": "kit-p12"
     }
    }
   },
   {
    "id": "kit-p12",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "user",
    "content": [
     {
      "type": "text",
      "text": "SLOW two"
     }
    ],
    "created_at": "2026-11-09T19:43:16.810Z",
    "metadata": {
     "origin": {
      "kind": "user"
     }
    }
   },
   {
    "id": "msg_session_c4db56ed-538b-40b0-9c61-32467d766652_000017",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "assistant",
    "content": [
     {
      "type": "text",
      "text": "answer 7"
     }
    ],
    "created_at": "2026-11-09T19:42:46.002Z"
   },
   {
    "id": "kit-p11",
    "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
    "role": "user",
    "content": [
     {
      "type": "text",
      "text": "no model"
     }
    ],
    "created_at": "2026-11-09T19:42:46.001Z",
    "metadata": {
     "origin": {
      "kind": "user"
     }
    }
   }
  ],
  "has_more": true
 },
 "request_id": "01M70XCD8M3S2V9Z3VR4Y6SQNK"
}
```

## reload.json

`POST …:reload`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "id": "session_c4db56ed-538b-40b0-9c61-32467d766652",
  "workspace_id": "wm_d7ee5e9e-2bd6-4b04-8544-27db00055591",
  "title": "Kit test 2",
  "created_at": "2026-11-09T19:38:18.998Z",
  "updated_at": "2026-11-09T19:42:46.066Z",
  "busy": false,
  "main_turn_active": false,
  "pending_interaction": "none",
  "last_turn_reason": "completed",
  "archived": false,
  "last_prompt": "no model",
  "metadata": {
   "cwd": "/home/user/kwork"
  },
  "agent_config": {
   "model": "fake/fake"
  },
  "usage": {
   "input_tokens": 0,
   "output_tokens": 0,
   "cache_read_tokens": 0,
   "cache_creation_tokens": 0,
   "total_cost_usd": 0,
   "context_tokens": 0,
   "context_limit": 0,
   "turn_count": 0
  },
  "permission_rules": [],
  "message_count": 0
 },
 "request_id": "01M70XC6NRR7GYJ6PMWHSFB3M5"
}
```

## abort.json

`POST …:abort`.

```json
{
 "code": 0,
 "msg": "success",
 "data": {
  "aborted": true
 },
 "request_id": "01M70XC84GE8BGG68ECZNKJMGG"
}
```

## hooks-last.log

stdin хуков: промпт, прерывание, конец хода (по строке на вызов).

```json
{"event": "UserPromptSubmit", "stdin": {"hook_event_name": "UserPromptSubmit", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "prompt": [{"type": "text", "text": "SLOW two"}], "is_steer": false}}
{"event": "TurnStarted", "stdin": {"hook_event_name": "TurnStarted", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "turn_id": 8, "origin_kind": "user", "prompt": "SLOW two"}}
{"event": "UserPromptSubmit", "stdin": {"hook_event_name": "UserPromptSubmit", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "prompt": [{"type": "text", "text": "queued one"}], "is_steer": false}}
{"event": "Interrupt", "stdin": {"hook_event_name": "Interrupt", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "turn_id": 8, "reason": "cancelled"}}
{"event": "TurnStarted", "stdin": {"hook_event_name": "TurnStarted", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "turn_id": 9, "origin_kind": "user", "prompt": "queued one"}}
{"event": "Stop", "stdin": {"hook_event_name": "Stop", "session_id": "session_c4db56ed-538b-40b0-9c61-32467d766652", "cwd": "/home/user/kwork", "client_type": "kimi_code_cli", "session_title": "Kit test 2", "stop_hook_active": false}}
```
