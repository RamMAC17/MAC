<p align="center">
  <img src="logo.png" alt="MAC — MBM AI Cloud" width="200">
</p>

<h1 align="center">MAC — MBM AI Cloud</h1>

<p align="center">
  Self-hosted AI inference platform. Run open-source LLMs on your own GPU<br>and expose them as an OpenAI-compatible API for your entire college.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/vLLM-GPU_Inference-FF6F00?style=flat-square" alt="vLLM">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License">
</p>

---

One PC with a GPU becomes an AI cloud for the entire college. Students, developers, and faculty get personal API keys and can use the OpenAI SDK, curl, or the built-in PWA dashboard to access powerful language models — all running locally, with zero cloud costs.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Models](#models)
- [Smart Routing](#smart-routing)
- [API Reference](#api-reference)
- [Rate Limiting](#rate-limiting)
- [Configuration](#configuration)
- [Docker Deployment](#docker-deployment)
- [Manual Setup (No Docker)](#manual-setup-no-docker)
- [Adding or Changing Models](#adding-or-changing-models)
- [GPU Memory Planning](#gpu-memory-planning)
- [Development](#development)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **NVIDIA GPU** | 24GB+ VRAM (RTX 3090/4090/A5000/A6000) | Runs AI models |
| **NVIDIA Driver** | 535+ | GPU access |
| **Docker** | 24+ | Container runtime |
| **Docker Compose** | v2+ | Multi-service orchestration |
| **NVIDIA Container Toolkit** | Latest | GPU access inside containers |

> **Windows users**: Install Docker Desktop with WSL2 backend, then install NVIDIA Container Toolkit inside WSL2.

### 1. Clone and Configure

```bash
git clone https://github.com/23f2003700/mac.git
cd mac

cp .env.example .env
# Edit .env — change JWT_SECRET_KEY and MAC_SECRET_KEY to random strings
```

### 2. Start Everything

```bash
docker compose up -d
```

That's it. Docker pulls and starts all services:

| Service | Port | What it does |
|---------|------|-------------|
| **Nginx** | **80** | Frontend dashboard + API reverse proxy |
| MAC API | 8000 | FastAPI backend (auth, routing, tracking) |
| vLLM Speed | 8001 | Qwen2.5-7B — fast general chat |
| vLLM Code | 8002 | Qwen2.5-Coder-7B — code generation |
| vLLM Reasoning | 8003 | DeepSeek-R1-14B — math and logic |
| PostgreSQL | 5432 | Persistent database |
| Redis | 6379 | Rate limiting and cache |
| Qdrant | 6333 | Vector DB for RAG |
| SearXNG | 8888 | Self-hosted web search |

First startup takes 10-15 minutes as vLLM downloads models (~15GB total). Subsequent starts are instant (models are cached).

### 3. Open the Dashboard

Open `http://localhost` in your browser. The PWA dashboard gives you:

- Login with roll number + password
- Chat with AI models (auto or manual model selection)
- Usage statistics, activity heatmap, model distribution charts
- Admin panel for managing users, quotas, and API keys

### 4. Default Accounts

| Role | Email / Roll | Password |
|------|-------------|----------|
| **Admin** | `abhisek.cse@mbm.ac.in` | `Admin@1234` |
| Student | `21CS045` | `Student@1234` |
| Student | `21CS001` | `Student@1234` |
| Student | `21ME010` | `Student@1234` |
| Student | `22EC030` | `Student@1234` |

### 5. Test the API

```bash
# Login and get a token
curl -X POST http://localhost/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS001", "date_of_birth": "2003-01-15"}'

# Chat with the AI
curl -X POST http://localhost/api/v1/query/chat \
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
    base_url="http://localhost/api/v1/query",
    api_key="YOUR_API_KEY"   # Get from /keys/generate
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
          Students / Faculty / Any Device on Campus Network
           (OpenAI SDK / curl / PWA Dashboard / Mobile)
                           |
                     Port 80 (HTTP)
                           |
                    +-----------+
                    |   Nginx   |  Serves frontend (PWA)
                    |           |  Reverse-proxies /api -> MAC
                    +-----+-----+
                          |
                    +-----------+
                    |  MAC API  |  FastAPI (Python)
                    |           |  Auth, smart routing,
                    |  :8000    |  guardrails, usage tracking,
                    |           |  quota enforcement
                    +-----+-----+
                          |
        +---------+-------+--------+---------+
        |         |                |         |
   +----+----+ +--+------+ +------+---+ +---+----+
   |  vLLM   | |  vLLM   | |  vLLM    | |  vLLM  |
   |  Speed  | |  Code   | | Reasoning| |  Intel |
   | Qwen2.5 | | Qwen2.5 | | DeepSeek | | Gemma3 |
   |   7B    | | Coder7B | |  R1-14B  | |  27B   |
   |  :8001  | |  :8002  | |  :8003   | | :8004  |
   +---------+ +---------+ +----------+ +--------+
        |         |                |         |
        +----+----+----+-----------+---------+
             |         |
        +----+----+ +--+------+
        |  Redis  | |  Qdrant |
        |  :6379  | |  :6333  |
        |(ratelim)| |(RAG/vec)|
        +---------+ +---------+
             |
        +----+------+     +----------+
        | PostgreSQL |     |  SearXNG |
        |   :5432    |     |  :8888   |
        | (all data) |     |(web srch)|
        +------------+     +----------+
```

Every component runs as a Docker container on the same machine. The GPU is shared among vLLM instances using memory allocation limits.

---

## Models

MAC ships with four model tiers, each optimized for a different task:

| Model ID | Engine | Parameters | Specialty | GPU VRAM |
|----------|--------|-----------|-----------|----------|
| `qwen2.5:7b` | Qwen/Qwen2.5-7B-Instruct | 7B | Fast general chat, Q&A, summarization | ~5 GB |
| `qwen2.5-coder:7b` | Qwen/Qwen2.5-Coder-7B-Instruct | 7B | Code generation, debugging, explanation | ~5 GB |
| `deepseek-r1:14b` | deepseek-ai/DeepSeek-R1-Distill-Qwen-14B | 14B | Math, reasoning, step-by-step logic | ~9 GB |
| `gemma3:27b` | google/gemma-3-27b-it | 27B | Complex analysis, creative writing, research | ~18 GB |

**Default 24GB GPU setup** runs the first three models (~19GB total). Gemma-3-27B requires a 48GB+ GPU — uncomment its block in `docker-compose.yml` if you have the hardware.

### Why vLLM?

vLLM is the industry-standard serving engine for LLMs. Compared to other options:

- **Continuous batching** — handles many concurrent users without queuing
- **PagedAttention** — up to 24x better memory efficiency than naive attention
- **OpenAI-compatible API** — drop-in replacement, works with any OpenAI SDK
- **GPU memory control** — `--gpu-memory-utilization` lets multiple models share one GPU
- **High throughput** — optimized CUDA kernels for maximum tokens/second

This makes it ideal for a college server where 20+ students might be using the API simultaneously.

---

## Smart Routing

When `model` is set to `"auto"`, MAC analyzes the prompt and picks the best model:

| Detected Content | Routed To | Why |
|-----------------|-----------|-----|
| Code keywords (python, function, debug, algorithm...) | `qwen2.5-coder:7b` | Specialized for code |
| Math keywords (equation, integral, prove, calculus...) | `deepseek-r1:14b` | Chain-of-thought reasoning |
| Complex analysis (explain, research, essay, compare...) | `gemma3:27b` | Highest intelligence |
| General questions | `qwen2.5:7b` | Fastest response |

Students don't need to think about which model to use — `"auto"` handles it. Power users can still specify a model ID directly.

---

## API Reference

All endpoints are prefixed with `/api/v1`. Interactive docs at `/docs` (Swagger) and `/redoc`.

### Authentication — `/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/verify` | No | Login with roll number + DOB |
| POST | `/auth/logout` | JWT | Revoke refresh tokens |
| POST | `/auth/refresh` | No | Get new access token |
| GET | `/auth/me` | JWT/Key | User profile and quota |
| POST | `/auth/change-password` | JWT | Change password |

### Explore — `/explore` (public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/explore/models` | List all available models |
| GET | `/explore/models/search?tag=code` | Search by capability |
| GET | `/explore/models/{id}` | Model details |
| GET | `/explore/endpoints` | List all API endpoints |
| GET | `/explore/health` | Platform health and uptime |

### Query — `/query` (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/query/chat` | Chat completion (OpenAI-compatible, streaming) |
| POST | `/query/completions` | Text completion |
| POST | `/query/embeddings` | Generate vector embeddings |
| POST | `/query/rerank` | Re-rank documents by relevance |
| POST | `/query/vision` | Vision — image analysis |
| POST | `/query/speech-to-text` | Speech-to-text |

### Usage — `/usage` (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/usage/me` | My token usage |
| GET | `/usage/me/history` | Request history |
| GET | `/usage/me/quota` | Quota limits |
| GET | `/usage/admin/all` | All users (admin) |
| GET | `/usage/admin/models` | Per-model stats (admin) |

### Model Management — `/models`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/models` | JWT | List models with status |
| GET | `/models/{id}` | JWT | Model details and health |
| POST | `/models/{id}/load` | Admin | Warm up a model |
| POST | `/models/{id}/unload` | Admin | Unload model |
| GET | `/models/{id}/health` | JWT | Model health metrics |
| POST | `/models/download` | Admin | Download a new model |
| GET | `/models/download/{task_id}` | Admin | Download progress |

### Integration — `/integration`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/integration/routing-rules` | JWT | View smart routing rules |
| PUT | `/integration/routing-rules` | Admin | Update routing rules |
| GET | `/integration/workers` | JWT | List worker nodes |
| GET | `/integration/workers/{id}` | JWT | Worker details |
| POST | `/integration/workers/{id}/drain` | Admin | Drain a worker node |
| GET | `/integration/queue` | JWT | Queue status |

### API Keys — `/keys`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/keys/my-key` | JWT | Get your API key |
| POST | `/keys/generate` | JWT | Generate a new API key |
| GET | `/keys/my-key/stats` | JWT | API key usage stats |
| DELETE | `/keys/my-key` | JWT | Revoke your API key |
| GET | `/keys/admin/all` | Admin | All API keys |
| POST | `/keys/admin/revoke` | Admin | Revoke a user's key |

### Quota Management — `/quota`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/quota/limits` | JWT | Default quota limits by role |
| GET | `/quota/me` | JWT | Your current quota status |
| PUT | `/quota/admin/user/{roll}` | Admin | Override user quota |
| GET | `/quota/admin/exceeded` | Admin | Users exceeding quotas |

### Guardrails — `/guardrails`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/guardrails/check-input` | JWT | Check input for policy violations |
| POST | `/guardrails/check-output` | JWT | Check output for PII/safety |
| GET | `/guardrails/rules` | Admin | List guardrail rules |
| PUT | `/guardrails/rules` | Admin | Update guardrail rules |

### RAG (Knowledge Base) — `/rag`

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

### Search — `/search`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/search/web` | JWT | Web search via SearXNG |
| POST | `/search/wikipedia` | JWT | Wikipedia search |
| POST | `/search/grounded` | JWT | Search + LLM grounded answer |
| GET | `/search/cache` | JWT | Search cache stats |

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
| `DATABASE_URL` | `postgresql+asyncpg://mac:mac_password@localhost:5432/mac_db` | PostgreSQL connection |
| `VLLM_SPEED_URL` | `http://localhost:8001` | Speed model vLLM endpoint |
| `VLLM_CODE_URL` | `http://localhost:8002` | Code model vLLM endpoint |
| `VLLM_REASONING_URL` | `http://localhost:8003` | Reasoning model vLLM endpoint |
| `VLLM_INTELLIGENCE_URL` | `http://localhost:8004` | Intelligence model vLLM endpoint |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database |
| `SEARXNG_URL` | `http://localhost:8888` | SearXNG search engine |
| `JWT_SECRET_KEY` | (must change) | Secret for JWT signing |
| `RATE_LIMIT_REQUESTS_PER_HOUR` | `100` | Max requests per hour per user |
| `RATE_LIMIT_TOKENS_PER_DAY` | `50000` | Max tokens per day per user |

For production, generate strong secrets:

```bash
JWT_SECRET_KEY=
MAC_SECRET_KEY=
```

> **Note:** When running via Docker Compose, service URLs use container names (e.g., `http://vllm-speed:8001`). The compose file sets these automatically via environment variables.

---

## Docker Deployment

### Start

```bash
docker compose up -d                # Start all services
docker compose logs -f mac          # Watch API logs
docker compose logs -f vllm-speed   # Watch speed model logs
```

### Stop

```bash
docker compose down                 # Stop all services (data preserved in volumes)
```

### Check Health

```bash
docker compose ps                   # Service status
curl http://localhost/api/v1/explore/health   # API health
curl http://localhost:8001/v1/models          # vLLM speed model
curl http://localhost:8002/v1/models          # vLLM code model
curl http://localhost:8003/v1/models          # vLLM reasoning model
```

### Reset Everything

```bash
docker compose down -v              # Stop and delete all data (volumes)
docker compose up -d                # Fresh start
```

---

## Manual Setup (No Docker)

For development or when Docker isn't available:

### 1. Install vLLM

```bash
pip install vllm
```

### 2. Start vLLM Instances (each in a separate terminal)

```bash
# Terminal 1 — Speed model
vllm serve Qwen/Qwen2.5-7B-Instruct --port 8001 --gpu-memory-utilization 0.22 --max-model-len 8192

# Terminal 2 — Code model
vllm serve Qwen/Qwen2.5-Coder-7B-Instruct --port 8002 --gpu-memory-utilization 0.22 --max-model-len 8192

# Terminal 3 — Reasoning model
vllm serve deepseek-ai/DeepSeek-R1-Distill-Qwen-14B --port 8003 --gpu-memory-utilization 0.35 --max-model-len 8192
```

### 3. Install PostgreSQL and Redis

```bash
# Ubuntu / Debian
sudo apt install postgresql redis-server
sudo systemctl start postgresql redis

# Create the MAC database
sudo -u postgres createuser mac
sudo -u postgres createdb mac_db -O mac
sudo -u postgres psql -c "ALTER USER mac PASSWORD 'mac_password';"
```

### 4. Start MAC API

```bash
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your settings

uvicorn mac.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Adding or Changing Models

### Step 1: Add the vLLM Service

Edit `docker-compose.yml` and add a new vLLM service block:

```yaml
vllm-mymodel:
  image: vllm/vllm-openai:latest
  container_name: mac-vllm-mymodel
  ports:
    - "8005:8005"
  environment:
    - HF_HOME=/root/.cache/huggingface
  volumes:
    - hf-cache:/root/.cache/huggingface
  command: >
    --model TheOrg/TheModel-Name
    --port 8005
    --gpu-memory-utilization 0.20
    --max-model-len 8192
    --dtype auto
    --trust-remote-code
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  restart: unless-stopped
  networks:
    - mac-net
```

### Step 2: Register in the Backend

Edit `mac/services/llm_service.py` and add an entry to `DEFAULT_MODELS`:

```python
"mymodel:size": {
    "name": "My Model Display Name",
    "specialty": "What this model is good at",
    "parameters": "7B",
    "context_length": 8192,
    "capabilities": ["chat", "completion"],
    "category": "speed",
    "served_name": "TheOrg/TheModel-Name",
    "url_key": "vllm_mymodel_url",
},
```

### Step 3: Add the Config Setting

Edit `mac/config.py` and add:

```python
vllm_mymodel_url: str = "http://localhost:8005"
```

Add the matching environment variable in `.env` and `docker-compose.yml`.

### Step 4: Restart

```bash
docker compose up -d --build
```

---

## GPU Memory Planning

vLLM lets you split GPU memory across multiple models using `--gpu-memory-utilization`:

### 24GB GPU (RTX 3090 / RTX 4090)

| Model | Allocation | VRAM Used |
|-------|-----------|-----------|
| Qwen2.5-7B (speed) | 0.22 | ~5.3 GB |
| Qwen2.5-Coder-7B (code) | 0.22 | ~5.3 GB |
| DeepSeek-R1-14B (reasoning) | 0.35 | ~8.4 GB |
| **Total** | **0.79** | **~19 GB / 24 GB** |

Leaves ~5GB free for CUDA overhead and OS.

### 48GB GPU (RTX A6000 / 2x RTX 3090)

| Model | Allocation | VRAM Used |
|-------|-----------|-----------|
| Qwen2.5-7B (speed) | 0.12 | ~5.8 GB |
| Qwen2.5-Coder-7B (code) | 0.12 | ~5.8 GB |
| DeepSeek-R1-14B (reasoning) | 0.20 | ~9.6 GB |
| Gemma-3-27B (intelligence) | 0.45 | ~21.6 GB |
| **Total** | **0.89** | **~42.8 GB / 48 GB** |

> **Tip:** Adjust `--gpu-memory-utilization` values in `docker-compose.yml` to match your GPU. Total should not exceed 0.90 to avoid OOM errors.

---

## Development

### Run Tests

```bash
# Windows PowerShell:
 = "."
pytest -v

# Linux/Mac:
PYTHONPATH=. pytest -v
```

### Project Structure

```
mac/
  main.py                   FastAPI app entry point, DB init, seed users
  config.py                 Settings loaded from .env
  database.py               SQLAlchemy async engine + session
  models/
    user.py                 User, RefreshToken, UsageLog
    guardrail.py            GuardrailRule
    quota.py                QuotaOverride
    rag.py                  RAGCollection, RAGDocument
  schemas/                  Pydantic request/response schemas
  routers/                  11 API route modules
  services/
    llm_service.py          LLM proxy, smart routing, vLLM integration
    auth_service.py         Authentication and JWT logic
    usage_service.py        Per-user usage tracking
    model_service.py        Model health checks and management
    guardrail_service.py    Content moderation and filtering
    rag_service.py          Document chunking, vector search (Qdrant)
    search_service.py       Web search, grounded answers (SearXNG)
  middleware/               Auth middleware, rate limiter
  utils/                    JWT helpers, password hashing, request IDs
frontend/
  index.html                PWA shell
  app.js                    Full dashboard app (charts, heatmap, admin)
  style.css                 Responsive styles
  manifest.json             PWA manifest
  sw.js                     Service worker for offline support
nginx/
  nginx.conf                Reverse proxy config
tests/                      Pytest test suite
docker-compose.yml          Full-stack orchestration
Dockerfile                  MAC API container build
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **LLM Runtime** | **vLLM** | GPU inference with continuous batching |
| API | FastAPI 0.115 | Async Python API with auto-generated docs |
| ORM | SQLAlchemy 2.0 (async) | Database models and queries |
| Database | PostgreSQL 16 | Persistent data (users, usage, quotas) |
| Cache | Redis 7 | In-memory rate limiting and caching |
| Vector DB | Qdrant | Document embeddings for RAG |
| Search | SearXNG | Self-hosted meta search engine |
| Auth | JWT + API Keys | Stateless authentication |
| Proxy | Nginx | Reverse proxy, static file serving |
| Frontend | Vanilla JS PWA | Dashboard with Chart.js visualizations |
| Container | Docker Compose | Full-stack orchestration with GPU support |
| Migrations | Alembic | Database schema versioning |

---

## License

MBM
