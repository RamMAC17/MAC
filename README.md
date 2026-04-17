<p align="center">
  <img src="logo.png" alt="MAC — MBM AI Cloud" width="180">
</p>

<h1 align="center">MAC — MBM AI Cloud</h1>

<p align="center">
  <strong>Self-hosted AI inference platform.</strong><br>
  Turn any PCs with GPUs into an AI cloud for your college — zero cloud costs.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/vLLM-GPU_Inference-FF6F00?style=flat-square" alt="vLLM">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MBM License">
</p>

---

## What is MAC?

One PC with a GPU becomes an AI server. Add more PCs and they **automatically join the cluster** — MAC routes every request to the best available GPU. Students and faculty use the built-in dashboard or any OpenAI-compatible SDK.

**Two deployment modes:**

| Mode | PCs | For |
|------|-----|-----|
| **Single-PC** | 1 GPU machine | Small labs, personal use |
| **Cluster** | 1 control node + N GPU workers | College-wide deployment |

---

## Table of Contents

- [Quick Start — Single PC](#quick-start--single-pc)
- [Cluster Mode — Multiple PCs](#cluster-mode--multiple-pcs)
- [Community Model Portal](#community-model-portal)
- [Architecture](#architecture)
- [Models](#models)
- [Smart Routing](#smart-routing)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [GPU Memory Planning](#gpu-memory-planning)
- [Development](#development)
- [Tech Stack](#tech-stack)

---

## Quick Start — Single PC

> **One machine. One command. AI running.**

### Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **NVIDIA GPU** | 12 GB+ VRAM | Runs AI models |
| **NVIDIA Driver** | 535+ | GPU access |
| **Docker** | 24+ | Container runtime |
| **Docker Compose** | v2+ | Orchestration |
| **NVIDIA Container Toolkit** | Latest | GPU inside containers |

> **Windows**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL2 backend, then install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) inside WSL2.

### Step 1 — Clone & Configure

```bash
git clone https://github.com/23f2003700/mac.git
cd mac

cp .env.example .env
```

Open `.env` and set these two lines to random strings:

```env
JWT_SECRET_KEY=your-random-secret-here
MAC_SECRET_KEY=your-other-random-secret
```

### Step 2 — Start

```bash
docker compose up -d
```

First run downloads models (~5–15 GB depending on model). Takes 10–15 minutes. After that, starts in seconds.

### Step 3 — Use It

Open **http://localhost** in your browser.

| Default Account | Roll / Email | Password |
|-----------------|-------------|----------|
| Admin | `abhisek.cse@mbm.ac.in` | `Admin@1234` |
| Student | `21CS045` | `Student@1234` |

**Quick API test:**

```bash
# Login
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS045", "password": "Student@1234"}'

# Chat (use the access_token from login response)
curl -X POST http://localhost/api/v1/query/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello!"}]}'
```

**OpenAI SDK compatible:**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost/api/v1/query",
    api_key="YOUR_API_KEY"  # Generate at /api/v1/keys/generate
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain quicksort"}]
)
print(response.choices[0].message.content)
```

### What's Running

| Service | Port | Purpose |
|---------|------|---------|
| Nginx | 80 | Dashboard + API proxy |
| MAC API | 8000 | Auth, routing, tracking |
| vLLM | 8001 | GPU inference |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Rate limiting |
| Qdrant | 6333 | Vector DB (RAG) |
| SearXNG | 8888 | Web search |

### Stop / Restart

```bash
docker compose down          # Stop (data preserved in volumes)
docker compose up -d         # Restart
docker compose down -v       # Full reset (deletes all data)
```

---

## Cluster Mode — Multiple PCs

> **Any PC with a GPU can join the AI cloud.** One PC runs the control node (API, DB, frontend). Other PCs run vLLM and auto-connect.

```
    ┌─────────────── Control Node (PC1) ───────────────┐
    │  MAC API · PostgreSQL · Redis · Nginx · Qdrant   │
    │  IP: 10.10.13.30                                 │
    └──────────────────────┬───────────────────────────┘
                           │  Campus WiFi / LAN
          ┌────────────────┼────────────────┐
          │                │                │
  ┌───────┴──────┐ ┌──────┴───────┐ ┌──────┴───────┐
  │  Worker PC2  │ │  Worker PC3  │ │  Worker PC4  │
  │  RTX 3060    │ │  RTX 3060    │ │  RTX 4060    │
  │  Coder 7B    │ │  DeepSeek 7B │ │  Mistral 7B  │
  └──────────────┘ └──────────────┘ └──────────────┘
```

**Smart routing**: Code question → PC2's Coder model. Math → PC3. General → PC1. All automatic.

---

### Step 1 — Control Node (PC1)

The control node runs everything except vLLM. No GPU required.

```bash
git clone https://github.com/23f2003700/mac.git
cd mac

cp .env.example .env
# Edit .env — set JWT_SECRET_KEY and MAC_SECRET_KEY

# Start control node
docker compose -f docker-compose.control-node.yml up -d
```

**Open the admin panel**: http://YOUR_IP → Login as admin → **Cluster** tab.

Click **"Generate Enrollment Token"** — copy the token. Generate one per worker PC.

> **Firewall**: If workers can't reach the control node, run `setup-firewall.ps1` as Administrator to open required ports.

---

### Step 2 — Worker PC (any PC with a GPU)

#### Option A: Automated Setup (Windows — recommended)

Copy `setup-worker.ps1` to the worker PC and run **as Administrator**:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-worker.ps1 -ControlNodeIP "10.10.13.30" -NodeName "pc2-coder"
```

The script handles everything:
1. Checks NVIDIA GPU + drivers
2. Installs WSL2 + Docker Desktop if missing
3. Opens firewall ports
4. Asks for enrollment token and model choice
5. Starts vLLM + worker agent containers

#### Option B: Manual Setup (any OS)

```bash
git clone https://github.com/23f2003700/mac.git
cd mac
```

Create a `.env` file for the worker:

```env
CONTROL_NODE_URL=http://10.10.13.30:8000
ENROLLMENT_TOKEN=mac_enroll_xxxxx
NODE_NAME=pc2-coder
VLLM_MODEL=Qwen/Qwen2.5-Coder-7B-Instruct-AWQ
VLLM_PORT=8001
GPU_MEM_UTIL=0.85
MAX_MODEL_LEN=8192
GPU_NAME=NVIDIA RTX 3060
GPU_VRAM_MB=12288
RAM_TOTAL_MB=16384
CPU_CORES=8
HEARTBEAT_INTERVAL=30
```

Start the worker:

```bash
docker compose -f docker-compose.worker-node.yml up -d
```

**That's it.** The worker agent will:
1. Enroll with the control node using the token
2. Wait for vLLM to load the model
3. Register the model with MAC
4. Send heartbeats every 30 seconds

Check the admin panel → **Cluster** tab — the new node appears as **Active**.

#### Option C: No Docker (bare metal)

```bash
# Terminal 1 — vLLM
pip install vllm
vllm serve Qwen/Qwen2.5-Coder-7B-Instruct-AWQ \
  --port 8001 --gpu-memory-utilization 0.85 --max-model-len 8192

# Terminal 2 — Worker agent
pip install httpx psutil
export CONTROL_NODE_URL=http://10.10.13.30:8000
export ENROLLMENT_TOKEN=mac_enroll_xxxxx
export NODE_NAME=pc2-coder
export VLLM_PORT=8001
export GPU_NAME="NVIDIA RTX 3060"
export GPU_VRAM_MB=12288
python worker-agent.py
```

---

### Step 3 — Verify the Cluster

```bash
# Check cluster status
curl http://10.10.13.30/api/v1/nodes/cluster-status \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

Or use the admin dashboard → **Cluster** tab for real-time GPU utilization and node status.

---

### Adding More Models

1. Change `VLLM_MODEL` in the worker's `.env`
2. Restart: `docker compose -f docker-compose.worker-node.yml up -d`
3. The worker auto-registers the new model

Or use the **Community Model Portal** to let users submit models for admin review and deployment.

---

## Community Model Portal

Anyone can suggest a HuggingFace model. Admins review, approve, and deploy it to a worker PC.

```
User submits model  →  Admin reviews  →  Admin assigns worker  →  Worker downloads & serves  →  Model goes LIVE
```

### Submit a Model

```bash
curl -X POST http://localhost/api/v1/models/submit \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model_url": "mistralai/Mistral-7B-Instruct-v0.3",
    "display_name": "Mistral 7B Instruct",
    "description": "Fast general chat model",
    "category": "speed",
    "parameters": "7B",
    "min_vram_gb": 8.0
  }'
```

Accepted formats: HuggingFace URLs (`https://huggingface.co/org/model`), model IDs (`org/model`), GitHub URLs.

### Admin — Review & Deploy

```bash
# List pending
curl http://localhost/api/v1/models/submissions?status=submitted \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Approve
curl -X POST http://localhost/api/v1/models/submissions/{id}/review \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"decision": "approved", "note": "Looks good"}'

# Assign to worker
curl -X POST http://localhost/api/v1/models/submissions/{id}/assign \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"worker_node_id": "NODE_UUID", "vllm_port": 8002}'

# Mark live
curl -X POST http://localhost/api/v1/models/submissions/{id}/live \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

Once live, the model appears in `GET /models` and is routable via `model: "org/model-name"` in chat.

### Browse Community Models

```bash
curl http://localhost/api/v1/models/community  # No auth needed
```

---

## Architecture

```
  Students / Faculty / Any Device
  (OpenAI SDK · curl · PWA Dashboard)
                 │
            Port 80 (HTTP)
                 │
          ┌──────┴──────┐
          │    Nginx     │  Static PWA + reverse proxy
          └──────┬──────┘
                 │
          ┌──────┴──────┐
          │   MAC API    │  FastAPI — auth, smart routing,
          │   :8000      │  quotas, guardrails, usage tracking
          └──────┬──────┘
                 │
    ┌────────────┼────────────┬──────────────┐
    │            │            │              │
 ┌──┴───┐  ┌───┴───┐  ┌────┴────┐  ┌──────┴──────┐
 │ vLLM │  │ vLLM  │  │ Worker  │  │   Worker    │
 │ Local│  │ Local │  │ Node 2  │  │   Node 3    │
 │:8001 │  │:8002  │  │ (remote)│  │  (remote)   │
 └──────┘  └───────┘  └─────────┘  └─────────────┘
                 │
    ┌────────────┼──────────────┬──────────────┐
    │            │              │              │
 ┌──┴───┐  ┌───┴────┐  ┌─────┴─────┐  ┌────┴────┐
 │Redis │  │Postgres│  │  Qdrant   │  │ SearXNG │
 │:6379 │  │ :5432  │  │  :6333    │  │  :8888  │
 │(rate)│  │ (data) │  │(RAG/vec)  │  │(search) │
 └──────┘  └────────┘  └───────────┘  └─────────┘
```

---

## Models

### Built-in Chat Models

| Model ID | Engine | Params | Specialty | VRAM |
|----------|--------|--------|-----------|------|
| `qwen2.5:7b` | Qwen2.5-7B-Instruct | 7B | General chat | ~5 GB |
| `qwen2.5-coder:7b` | Qwen2.5-Coder-7B | 7B | Code generation | ~5 GB |
| `deepseek-r1:14b` | DeepSeek-R1-14B | 14B | Math, reasoning | ~9 GB |
| `gemma3:27b` | Gemma-3-27B | 27B | Complex analysis | ~18 GB |

### Speech, TTS, Embedding, Vision

| Model ID | Type | Params | VRAM |
|----------|------|--------|------|
| `whisper-small` | STT | 244M | ~1 GB |
| `whisper-large-v3-turbo` | STT | 809M | ~4 GB |
| `tts-piper` | TTS | ~20M | CPU only |
| `nomic-embed-text` | Embedding | 137M | ~550 MB |
| `moondream2` | Vision | 1.9B | ~2 GB |

---

## Smart Routing

When `model` is `"auto"`, MAC picks the best model:

| Prompt Content | Routes To |
|----------------|-----------|
| Code keywords (python, debug, function…) | Coder model |
| Math keywords (equation, prove, integral…) | Reasoning model |
| Complex analysis (explain, research, essay…) | Intelligence model |
| General questions | Speed model |

In cluster mode, requests also route to the **least-loaded GPU** across all workers.

---

## API Reference

Base URL: `/api/v1` — Interactive docs at [`/docs`](http://localhost/docs) (Swagger) and [`/redoc`](http://localhost/redoc).

### Core Endpoints

| Area | Endpoint | Auth | Description |
|------|----------|------|-------------|
| **Auth** | `POST /auth/login` | — | Login, get JWT tokens |
| | `POST /auth/verify` | — | Login with roll + DOB |
| | `GET /auth/me` | JWT | User profile |
| **Chat** | `POST /query/chat` | JWT/Key | Chat completion (streaming) |
| | `POST /query/completions` | JWT/Key | Text completion |
| | `POST /query/embeddings` | JWT/Key | Generate embeddings |
| | `POST /query/speech-to-text` | JWT/Key | Audio transcription |
| | `POST /query/text-to-speech` | JWT/Key | Text to audio |
| **Models** | `GET /models` | — | List all models |
| | `GET /models/community` | — | Live community models |
| | `POST /models/submit` | JWT | Submit model for review |
| **Keys** | `POST /keys/generate` | JWT | Create API key |
| **Cluster** | `GET /nodes` | Admin | List worker nodes |
| | `GET /nodes/cluster-status` | Admin | Cluster health |
| | `POST /nodes/enrollment-token` | Admin | Generate enrollment token |
| **RAG** | `POST /rag/ingest` | JWT | Upload documents |
| | `POST /rag/query` | JWT | RAG-augmented query |
| **Search** | `POST /search/web` | JWT | Web search |
| | `POST /search/grounded` | JWT | Search + LLM answer |

### Rate Limits

| Role | Requests/Hour | Tokens/Day |
|------|---------------|------------|
| Student | 100 | 50,000 |
| Faculty | 300 | 200,000 |
| Admin | Unlimited | Unlimited |

---

## Configuration

All settings via `.env`. See [.env.example](.env.example) for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://…` | Database connection |
| `JWT_SECRET_KEY` | *(must change)* | JWT signing secret |
| `MAC_SECRET_KEY` | *(must change)* | App secret |
| `VLLM_SPEED_URL` | `http://localhost:8001` | Speed model endpoint |
| `VLLM_CODE_URL` | `http://localhost:8002` | Code model endpoint |
| `VLLM_REASONING_URL` | `http://localhost:8003` | Reasoning endpoint |
| `RATE_LIMIT_REQUESTS_PER_HOUR` | `100` | Per-user rate limit |
| `RATE_LIMIT_TOKENS_PER_DAY` | `50000` | Per-user token limit |

---

## GPU Memory Planning

### 12 GB GPU (RTX 3060) — one model at a time

| Model | VRAM |
|-------|------|
| Qwen2.5-7B-AWQ | ~10 GB |

### 24 GB GPU (RTX 3090 / 4090) — multiple models

| Model | Allocation | VRAM |
|-------|-----------|------|
| Qwen2.5-7B (speed) | 0.22 | ~5.3 GB |
| Qwen2.5-Coder-7B (code) | 0.22 | ~5.3 GB |
| DeepSeek-R1-14B (reasoning) | 0.35 | ~8.4 GB |
| **Total** | **0.79** | **~19 GB** |

### Cluster (3× 12 GB GPUs across 3 PCs)

| PC | Model | VRAM |
|----|-------|------|
| PC1 | Qwen2.5-7B (general) | 10 GB |
| PC2 | Qwen2.5-Coder-7B (code) | 10 GB |
| PC3 | DeepSeek-R1-7B (reasoning) | 10 GB |
| **Total** | **3 specialized models** | **30 GB** |

---

## Development

### Run Without Docker

```bash
git clone https://github.com/23f2003700/mac.git
cd mac

python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env — set DATABASE_URL, secrets

# Start vLLM (separate terminal)
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ --port 8001 --gpu-memory-utilization 0.85

# Start API
uvicorn mac.main:app --host 0.0.0.0 --port 8000 --reload
```

### Tests

```bash
DATABASE_URL=sqlite+aiosqlite:///./test.db pytest -v
```

### Project Structure

```
mac/
├── main.py                    App entry, startup
├── config.py                  Settings from .env
├── database.py                SQLAlchemy async engine
├── models/                    ORM models (user, node, agent, notebook…)
├── routers/                   19 API route modules
├── services/                  Business logic (LLM proxy, node mgmt…)
├── middleware/                 Auth, rate limiting
└── utils/                     JWT, hashing

frontend/                      PWA dashboard
worker-agent.py                Worker sidecar agent
setup-worker.ps1               Automated Windows worker setup
docker-compose.yml             Single-PC deployment
docker-compose.control-node.yml  Cluster — control node
docker-compose.worker-node.yml   Cluster — GPU worker
```

### Database Migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM Runtime | vLLM (PagedAttention, continuous batching) |
| API | FastAPI 0.115 (async) |
| ORM | SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Vector DB | Qdrant |
| Search | SearXNG |
| Auth | JWT + scoped API keys |
| Proxy | Nginx |
| Frontend | Vanilla JS PWA |
| Containers | Docker Compose |
| Migrations | Alembic |

---

## License

MIT — MBM University, Jodhpur
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
| Whisper *(optional)* | 8005 | Speech-to-text (faster-whisper) |
| TTS *(optional)* | 8006 | Text-to-speech (Piper / OpenedAI) |
| PostgreSQL | 5432 | Persistent database |
| pgAdmin *(optional)* | 5050 | PostgreSQL admin UI (schema/data edit) |
| Redis | 6379 | Rate limiting and cache |
| Qdrant | 6333 | Vector DB for RAG |
| SearXNG | 8888 | Self-hosted web search |

First startup takes 10-15 minutes as vLLM downloads models (~15GB total). Subsequent starts are instant (models are cached).

### Database Management (Recommended)

For long-term operations, use both tools:

- **pgAdmin UI** for day-to-day inspection and edits (tables, rows, indexes, query tool).
- **Alembic migrations** for tracked schema changes across environments.

Open pgAdmin at `http://localhost:5050` (or your `PGADMIN_PORT`), then connect to:

- Host: `postgres`
- Port: `5432`
- Database: `mac_db`
- Username: `mac`
- Password: `mac_password`

Set secure defaults in `.env` before production:

- `PGADMIN_DEFAULT_EMAIL`
- `PGADMIN_DEFAULT_PASSWORD`

To keep schema history reproducible, commit migration files under `alembic/versions/`.

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
# Login with password (admin / seeded students)
curl -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS001", "password": "Student@1234"}'

# OR login with roll + DOB (DDMMYYYY) — auto-creates account on first use
curl -X POST http://localhost/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS001", "dob": "10012003"}'

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
     +--------+-------+---+---+--------+--------+
     |        |       |       |        |        |
  +--+---+ +--+--+ +--+---+ +--+--+ +--+--+ +--+--+
  | vLLM | | vLLM| | vLLM | | vLLM| |Whisp| | TTS |
  | Speed| | Code| | Reas.| | Intel| | STT | |     |
  |Qwen7B| |Coder| |Deep14| |Gem27B| |:8005| |:8006|
  |:8001 | |:8002| |:8003 | |:8004 | +-----+ +-----+
  +------+ +-----+ +------+ +------+
        |      |       |         |
        +---+--+-------+---------+
            |          |
       +----+----+ +---+-----+
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

Every component runs as a Docker container on the same machine. The GPU is shared among vLLM instances using memory allocation limits. Whisper and TTS are optional — uncomment in `docker-compose.yml` to enable.

---

## Models

MAC ships with **13 built-in models** across five types. All are configurable via `.env` — no code changes needed.

### Chat / LLM Models

| Model ID | Engine | Parameters | Specialty | GPU VRAM |
|----------|--------|-----------|-----------|----------|
| `qwen2.5:7b` | Qwen/Qwen2.5-7B-Instruct | 7B | Fast general chat, Q&A, summarization | ~5 GB |
| `qwen2.5-coder:7b` | Qwen/Qwen2.5-Coder-7B-Instruct | 7B | Code generation, debugging, explanation | ~5 GB |
| `deepseek-r1:14b` | deepseek-ai/DeepSeek-R1-Distill-Qwen-14B | 14B | Math, reasoning, step-by-step logic | ~9 GB |
| `gemma3:27b` | google/gemma-3-27b-it | 27B | Complex analysis, creative writing, research | ~18 GB |

### Speech-to-Text (Whisper)

| Model ID | Engine | Parameters | Specialty | GPU VRAM |
|----------|--------|-----------|-----------|----------|
| `whisper-small` | Systran/faster-whisper-small | 244M | Fast transcription, low VRAM | ~1 GB |
| `whisper-medium` | Systran/faster-whisper-medium | 769M | Balanced accuracy, multi-language | ~2 GB |
| `whisper-large-v3-turbo` | Systran/faster-whisper-large-v3-turbo | 809M | Best accuracy, accents & noisy audio | ~4 GB |

### Text-to-Speech

| Model ID | Engine | Parameters | Specialty | Resources |
|----------|--------|-----------|-----------|-----------|
| `tts-piper` | Piper TTS | ~20M | Lightweight offline TTS | CPU only, ~50 MB RAM |
| `tts-coqui` | Coqui XTTS-v2 | ~500M | Voice cloning, multi-language | ~2 GB |

### Embedding Models

| Model ID | Engine | Parameters | Specialty | Resources |
|----------|--------|-----------|-----------|-----------|
| `nomic-embed-text` | nomic-embed-text | 137M | General-purpose RAG & search | ~550 MB |
| `bge-small-en-v1.5` | BAAI/bge-small-en-v1.5 | 33M | Tiny, fast English embeddings | ~130 MB |

### Vision Models

| Model ID | Engine | Parameters | Specialty | GPU VRAM |
|----------|--------|-----------|-----------|----------|
| `moondream2` | vikhyatk/moondream2 | 1.9B | Image captioning & visual Q&A | ~2 GB |
| `deepseek-r1:14b` | deepseek-ai/DeepSeek-R1-Distill-Qwen-14B | 14B | Math, reasoning, step-by-step logic | ~9 GB |
| `gemma3:27b` | google/gemma-3-27b-it | 27B | Complex analysis, creative writing, research | ~18 GB |

**Default 24GB GPU setup** runs the first three chat models (~19GB total). Gemma-3-27B requires a 48GB+ GPU — uncomment its block in `docker-compose.yml`.

STT, TTS, and embedding services are optional — uncomment them in `docker-compose.yml` when you need them. They can even run on CPU-only machines.

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
| POST | `/auth/verify` | No | Login with roll number + DOB (DDMMYYYY) — auto-creates account |
| POST | `/auth/login` | No | Login with roll number + password |
| POST | `/auth/set-password` | JWT | Set password on first login (after verify) |
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
| POST | `/query/speech-to-text` | Speech-to-text (Whisper) |
| POST | `/query/text-to-speech` | Text-to-speech (audio generation) |

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
| `WHISPER_URL` | `http://localhost:8005` | Whisper STT endpoint |
| `WHISPER_MODEL` | `Systran/faster-whisper-small` | Which Whisper model to use |
| `TTS_URL` | `http://localhost:8006` | Text-to-Speech endpoint |
| `TTS_MODEL` | `default` | TTS voice model |
| `EMBEDDING_URL` | *(empty = use VLLM_BASE_URL)* | Separate embedding server |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model name |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database |
| `SEARXNG_URL` | `http://localhost:8888` | SearXNG search engine |
| `JWT_SECRET_KEY` | (must change) | Secret for JWT signing |
| `MAC_ENABLED_MODELS` | *(empty = all)* | Comma-separated model IDs to enable |
| `MAC_MODELS_JSON` | *(empty = built-in)* | JSON array to replace entire model list |
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
    "model_type": "chat",  # chat, stt, tts, embedding, vision
    "specialty": "What this model is good at",
    "parameters": "7B",
    "context_length": 8192,
    "capabilities": ["chat", "completion"],
    "category": "speed",
    "served_name": "TheOrg/TheModel-Name",
    "url_key": "vllm_mymodel_url",
},
```

Or **skip code edits entirely** — set `MAC_MODELS_JSON` in `.env` to a JSON array of model objects.

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

## Enabling Speech-to-Text & Text-to-Speech

STT and TTS are pre-configured but commented out. To enable them:

### Whisper (Speech-to-Text)

1. Open `docker-compose.yml` and uncomment the `whisper` service block (GPU or CPU variant)
2. Set `WHISPER_URL` and `WHISPER_MODEL` in `.env`:
   ```
   WHISPER_URL=http://localhost:8005
   WHISPER_MODEL=Systran/faster-whisper-small   # small (~1GB) | medium (~2GB) | large-v3 (~4GB)
   ```
3. `docker compose up -d`

The endpoint `POST /api/v1/query/speech-to-text` accepts audio files (mp3, wav, ogg, m4a) up to 50 MB.

### Piper / OpenedAI-Speech (Text-to-Speech)

1. Uncomment the `tts` service block in `docker-compose.yml`
2. Set `TTS_URL` in `.env`:
   ```
   TTS_URL=http://localhost:8006
   ```
3. `docker compose up -d`

The endpoint `POST /api/v1/query/text-to-speech` returns audio (mp3/wav/opus).

> **Low-resource machines**: Whisper Small + Piper TTS together need only ~1 GB RAM and work on CPU. No GPU required.

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

```powershell
# Windows PowerShell:
$env:PYTHONPATH = "."
pytest -v
```

```bash
# Linux / Mac:
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
