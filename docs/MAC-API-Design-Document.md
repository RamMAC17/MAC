# MAC — MBM AI Cloud

## API Design & Architecture Plan

### Phase 1–8 · Complete Platform Blueprint

**Prepared for Professor Review · 07 April 2026**

---

## Executive Summary

MAC (MBM AI Cloud) is a **fully self-hosted, zero-cloud AI inference platform** purpose-built for MBM Engineering College. Students and faculty on the college LAN access state-of-the-art AI models — text generation, code assistance, vision understanding, speech-to-text, and mathematical reasoning — through a standardised REST API authenticated by per-student API keys.

**Key design goals:**

- **Zero cloud cost** — all inference runs on college-owned GPUs
- **OpenAI-compatible API** — students use familiar SDKs; existing tutorials work unchanged
- **Scalable from day one** — starts on a single PC, scales horizontally to 30+ nodes with no code changes
- **Secure by default** — JWT authentication, role-based access, rate limiting, input/output guardrails
- **Academically useful** — RAG over college textbooks, web-grounded search, per-student usage tracking

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **API Gateway** | FastAPI (Python 3.11+) | Async, auto-docs (OpenAPI/Swagger), type-safe, fastest Python framework |
| **Database** | PostgreSQL 16 | ACID-compliant, battle-tested, excellent JSON support |
| **Cache / Rate Limiter** | Redis 7 | In-memory, sub-ms latency, native rate-limit primitives |
| **LLM Inference** | vLLM | PagedAttention, continuous batching, highest throughput for local GPUs |
| **Model Router / Proxy** | LiteLLM | Unified OpenAI-compatible proxy, load balancing, fallback routing |
| **Vector Database** | Qdrant | Purpose-built for embeddings, filtering, snapshotting |
| **Web Search** | SearXNG | Self-hosted meta-search, no API keys needed |
| **Reverse Proxy** | Nginx | TLS termination, request buffering, static file serving |
| **Containerisation** | Docker + Docker Compose | Reproducible deployments, one-command startup |
| **Frontend** | React + Tailwind CSS | Component-driven dashboard, responsive, fast |
| **Task Queue** | Celery + Redis | Background jobs: document ingestion, model downloads |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        College LAN                              │
│   Students / Faculty / Lab PCs                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS
                         ▼
              ┌─────────────────────┐
              │       Nginx         │
              │   Reverse Proxy     │
              │   TLS · Caching     │
              └─────────┬───────────┘
                        │
              ┌─────────▼───────────┐
              │      FastAPI        │
              │   API Gateway       │
              │  Auth · Routing     │
              │  Rate Limiting      │
              └───┬────┬────┬───┬──┘
                  │    │    │   │
         ┌────────┘    │    │   └────────┐
         ▼             ▼    ▼            ▼
   ┌──────────┐  ┌─────────────┐  ┌──────────┐
   │PostgreSQL│  │   LiteLLM   │  │  Qdrant  │
   │  Users   │  │   Proxy     │  │ VectorDB │
   │  Logs    │  │  Routing    │  │  (RAG)   │
   │  Keys    │  └──────┬──────┘  └──────────┘
   └──────────┘         │
                        ▼
              ┌─────────────────────┐
              │       vLLM          │
              │  Model Workers      │
              │  GPU Inference      │
              └─────────────────────┘
```

**Scaling model:** The entire stack is containerised. To scale from 1 PC to N PCs, new vLLM worker containers are added and registered in the LiteLLM config. The FastAPI gateway, database, and proxy remain centralised on the primary node. Zero code changes required.

---

## Build Phases — 8 Phases, Sequential

| # | Phase | Description | Dependencies |
|---|---|---|---|
| 1 | **API Endpoints** | Core REST API — explore, query, usage, auth | None |
| 2 | **LLM Models** | Select, download, feasibility-check, deploy 5 models | Phase 1 |
| 3 | **API–Model Integration** | Wire every model to its dedicated endpoint via LiteLLM + vLLM | Phase 1, 2 |
| 4 | **API Usage Control** | Rate limiting, token accounting, static + refresh API keys | Phase 1 |
| 5 | **Web Interface** | Dashboard, user management, admin panel, model access controls | Phase 1, 4 |
| 6 | **Guardrails** | Input + output content filtering, safety checks | Phase 3 |
| 7 | **Knowledgebase + RAG** | Vector DB, document ingestion, retrieval-augmented generation | Phase 3 |
| 8 | **Retrieval + Search** | SearXNG web search, Wikipedia, real-time grounded answers | Phase 3, 7 |

---

## Base URL

```
http://<server-ip>/api/v1
```

> The server IP is configured via environment variable `MAC_HOST`. No IP addresses are hardcoded anywhere in the codebase. For production, the Nginx reverse proxy terminates TLS and forwards to the FastAPI gateway.

---

# Phase 1 — API Endpoints

## 1.1 Authentication — `/auth`

Handles user login, session management, and JWT token lifecycle. All passwords are hashed with **bcrypt** (work factor 12). Tokens use **RS256** JWT signing.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/login` | Roll number + password → JWT access token + refresh token |
| `POST` | `/auth/logout` | Invalidate current session / revoke refresh token |
| `POST` | `/auth/refresh` | Exchange refresh token for a new access token |
| `GET` | `/auth/me` | Current user's profile, role, department, and API key |
| `POST` | `/auth/change-password` | Change password (requires current password verification) |

### Request — `POST /auth/login`

```json
{
  "roll_number": "21CS045",
  "password": "secure_password"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `roll_number` | string | Yes | Student/faculty roll number, e.g. `21CS045` |
| `password` | string | Yes | Account password (min 8 chars) |

### Response — `POST /auth/login`

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "dGhpcyBp...",
  "token_type": "bearer",
  "expires_in": 86400,
  "user": {
    "roll_number": "21CS045",
    "name": "Aryan Sharma",
    "department": "CSE",
    "role": "student",
    "api_key": "mac_sk_live_abc123..."
  }
}
```

| Field | Description |
|---|---|
| `access_token` | JWT, 24-hour expiry, used for all authenticated requests |
| `refresh_token` | 30-day expiry, used only at `/auth/refresh` |
| `user.role` | One of: `student`, `faculty`, `admin` |
| `user.api_key` | Personal API key for direct model queries |

---

## 1.2 Explore — `/explore`

Read-only discovery endpoints. Allow students to see what models and capabilities are available before writing code.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/explore/models` | List all deployed models with capabilities, context length, and status |
| `GET` | `/explore/models/{model_id}` | Detailed info — parameters, benchmarks, example prompts |
| `GET` | `/explore/models/search` | Search by capability tag: `?tag=vision`, `?tag=code`, `?tag=math` |
| `GET` | `/explore/endpoints` | List every API endpoint with method, path, auth requirement, description |
| `GET` | `/explore/health` | Platform health — node status, GPU temperatures, inference queue depth |
| `GET` | `/explore/usage-stats` | Aggregated platform analytics (admin-only) — tokens/day, active users |

### Response — `GET /explore/models`

```json
{
  "models": [
    {
      "id": "qwen2.5-coder-7b",
      "name": "Qwen2.5-Coder 7B",
      "specialty": "Code generation, debugging, explanation",
      "parameters": "7B",
      "context_length": 32768,
      "status": "loaded",
      "capabilities": ["code", "chat", "completion"]
    }
  ],
  "total": 5
}
```

### Response — `GET /explore/health`

```json
{
  "status": "healthy",
  "uptime_seconds": 345600,
  "nodes": [
    {
      "ip": "192.168.1.101",
      "gpu": "NVIDIA RTX 3060 12GB",
      "gpu_temp_c": 62,
      "vram_used_gb": 9.2,
      "vram_total_gb": 12.0,
      "requests_in_flight": 3,
      "status": "active"
    }
  ],
  "queue_depth": 7
}
```

---

## 1.3 Query — `/query`

The core inference API. All endpoints accept `Authorization: Bearer <api_key>` header. Responses follow the **OpenAI Chat Completions format** — existing OpenAI SDK code works with zero changes by swapping `base_url`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/query/chat` | Chat completion — multi-turn conversation (text/code/math) |
| `POST` | `/query/completions` | Raw text completion (OpenAI-compatible) |
| `POST` | `/query/vision` | Image + text → answer (vision model) |
| `POST` | `/query/speech-to-text` | Upload audio → transcribed text (Whisper) |
| `POST` | `/query/text-to-speech` | Text → audio file download (TTS) |
| `POST` | `/query/embeddings` | Text → vector embedding (for RAG / similarity search) |
| `POST` | `/query/rerank` | Re-rank passages by relevance to a query |

### Request — `POST /query/chat`

```json
{
  "model": "auto",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Write a Python function to reverse a linked list."}
  ],
  "temperature": 0.7,
  "max_tokens": 2048,
  "stream": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | Yes | Model ID or `"auto"` for smart routing |
| `messages` | array | Yes | Array of `{role, content}` — system / user / assistant |
| `temperature` | float | No | Sampling temperature 0.0–2.0 (default `0.7`) |
| `max_tokens` | integer | No | Max tokens to generate (default `2048`, max `4096`) |
| `stream` | boolean | No | Stream tokens as Server-Sent Events (default `false`) |
| `context_id` | string | No | Maintain conversation state server-side |

### Response — `POST /query/chat`

```json
{
  "id": "mac-chat-a1b2c3d4",
  "object": "chat.completion",
  "created": 1743984000,
  "model": "qwen2.5-coder-7b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Here's a Python function to reverse a linked list..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 187,
    "total_tokens": 229
  }
}
```

### Smart Routing (`model: "auto"`)

When students set `model` to `"auto"`, the API gateway inspects the request and routes to the optimal model:

| Signal Detected | Routed To |
|---|---|
| Code keywords, programming language names, `write a function`, `debug this` | `qwen2.5-coder-7b` |
| Math expressions, equations, `solve`, `prove`, `step by step` | `deepseek-r1-8b` |
| Image attachment in request body | `llava-1.6-7b` |
| Audio file upload | `whisper-large-v3` |
| General text, summarisation, writing, Q&A | `qwen2.5-14b` |

---

## 1.4 Usage — `/usage`

Per-student consumption tracking. Every API call logs token counts, model used, and timestamp.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/usage/me` | My tokens used — today, this week, this month, broken down by model |
| `GET` | `/usage/me/history` | Full request history — timestamps, models, token counts, latency |
| `GET` | `/usage/me/quota` | My current quota limits and remaining balance |
| `GET` | `/usage/admin/all` | All users' usage summary (admin-only) |
| `GET` | `/usage/admin/user/{roll_number}` | Specific student's full usage details (admin-only) |
| `GET` | `/usage/admin/models` | Per-model usage statistics across the platform (admin-only) |

### Response — `GET /usage/me`

```json
{
  "roll_number": "21CS045",
  "usage": {
    "today": {
      "total_tokens": 12450,
      "requests": 23,
      "by_model": {
        "qwen2.5-coder-7b": {"tokens": 8200, "requests": 15},
        "qwen2.5-14b": {"tokens": 4250, "requests": 8}
      }
    },
    "this_week": {"total_tokens": 67800, "requests": 142},
    "this_month": {"total_tokens": 234500, "requests": 487}
  },
  "quota": {
    "daily_limit": 50000,
    "remaining_today": 37550
  }
}
```

---

# Phase 2 — LLM Models

## 2.1 Model Selection

Five best-in-class open-source models, each a domain specialist. All models are quantised to fit within consumer GPU VRAM.

| Model ID | Name | Specialty | Parameters | VRAM Required | Quantisation |
|---|---|---|---|---|---|
| `qwen2.5-coder-7b` | Qwen2.5-Coder 7B | Code generation, debugging, explanation | 7B | ~5 GB | GPTQ-Int4 |
| `deepseek-r1-8b` | DeepSeek-R1 8B | Maths, reasoning, step-by-step logic | 8B | ~6 GB | AWQ-Int4 |
| `llava-1.6-7b` | LLaVA 1.6 7B | Image understanding, visual Q&A | 7B | ~8 GB | FP16 |
| `whisper-large-v3` | Whisper Large v3 | Speech-to-text, transcription | 1.5B | ~3 GB | FP16 |
| `qwen2.5-14b` | Qwen2.5 14B | General chat, summarisation, writing | 14B | ~10 GB | GPTQ-Int4 |

**Total VRAM for all 5 models:** ~32 GB (fits on dual-GPU setups or loads models on demand)

### Feasibility on Single PC

For a single-PC deployment with one GPU (e.g., RTX 3060 12GB or RTX 4070 16GB):
- Models are loaded/unloaded on demand — only the requested model occupies VRAM at inference time
- A model loading queue ensures graceful transitions
- Frequently-used models remain resident; idle models are evicted after a configurable timeout

## 2.2 Model Management Endpoints — `/models`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/models` | List all models with status: `loaded` / `downloading` / `queued` / `offline` |
| `GET` | `/models/{model_id}` | Single model details — context length, capabilities, benchmark scores |
| `POST` | `/models/{model_id}/load` | Load model into GPU memory (admin-only) |
| `POST` | `/models/{model_id}/unload` | Unload model from VRAM to free resources (admin-only) |
| `GET` | `/models/{model_id}/health` | Ping model — returns latency, memory usage, ready status |
| `POST` | `/models/download` | Download a model from HuggingFace by ID (admin-only) |
| `GET` | `/models/download/{task_id}` | Check download progress for a model download task |

### Response — `GET /models`

```json
{
  "models": [
    {
      "id": "qwen2.5-coder-7b",
      "name": "Qwen2.5-Coder 7B",
      "status": "loaded",
      "vram_mb": 5120,
      "context_length": 32768,
      "capabilities": ["code", "chat"],
      "loaded_at": "2026-04-07T08:30:00Z"
    },
    {
      "id": "deepseek-r1-8b",
      "name": "DeepSeek-R1 8B",
      "status": "offline",
      "vram_mb": 6144,
      "context_length": 65536,
      "capabilities": ["reasoning", "math", "chat"],
      "loaded_at": null
    }
  ]
}
```

---

# Phase 3 — API–Model Integration

## 3.1 Architecture

**LiteLLM Proxy** sits between the FastAPI gateway and vLLM workers. It:

1. Translates every `/query` request into the correct vLLM inference call
2. Handles smart routing (auto-model selection)
3. Load-balances across multiple workers (when scaled)
4. Retries on worker failure with exponential backoff
5. Returns OpenAI-compatible JSON responses

```
FastAPI Gateway  ──►  LiteLLM Proxy  ──►  vLLM Worker(s)
                      (routing +           (GPU inference)
                       load balance)
```

## 3.2 Integration Endpoints — `/integration`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/integration/routing-rules` | Show current routing rules (which task type → which model) |
| `PUT` | `/integration/routing-rules` | Update routing rules (admin-only) |
| `GET` | `/integration/workers` | List all vLLM worker nodes and their current load |
| `GET` | `/integration/workers/{node_id}` | Single worker — GPU temp, VRAM used, requests in flight |
| `POST` | `/integration/workers/{node_id}/drain` | Mark worker as draining — no new requests routed (admin-only) |
| `GET` | `/integration/queue` | Current global inference queue depth across all workers |

### Response — `GET /integration/routing-rules`

```json
{
  "rules": [
    {"task": "code", "keywords": ["function", "debug", "code", "python", "javascript"], "model": "qwen2.5-coder-7b", "priority": 1},
    {"task": "math", "keywords": ["solve", "equation", "prove", "integral"], "model": "deepseek-r1-8b", "priority": 2},
    {"task": "vision", "trigger": "image_attachment", "model": "llava-1.6-7b", "priority": 3},
    {"task": "speech", "trigger": "audio_upload", "model": "whisper-large-v3", "priority": 4},
    {"task": "general", "trigger": "default", "model": "qwen2.5-14b", "priority": 99}
  ]
}
```

## 3.3 Scaling Strategy

| Deployment | Configuration |
|---|---|
| **Single PC** | One vLLM process, models loaded/swapped on demand |
| **2–5 PCs** | Each PC runs a vLLM worker with 1–2 dedicated models; LiteLLM routes by model |
| **6–30 PCs** | Multiple workers per model for redundancy; least-busy routing; auto-failover |

All worker addresses are stored in configuration (environment variables / config file) — **no IPs are hardcoded**. Adding a new node requires only updating the LiteLLM config and restarting the proxy.

---

# Phase 4 — API Usage Control

## 4.1 API Key Management — `/keys`

Every student receives a unique API key upon account creation. Two key types are supported:

| Key Type | Behaviour |
|---|---|
| **Static** | Never expires. Manually rotated by the student or admin. Ideal for quick experiments. |
| **Refresh** | Auto-rotates every 30 days. Old key has a 48-hour grace period. Ideal for long-running scripts. |

Key format: `mac_sk_live_<32-char-random-hex>`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/keys/my-key` | Get current API key (partially masked) and metadata |
| `POST` | `/keys/generate` | Generate a new API key (invalidates the previous one) |
| `GET` | `/keys/my-key/stats` | Tokens consumed against this key — today, week, month |
| `DELETE` | `/keys/my-key` | Revoke current key permanently (must re-generate) |
| `GET` | `/keys/admin/all` | List all student API keys and status (admin-only) |
| `POST` | `/keys/admin/revoke` | Force-revoke a specific student's API key (admin-only) |

### Response — `GET /keys/my-key`

```json
{
  "key": "mac_sk_live_a1b2...****",
  "type": "refresh",
  "created_at": "2026-03-01T10:00:00Z",
  "expires_at": "2026-03-31T10:00:00Z",
  "last_used": "2026-04-07T14:23:00Z",
  "status": "active",
  "total_requests": 487
}
```

## 4.2 Rate Limiting & Quotas — `/quota`

Rate limits are enforced at the **Redis layer** using a sliding-window algorithm. Limits are per-role and can be overridden per-user.

| Role | Daily Token Limit | Requests/Hour | Max Tokens/Request |
|---|---|---|---|
| **Student** | 50,000 | 100 | 4,096 |
| **Faculty** | 200,000 | 500 | 8,192 |
| **Admin** | Unlimited | Unlimited | 16,384 |

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/quota/limits` | Show default quota limits per role |
| `GET` | `/quota/me` | My personal limits and current consumption |
| `PUT` | `/quota/admin/user/{roll_number}` | Override quota for a specific user (admin-only) |
| `GET` | `/quota/admin/exceeded` | List users who have exceeded their daily quota (admin-only) |

### Response — `GET /quota/me`

```json
{
  "role": "student",
  "limits": {
    "daily_tokens": 50000,
    "requests_per_hour": 100,
    "max_tokens_per_request": 4096
  },
  "current": {
    "tokens_used_today": 12450,
    "requests_this_hour": 8,
    "remaining_tokens": 37550,
    "resets_at": "2026-04-08T00:00:00Z"
  }
}
```

### Rate Limit Response Headers

Every API response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 92
X-RateLimit-Reset: 1743987600
X-TokenLimit-Limit: 50000
X-TokenLimit-Remaining: 37550
X-TokenLimit-Reset: 1744070400
```

When a limit is exceeded, the API returns:

```json
HTTP 429 Too Many Requests
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "You have exceeded your hourly request limit. Try again in 847 seconds.",
    "retry_after": 847
  }
}
```

---

# Phase 5 — Web Interface

A React-based single-page application served by the FastAPI backend. Three views: **Student Dashboard**, **Key Management**, and **Admin Panel**.

## 5.1 Web Interface Endpoints — `/ui`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ui/dashboard` | Student home — usage chart, quick-start code snippets, model status cards |
| `GET` | `/ui/keys` | Key management — view, copy, regenerate API key |
| `GET` | `/ui/history` | Request history table — timestamp, model, tokens, latency, status |
| `GET` | `/ui/playground` | Interactive chat playground — test models directly in the browser |

## 5.2 Admin Panel — `/ui/admin`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ui/admin/users` | Full user list with roles, quotas, last active, status |
| `POST` | `/ui/admin/users/create` | Create user / bulk-create from CSV (roll no., name, department) |
| `PUT` | `/ui/admin/users/{roll_number}` | Edit user — change role, quota overrides, model access |
| `DELETE` | `/ui/admin/users/{roll_number}` | Deactivate a user account |
| `GET` | `/ui/admin/models` | Model management — load/unload, see which node serves what |
| `GET` | `/ui/admin/logs` | Live request logs — error rates, latency percentiles, throughput |
| `GET` | `/ui/admin/analytics` | Platform analytics — daily active users, peak hours, top models |

### Dashboard Wireframe

```
┌──────────────────────────────────────────────────────┐
│  MAC — MBM AI Cloud                    [Profile ▼]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Tokens  │  │Requests │  │  Quota  │              │
│  │  Today  │  │  Today  │  │Remaining│              │
│  │ 12,450  │  │   23    │  │  75.1%  │              │
│  └─────────┘  └─────────┘  └─────────┘              │
│                                                      │
│  Models Available          Quick Start               │
│  ┌──────────────────┐     ┌────────────────────┐    │
│  │ ✅ Qwen2.5-Coder │     │  from openai import │    │
│  │ ✅ DeepSeek-R1   │     │  OpenAI             │    │
│  │ ✅ Qwen2.5 14B   │     │  client = OpenAI(   │    │
│  │ ⏳ LLaVA (load.) │     │    base_url=        │    │
│  │ ✅ Whisper       │     │    "http://mac/v1", │    │
│  └──────────────────┘     │    api_key="mac_sk_" │    │
│                           │  )                   │    │
│  Usage This Week          └────────────────────┘    │
│  ┌──────────────────┐                               │
│  │ ▁▃▅▇▅▃▁ (chart) │                               │
│  └──────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

---

# Phase 6 — Guardrails

Input and output content filtering to ensure safe, appropriate use of AI models within an academic environment.

## 6.1 Guardrails Endpoints — `/guardrails`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/guardrails/check-input` | Run input text through content filter before sending to model |
| `POST` | `/guardrails/check-output` | Run model output through safety filter before returning to user |
| `GET` | `/guardrails/rules` | List active guardrail rules (admin-only) |
| `PUT` | `/guardrails/rules` | Update rules — blocked categories, max prompt length (admin-only) |

## 6.2 Filtering Pipeline

```
User Input  ──►  Input Filter  ──►  Model Inference  ──►  Output Filter  ──►  Response
                 │                                        │
                 ├─ Prompt injection detection             ├─ PII/sensitive data redaction
                 ├─ Blocked topic detection                ├─ Harmful content detection
                 ├─ Max prompt length enforcement           ├─ Hallucination disclaimer
                 └─ Academic integrity checks               └─ Source attribution
```

### Guardrail Categories

| Category | Action | Description |
|---|---|---|
| **Prompt Injection** | Block + log | Detect attempts to override system prompts |
| **Harmful Content** | Block | Violence, self-harm, illegal activities |
| **Academic Dishonesty** | Flag + disclaimer | Full essay/assignment generation adds academic integrity notice |
| **PII in Output** | Redact | Strip emails, phone numbers, addresses from model output |
| **Max Prompt Length** | Reject | Configurable per-role; prevents resource abuse |

### Request — `POST /guardrails/check-input`

```json
{
  "text": "User input to check",
  "context": "chat"
}
```

### Response

```json
{
  "safe": true,
  "flags": [],
  "modified_text": null
}
```

---

# Phase 7 — Knowledgebase + RAG

Retrieval-Augmented Generation over college textbooks, course materials, and reference documents. Students can ask questions grounded in actual course content.

## 7.1 RAG Endpoints — `/rag`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/rag/ingest` | Upload PDF / DOCX / TXT — chunk, embed, store in Qdrant vector DB |
| `GET` | `/rag/documents` | List all ingested documents with metadata (title, pages, chunk count) |
| `GET` | `/rag/documents/{id}` | Single document details and its chunks |
| `DELETE` | `/rag/documents/{id}` | Remove a document from the knowledgebase (admin-only) |
| `POST` | `/rag/query` | Ask a question — retrieves top-k relevant chunks → sends to LLM with context |
| `GET` | `/rag/query/{query_id}/sources` | Get source citations for a RAG response |
| `POST` | `/rag/collections` | Create a named collection (e.g., "DSA", "DBMS", "OS") (admin-only) |
| `GET` | `/rag/collections` | List all collections |

## 7.2 RAG Pipeline

```
Document Upload  ──►  Chunking (512 tokens, 50 overlap)
                              │
                              ▼
                      Embedding (768-dim)
                              │
                              ▼
                      Qdrant Vector DB
                              │
     User Question  ──►  Embed Query  ──►  Similarity Search (top-k=5)
                                                    │
                                                    ▼
                                          Retrieved Chunks + Question
                                                    │
                                                    ▼
                                              LLM Generation
                                                    │
                                                    ▼
                                          Answer with Citations
```

### Request — `POST /rag/query`

```json
{
  "question": "Explain the difference between process and thread in operating systems",
  "collection": "OS",
  "top_k": 5,
  "model": "auto"
}
```

### Response — `POST /rag/query`

```json
{
  "answer": "A process is an independent program in execution with its own memory space...",
  "sources": [
    {
      "document": "Galvin - Operating System Concepts, 10th Ed",
      "chapter": "Chapter 3: Processes",
      "page": 105,
      "relevance_score": 0.92,
      "chunk_preview": "A process is a program in execution. A process is more than..."
    },
    {
      "document": "Galvin - Operating System Concepts, 10th Ed",
      "chapter": "Chapter 4: Threads",
      "page": 163,
      "relevance_score": 0.89,
      "chunk_preview": "A thread is a basic unit of CPU utilization..."
    }
  ],
  "model_used": "qwen2.5-14b",
  "tokens_used": 847
}
```

---

# Phase 8 — Retrieval + Search

Real-time web grounding via self-hosted SearXNG. Enables the platform to answer questions about current events, recent research, and topics not covered in the knowledgebase.

## 8.1 Search Endpoints — `/search`

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/search/web` | Query SearXNG — aggregates results from Google, Bing, DuckDuckGo, Wikipedia |
| `POST` | `/search/wikipedia` | Targeted Wikipedia search with summary extraction |
| `POST` | `/search/grounded` | Search + LLM — retrieves web results, then generates a cited answer |
| `GET` | `/search/cache` | List recently cached search results (reduces redundant fetches) |

### Request — `POST /search/grounded`

```json
{
  "query": "What are the latest improvements in vLLM v0.8?",
  "max_sources": 5,
  "model": "auto"
}
```

### Response — `POST /search/grounded`

```json
{
  "answer": "vLLM v0.8 introduced several key improvements including...",
  "sources": [
    {
      "title": "vLLM v0.8.0 Release Notes",
      "url": "https://github.com/vllm-project/vllm/releases",
      "snippet": "Key features: improved prefix caching, multi-modal support..."
    }
  ],
  "model_used": "qwen2.5-14b",
  "cached": false
}
```

---

# Database Schema

## Entity-Relationship Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│    users     │       │  api_keys   │       │  request_logs   │
├─────────────┤       ├─────────────┤       ├─────────────────┤
│ id (PK)     │──┐    │ id (PK)     │       │ id (PK)         │
│ roll_number │  ├───►│ user_id(FK) │   ┌──►│ user_id (FK)    │
│ name        │  │    │ key_hash    │   │   │ api_key_id (FK) │
│ department  │  │    │ key_prefix  │   │   │ model           │
│ role        │  │    │ type        │   │   │ endpoint        │
│ password    │  │    │ is_active   │   │   │ tokens_in       │
│ is_active   │  │    │ created_at  │   │   │ tokens_out      │
│ created_at  │  │    │ expires_at  │   │   │ latency_ms      │
│ updated_at  │  │    │ last_used   │   │   │ status_code     │
└─────────────┘  │    └─────────────┘   │   │ created_at      │
                 │                      │   └─────────────────┘
                 └──────────────────────┘
                 
┌──────────────────┐       ┌─────────────────┐
│  quota_overrides │       │  rag_documents  │
├──────────────────┤       ├─────────────────┤
│ id (PK)          │       │ id (PK)         │
│ user_id (FK)     │       │ title           │
│ daily_tokens     │       │ collection      │
│ requests_per_hr  │       │ file_type       │
│ max_tokens_req   │       │ chunk_count     │
│ set_by (FK)      │       │ uploaded_by(FK) │
│ created_at       │       │ created_at      │
└──────────────────┘       └─────────────────┘
```

## SQL Schema — Key Tables

### users

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number     VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    department      VARCHAR(50) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student', 'faculty', 'admin')),
    hashed_password VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### api_keys

```sql
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash    VARCHAR(255) NOT NULL,
    key_prefix  VARCHAR(20) NOT NULL,
    type        VARCHAR(10) NOT NULL DEFAULT 'static'
                CHECK (type IN ('static', 'refresh')),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    last_used   TIMESTAMPTZ
);
```

### request_logs

```sql
CREATE TABLE request_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    api_key_id  UUID REFERENCES api_keys(id),
    model       VARCHAR(50) NOT NULL,
    endpoint    VARCHAR(100) NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    latency_ms  INTEGER,
    status_code SMALLINT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_request_logs_user_date ON request_logs (user_id, created_at);
CREATE INDEX idx_request_logs_model ON request_logs (model, created_at);
```

---

# Project Folder Structure

```
mac/
├── api/
│   ├── main.py                 # FastAPI application entry point
│   ├── routers/
│   │   ├── auth.py             # /auth endpoints
│   │   ├── explore.py          # /explore endpoints
│   │   ├── query.py            # /query endpoints
│   │   ├── usage.py            # /usage endpoints
│   │   ├── keys.py             # /keys endpoints
│   │   ├── models.py           # /models endpoints
│   │   ├── integration.py      # /integration endpoints
│   │   ├── quota.py            # /quota endpoints
│   │   ├── guardrails.py       # /guardrails endpoints
│   │   ├── rag.py              # /rag endpoints
│   │   └── search.py           # /search endpoints
│   ├── models/
│   │   ├── user.py             # SQLAlchemy User model
│   │   ├── api_key.py          # APIKey model
│   │   ├── request_log.py      # RequestLog model
│   │   └── document.py         # RAG Document model
│   ├── schemas/
│   │   ├── auth.py             # Pydantic request/response schemas
│   │   ├── query.py            # Chat, completions, vision schemas
│   │   ├── usage.py            # Usage response schemas
│   │   └── common.py           # Shared schemas (pagination, errors)
│   ├── core/
│   │   ├── config.py           # Settings from environment variables
│   │   ├── security.py         # JWT creation/validation, password hashing
│   │   ├── rate_limit.py       # Redis-based sliding window rate limiter
│   │   ├── dependencies.py     # FastAPI dependency injection (get_current_user, etc.)
│   │   └── db.py               # Database session factory
│   ├── services/
│   │   ├── model_router.py     # Smart routing logic (auto model selection)
│   │   ├── inference.py        # LiteLLM client for model calls
│   │   ├── usage_tracker.py    # Token counting and logging
│   │   ├── guardrails.py       # Input/output filtering logic
│   │   └── rag.py              # Document ingestion, embedding, retrieval
│   └── requirements.txt
├── litellm/
│   └── config.yaml             # LiteLLM proxy routing configuration
├── nginx/
│   └── nginx.conf              # Reverse proxy configuration
├── frontend/
│   ├── src/
│   │   ├── pages/              # Dashboard, Keys, History, Admin pages
│   │   ├── components/         # Reusable UI components
│   │   └── api/                # API client (Axios/fetch wrappers)
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   ├── seed_users.py           # Bulk-create students from CSV
│   ├── download_models.py      # Pull models from HuggingFace
│   └── health_check.py         # Verify all services are running
├── docker-compose.yml          # Full stack: api, db, redis, litellm, nginx, qdrant
├── Dockerfile                  # FastAPI container
├── .env.example                # Template for environment variables
├── alembic/                    # Database migrations
│   └── versions/
└── README.md
```

---

# Security Design

| Concern | Implementation |
|---|---|
| **Password Storage** | bcrypt with work factor 12; passwords never stored in plaintext |
| **JWT Signing** | RS256 asymmetric keys; access tokens short-lived (24h) |
| **API Key Storage** | Only SHA-256 hash stored in DB; raw key shown once at creation |
| **Transport** | Nginx terminates TLS (HTTPS); internal services communicate over Docker network |
| **Input Validation** | Pydantic schema validation on every request; max payload size enforced |
| **SQL Injection** | SQLAlchemy ORM with parameterised queries throughout |
| **Rate Limiting** | Redis sliding-window per user + per IP; prevents abuse and DoS |
| **CORS** | Strict origin allowlist — only the MAC frontend domain |
| **Admin Endpoints** | Role-based access control; admin-only routes check JWT role claim |
| **Prompt Injection** | Input guardrails detect and block prompt override attempts |
| **Secrets Management** | All secrets in `.env` file; never committed to version control |

---

# Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "authentication_failed",
    "message": "Invalid roll number or password.",
    "status": 401,
    "timestamp": "2026-04-07T14:30:00Z",
    "request_id": "mac-req-a1b2c3"
  }
}
```

### Standard Error Codes

| HTTP Status | Code | Description |
|---|---|---|
| 400 | `bad_request` | Malformed request body or invalid parameters |
| 401 | `authentication_failed` | Missing or invalid credentials / API key |
| 403 | `forbidden` | Valid auth but insufficient role permissions |
| 404 | `not_found` | Resource does not exist |
| 409 | `conflict` | Duplicate resource (e.g., user already exists) |
| 422 | `validation_error` | Request schema validation failed |
| 429 | `rate_limit_exceeded` | Request or token quota exceeded |
| 500 | `internal_error` | Unexpected server error |
| 503 | `model_unavailable` | Requested model is not loaded or all workers are busy |

---

# Deployment Configuration

## Environment Variables (`.env`)

```env
# Server
MAC_HOST=0.0.0.0
MAC_PORT=8000
MAC_ENV=production

# Database
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=mac
POSTGRES_USER=mac_admin
POSTGRES_PASSWORD=<generated-secret>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT
JWT_PRIVATE_KEY_PATH=/run/secrets/jwt_private.pem
JWT_PUBLIC_KEY_PATH=/run/secrets/jwt_public.pem
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30

# LiteLLM
LITELLM_PROXY_URL=http://litellm:4000
LITELLM_MASTER_KEY=<generated-secret>

# Qdrant
QDRANT_HOST=qdrant
QDRANT_PORT=6333

# Models
MODEL_STORAGE_PATH=/models
DEFAULT_MODEL=qwen2.5-14b
```

## Docker Compose Services

| Service | Image | Ports | Purpose |
|---|---|---|---|
| `api` | Custom (Dockerfile) | 8000 | FastAPI gateway |
| `db` | postgres:16-alpine | 5432 | User data, logs, keys |
| `redis` | redis:7-alpine | 6379 | Rate limiting, caching |
| `litellm` | ghcr.io/berriai/litellm | 4000 | Model proxy + routing |
| `qdrant` | qdrant/qdrant | 6333 | Vector database (RAG) |
| `searxng` | searxng/searxng | 8888 | Web search engine |
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy + TLS |

---

# API Versioning & Compatibility

- All endpoints are prefixed with `/api/v1`
- The `/query` endpoints return **OpenAI-compatible JSON** — any OpenAI SDK works by changing `base_url`
- Breaking changes will increment the version (`/api/v2`) while maintaining the previous version for one semester
- Response pagination follows cursor-based pagination for list endpoints

### OpenAI SDK Compatibility Example

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://mac-server/api/v1",
    api_key="mac_sk_live_your_key_here"
)

response = client.chat.completions.create(
    model="auto",
    messages=[
        {"role": "user", "content": "Explain binary search in Python"}
    ]
)

print(response.choices[0].message.content)
```

---

# Summary

MAC (MBM AI Cloud) delivers a production-grade, self-hosted AI platform that gives every student access to state-of-the-art AI models at zero recurring cost. The 8-phase build plan ensures a solid foundation before adding advanced features, and the architecture scales from a single lab PC to 30+ machines without rewriting a single line of code.

**Phase 1** (API + Models + Integration + Usage Control) establishes the complete backend — once deployed, students can start querying AI models from their laptops on day one.

---

*MAC — MBM AI Cloud · API Design Document · Version 1.0 · 07 April 2026*
