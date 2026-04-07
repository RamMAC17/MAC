<p align="center">
  <img src="logo.png" alt="MAC — MBM AI Cloud" width="200">
</p>

<h1 align="center">MAC — MBM AI Cloud</h1>

<p align="center">
  Self-hosted AI inference platform. Run open-source LLMs on your own hardware<br>and expose them as an OpenAI-compatible API.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white" alt="SQLAlchemy">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License">
</p>

---

Any PC with a GPU (or even CPU) can become an AI cloud node. Students, developers, and teams can use familiar tools -- OpenAI SDK, curl, or the built-in PWA -- to access models locally.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Smart Routing](#smart-routing)
- [Rate Limiting](#rate-limiting)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Adding Models](#adding-models)
- [Development](#development)
- [Tech Stack](#tech-stack)
- [Project Phases](#project-phases)
- [License](#license)

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | API server |
| Ollama | Latest | Runs AI models locally |
| Git | Any | Clone the repo |

Optional (for production): Docker, PostgreSQL, Redis, Nginx, Qdrant, SearXNG.

### 1. Install Ollama and Pull a Model

```bash
# Install Ollama — https://ollama.ai
# Then pull a model:
ollama pull qwen2.5-coder:7b    # 4.4 GB — code generation
ollama pull qwen2.5:14b          # 8.9 GB — general chat
ollama pull deepseek-r1:8b       # 4.9 GB — math/reasoning
ollama pull llava:7b              # 4.7 GB — vision / image analysis
```

### 2. Clone and Setup

```bash
git clone https://github.com/rampypi/mac.git
cd mac

python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
```

### 3. Run

```bash
# Make sure Ollama is running (in another terminal):
ollama serve

# Start MAC:
uvicorn mac.main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs` for the full interactive API documentation.

### 4. Test It

```bash
curl -X POST http://localhost:8000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS001", "date_of_birth": "2003-01-15"}'

curl -X POST http://localhost:8000/api/v1/query/chat \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Write hello world in Python"}]
  }'
```

**OpenAI SDK compatible:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/api/v1/query",
    api_key="YOUR_API_KEY"
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain quicksort"}]
)
print(response.choices[0].message.content)
```

---

## Architecture

```
                         Clients
          (OpenAI SDK / curl / PWA / Mobile)
                           |
                           v
                    +-----------+
                    |   Nginx   |  Reverse proxy, SSL
                    +-----+-----+
                          |
                          v
                    +-----------+
                    |  MAC API  |  FastAPI (auth, smart routing,
                    |  (Python) |  guardrails, usage tracking)
                    +-----+-----+
                          |
        +--------+--------+--------+--------+
        v        v        v        v        v
    +--------+ +------+ +------+ +------+ +--------+
    | Ollama | | Redis| |Qdrant| |SearX | |LiteLLM |
    | (LLMs) | |(cache| |(vec- | |  NG  | |(proxy) |
    | GPU/CPU| | rate)| |tor DB| |(web) | |        |
    +--------+ +------+ +------+ +------+ +--------+
        |
    +---+-----+
    v         v
 +--------+ +--------+
 |Postgres| | SQLite |
 | (prod) | |  (dev) |
 +--------+ +--------+
```

### Scaling to Multiple PCs

Each PC runs Ollama independently. To add a new node:

1. Install Ollama on the new PC
2. Pull the models you want on that PC
3. Register it via `POST /api/v1/integration/workers`
4. MAC routes requests across all available nodes using smart routing rules

```
PC-1 (Your PC)          PC-2 (Lab Server)       PC-3 (Faculty PC)
+-- MAC API             +-- Ollama               +-- Ollama
+-- Ollama              |   +-- qwen2.5:14b      |   +-- deepseek-r1:8b
|   +-- qwen2.5-coder   |   +-- llava:7b         |   +-- whisper-large-v3
+-- PostgreSQL          |                        |
+-- Redis               +-- (model server only)  +-- (model server only)
+-- Qdrant (RAG)
+-- SearXNG (search)
```

---

## API Reference

All endpoints are prefixed with `/api/v1`. Full interactive docs at `/docs` (Swagger) and `/redoc`.

### Authentication -- `/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/verify` | No | Verify with roll number + DOB |
| POST | `/auth/logout` | JWT | Revoke refresh tokens |
| POST | `/auth/refresh` | No | Get new access token |
| GET | `/auth/me` | JWT/Key | User profile and quota |
| POST | `/auth/change-password` | JWT | Change password |

### Explore -- `/explore` (public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explore/models` | List all available models |
| GET | `/explore/models/search?tag=code` | Search by capability |
| GET | `/explore/models/{id}` | Model details |
| GET | `/explore/endpoints` | List all API endpoints |
| GET | `/explore/health` | Platform health and uptime |

### Query -- `/query` (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/query/chat` | Chat completion (OpenAI-compatible, streaming) |
| POST | `/query/completions` | Text completion |
| POST | `/query/embeddings` | Generate vector embeddings |
| POST | `/query/rerank` | Re-rank documents by relevance |
| POST | `/query/vision` | Vision -- image analysis (LLaVA) |
| POST | `/query/speech-to-text` | Speech-to-text (Whisper) |

### Usage -- `/usage` (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/usage/me` | My token usage |
| GET | `/usage/me/history` | Request history |
| GET | `/usage/me/quota` | Quota limits |
| GET | `/usage/admin/all` | All users (admin) |
| GET | `/usage/admin/models` | Per-model stats (admin) |

### Model Management -- `/models`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/models` | JWT | List models with status |
| GET | `/models/{id}` | JWT | Model details and health |
| POST | `/models/{id}/load` | Admin | Load model into GPU |
| POST | `/models/{id}/unload` | Admin | Unload model from GPU |
| GET | `/models/{id}/health` | JWT | Model health metrics |
| POST | `/models/download` | Admin | Download a new model |
| GET | `/models/download/{task_id}` | Admin | Download progress |

### Integration -- `/integration`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/integration/routing-rules` | JWT | View smart routing rules |
| PUT | `/integration/routing-rules` | Admin | Update routing rules |
| GET | `/integration/workers` | JWT | List worker nodes |
| GET | `/integration/workers/{id}` | JWT | Worker details |
| POST | `/integration/workers/{id}/drain` | Admin | Drain a worker node |
| GET | `/integration/queue` | JWT | Queue status |

### API Keys -- `/keys`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/keys/my-key` | JWT | Get your API key |
| POST | `/keys/generate` | JWT | Generate a new API key |
| GET | `/keys/my-key/stats` | JWT | API key usage stats |
| DELETE | `/keys/my-key` | JWT | Revoke your API key |
| GET | `/keys/admin/all` | Admin | All API keys |
| POST | `/keys/admin/revoke` | Admin | Revoke a user's key |

### Quota Management -- `/quota`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/quota/limits` | JWT | Default quota limits by role |
| GET | `/quota/me` | JWT | Your current quota status |
| PUT | `/quota/admin/user/{roll}` | Admin | Override user quota |
| GET | `/quota/admin/exceeded` | Admin | Users exceeding quotas |

### Guardrails -- `/guardrails`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/guardrails/check-input` | JWT | Check input for policy violations |
| POST | `/guardrails/check-output` | JWT | Check output for PII/safety |
| GET | `/guardrails/rules` | Admin | List guardrail rules |
| PUT | `/guardrails/rules` | Admin | Update guardrail rules |

### RAG (Knowledge Base) -- `/rag`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/rag/ingest` | JWT | Upload document to knowledge base |
| GET | `/rag/documents` | JWT | List ingested documents |
| GET | `/rag/documents/{id}` | JWT | Document details |
| DELETE | `/rag/documents/{id}` | Admin | Delete a document |
| POST | `/rag/query` | JWT | RAG-augmented query |
| GET | `/rag/query/{id}/sources` | JWT | Source chunks for a query |
| POST | `/rag/collections` | Admin | Create document collection |
| GET | `/rag/collections` | JWT | List collections |

### Search -- `/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/search/web` | JWT | Web search via SearXNG |
| POST | `/search/wikipedia` | JWT | Wikipedia search |
| POST | `/search/grounded` | JWT | Search + LLM grounded answer |
| GET | `/search/cache` | JWT | Search cache stats |

---

## Smart Routing

When `model` is set to `"auto"`, MAC automatically selects the best model based on prompt content:

| Keywords in Prompt | Routed To |
|----|-----|
| code, python, function, debug, algorithm | `qwen2.5-coder:7b` |
| math, equation, integral, prove, calculus | `deepseek-r1:8b` |
| General questions | `qwen2.5:14b` |
| Image attached via `/query/vision` | `llava:7b` |

Customize routing rules via `PUT /api/v1/integration/routing-rules`.

---

## Rate Limiting

Every authenticated response includes rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Used: 13
X-TokenLimit-Limit: 50000
X-TokenLimit-Remaining: 42500
X-TokenLimit-Used: 7500
```

Default limits by role:

| Role | Requests/Hour | Tokens/Day |
|------|---------------|------------|
| Student | 100 | 50,000 |
| Faculty | 300 | 200,000 |
| Admin | Unlimited | Unlimited |

Admins can override limits per user via `PUT /api/v1/quota/admin/user/{roll}`.

---

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./mac.db` | Database connection string |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database |
| `SEARXNG_URL` | `http://localhost:8888` | SearXNG search engine |
| `JWT_SECRET_KEY` | (must change) | Secret for JWT signing |
| `RATE_LIMIT_REQUESTS_PER_HOUR` | `100` | Max requests per hour per user |
| `RATE_LIMIT_TOKENS_PER_DAY` | `50000` | Max tokens per day per user |

For production, use PostgreSQL and set strong secrets:

```bash
DATABASE_URL=postgresql+asyncpg://mac:strongpassword@localhost:5432/mac_db
JWT_SECRET_KEY=$(openssl rand -hex 32)
MAC_SECRET_KEY=$(openssl rand -hex 32)
```

---

## Docker Deployment

```bash
docker compose up -d
docker compose logs -f mac
docker compose down
```

| Service | Port | Purpose |
|---------|------|---------|
| MAC API | 8000 | Main API server |
| PostgreSQL | 5432 | Relational database |
| Redis | 6379 | Caching and rate limiting |
| Nginx | 80 | Reverse proxy |
| Qdrant | 6333 | Vector DB for RAG |
| SearXNG | 8888 | Self-hosted web search |
| LiteLLM | 4000 | Model proxy (optional) |

---

## Adding Models

```bash
ollama pull llama3:8b
ollama pull mistral:7b
ollama pull phi3:mini
ollama pull codestral:latest
```

Pulled models appear automatically in `/explore/models`. To add a model to the curated registry with descriptions and capabilities, edit `mac/services/llm_service.py`.

---

## Development

### Run Tests

```bash
# Windows PowerShell:
$env:PYTHONPATH = "."
pytest -v

# Linux/Mac:
PYTHONPATH=. pytest -v
```

### Project Structure

```
mac/
  main.py                   FastAPI app entry point
  config.py                 Settings from .env
  database.py               SQLAlchemy async engine
  models/
    user.py                 User, RefreshToken, UsageLog
    guardrail.py            GuardrailRule
    quota.py                QuotaOverride
    rag.py                  RAGCollection, RAGDocument
  schemas/                  Pydantic request/response schemas
  routers/                  API endpoint handlers (one per phase)
  services/
    auth_service.py         Authentication logic
    llm_service.py          LLM proxy + smart routing
    usage_service.py        Usage tracking
    model_service.py        Model load/unload/download
    guardrail_service.py    Content filtering
    rag_service.py          Document chunking, vector search
    search_service.py       Web search, grounded answers
  middleware/               Auth and rate limiting
  utils/                    JWT, password hashing, helpers
frontend/
  index.html                PWA shell
  app.js                    Client-side application
  style.css                 Styles
  manifest.json             PWA manifest
  sw.js                     Service worker
tests/                      Pytest test suite (81 tests)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| API | FastAPI 0.115 | Async Python API framework with auto-docs |
| ORM | SQLAlchemy 2.0 (async) | Async database ORM |
| DB (dev) | SQLite + aiosqlite | Zero-config local development |
| DB (prod) | PostgreSQL 16 | Production relational database |
| Cache | Redis 7 | In-memory caching and rate limiting |
| LLM Runtime | Ollama | Local LLM inference (GPU/CPU) |
| Vector DB | Qdrant | Self-hosted vector database for RAG |
| Search | SearXNG | Self-hosted meta search engine |
| Auth | JWT + API Keys | Stateless authentication |
| Proxy | Nginx | Reverse proxy and TLS termination |
| Container | Docker Compose | Multi-service orchestration |
| Migrations | Alembic | Database schema migrations |

---

## Project Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | Foundation (auth, explore, health) | Complete |
| 1 | Core API (chat, embeddings, vision, STT) | Complete |
| 2 | Model Management (load/unload/download) | Complete |
| 3 | Multi-PC Integration (routing, workers) | Complete |
| 4 | Usage Control (API keys, quotas) | Complete |
| 5 | Web Interface (PWA) | Complete |
| 6 | Guardrails (content filtering) | Complete |
| 7 | RAG (knowledge base, vector search) | Complete |
| 8 | Search (web, Wikipedia, grounded) | Complete |

---

## License

MIT
