<p align="center">
  <img src="logo.png" alt="MAC — MBM AI Cloud" width="180">
</p>

<h1 align="center">MAC — MBM AI Cloud</h1>

<p align="center">
  <strong>Self-hosted AI classroom platform for colleges.</strong><br>
  Turn any GPU PCs into an AI cloud — chat, notebooks, copy checking, attendance, and more.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/vLLM-GPU_Inference-FF6F00?style=flat-square" alt="vLLM">
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License">
</p>

---

## What is MAC?

MAC is a **self-hosted AI platform built for college campuses**. One PC with a GPU becomes an AI server. Add more PCs and they automatically join the cluster — MAC routes every request to the best available GPU.

Students use the **PWA dashboard** for AI chat, Jupyter notebooks, and Q&A doubts. Faculty use it to **mark answer sheets with AI vision**, detect plagiarism automatically, take attendance, and post doubt replies. Admins control everything: models, guardrails, user registry, audit logs, and cluster nodes — all from a single panel.

**Zero cloud costs. Works on your campus LAN.**

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start--one-click)
- [Cluster Mode](#cluster-mode--multiple-pcs)
- [Copy Check — AI Vision Marking](#copy-check--ai-vision-marking)
- [Architecture](#architecture)
- [Models](#models)
- [API Reference](#api-reference)
- [Student Registry Import](#student-registry-import)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)

---

## Features

### For Students
| Feature | Description |
|---------|-------------|
| **AI Chat** | Multi-model chat with streaming, voice input, image upload, web search, RAG |
| **Jupyter Notebooks** | In-browser Python notebooks with real kernel execution |
| **Doubts** | Post questions to faculty; get notified when answered |
| **Attendance** | Biometric (face recognition) check-in via webcam |

### For Faculty
| Feature | Description |
|---------|-------------|
| **Copy Check** | Upload answer-sheet images → AI vision marks them → plagiarism detection → PDF report |
| **Attendance Management** | Configure time windows, view per-student records, manual override |
| **Doubts Management** | Answer student questions, filter by department/subject |

### For Admins
| Feature | Description |
|---------|-------------|
| **Student Registry** | Bulk import students via CSV or JSON |
| **Guardrails Control Panel** | Real-time toggle/add/delete AI safety filter rules (block, flag, redact, log) |
| **Live Activity Stream** | SSE feed of all platform activity in real time |
| **Audit Log** | Structured, searchable log of every admin and faculty action |
| **Cluster Management** | Add worker PCs, generate enrollment tokens, monitor GPU utilization |
| **Community Model Portal** | Users submit HuggingFace models; admin reviews and deploys to workers |
| **API Key Management** | Issue/revoke scoped API keys per user |

---

## Quick Start — One Click

> **Prerequisites:** Docker Desktop running, Python 3.11+.

```bash
git clone https://github.com/RamMAC17/MAC.git
cd MAC
cp .env.example .env        # Edit: set JWT_SECRET_KEY and MAC_SECRET_KEY
```

**Windows — one click:** Double-click `setup.bat`. It:
1. Checks Docker is running
2. Starts Postgres + Redis via Docker Compose
3. Installs Python dependencies
4. Detects your LAN IP
5. Starts the API on `0.0.0.0:8000`

**Manual:**
```bash
docker compose up -d postgres redis
pip install -r requirements.txt
uvicorn mac.main:app --host 0.0.0.0 --port 8000 --reload
```

Open **http://localhost:8000** in your browser.

| Default Account | Email / Roll | Password |
|-----------------|-------------|----------|
| Admin | `abhisek.cse@mbm.ac.in` | `Admin@123` |
| Student | `21CS045` | `Student@1234` |

**Quick API test:**
```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS045", "password": "Student@1234"}'

# Chat
curl -X POST http://localhost:8000/api/v1/query/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello!"}]}'
```

**OpenAI SDK compatible:**
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/api/v1/query",
    api_key="YOUR_API_KEY"   # Generate at /api/v1/keys/generate
)
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain quicksort"}]
)
```

---

## Cluster Mode — Multiple PCs

> Any PC with a GPU can join. One machine runs the control node; others run vLLM and auto-connect.

```
    ┌──────────────── Control Node (PC1) ──────────────────┐
    │   MAC API · PostgreSQL · Redis · Nginx · Qdrant      │
    │   IP: 10.10.13.30                                    │
    └────────────────────────┬─────────────────────────────┘
                             │  Campus LAN
           ┌─────────────────┼─────────────────┐
           │                 │                 │
   ┌───────┴──────┐  ┌──────┴───────┐  ┌──────┴───────┐
   │  Worker PC2  │  │  Worker PC3  │  │  Worker PC4  │
   │  RTX 3060    │  │  RTX 3060    │  │  RTX 4060    │
   │  Coder 7B    │  │  DeepSeek 7B │  │  Mistral 7B  │
   └──────────────┘  └──────────────┘  └──────────────┘
```

### Step 1 — Control Node

```bash
cp .env.example .env   # Set JWT_SECRET_KEY and MAC_SECRET_KEY
docker compose -f docker-compose.control-node.yml up -d
```

Open Admin panel → **Cluster** tab → **Generate Enrollment Token** (one per worker).

> **Firewall:** Run `setup-firewall.ps1` as Administrator if workers can't reach the control node.

### Step 2 — Worker PC (Windows, automated)

Copy `setup-worker.ps1` to the worker PC and run as Administrator:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-worker.ps1 -ControlNodeIP "10.10.13.30" -NodeName "pc2-coder"
```

### Step 3 — Worker PC (manual / any OS)

Create worker `.env`:
```env
CONTROL_NODE_URL=http://10.10.13.30:8000
ENROLLMENT_TOKEN=mac_enroll_xxxxx
NODE_NAME=pc2-coder
VLLM_MODEL=Qwen/Qwen2.5-Coder-7B-Instruct-AWQ
VLLM_PORT=8001
GPU_VRAM_MB=12288
```

```bash
docker compose -f docker-compose.worker-node.yml up -d
```

New nodes appear under Admin → **Cluster** within 30 seconds.

---

## Copy Check — AI Vision Marking

Faculty workflow for AI-assisted answer sheet grading and plagiarism detection.

### How It Works

1. **Create Session** — enter subject, class, department, total marks, optional syllabus/model-answer context
2. **Add Students** — students from the registry are listed; select which ones sat the exam
3. **Upload Sheets** — per-student JPG/PNG upload (answer-sheet photos)
4. **Evaluate All** — AI vision model reads each sheet, extracts answers, grades against syllabus, produces marks + feedback per student (background job; progress bar shown)
5. **Plagiarism Check** — pairwise comparison of all extracted answer texts; outputs:
   - 🔴 **Confirmed** (similarity > 90%)
   - 🟡 **Suspected** (70–90%)
   - 🟢 **Unlikely** (< 70%)
6. **Download PDF Report** — marks table, plagiarism pairs with similarity scores, per-student AI feedback

> **Access:** Faculty and Admin only. Students receive `403 Forbidden`.

### API
```bash
# Create session
POST /api/v1/copy-check/sessions
{ "subject": "DSA", "department": "CSE", "year": 3, "total_marks": 50 }

# Upload answer sheet
POST /api/v1/copy-check/sessions/{id}/sheets
FormData: file=@sheet.jpg, student_id=UUID

# Trigger AI evaluation
POST /api/v1/copy-check/sessions/{id}/evaluate

# Run plagiarism check
POST /api/v1/copy-check/sessions/{id}/plagiarism

# Download PDF
GET /api/v1/copy-check/sessions/{id}/report/pdf
```

---

## Architecture

```
  Students / Faculty / Admin
  (PWA Dashboard · OpenAI SDK · curl)
                │
          Port 8000
                │
         ┌──────┴──────┐
         │   MAC API    │  FastAPI — auth, routing, guardrails, copy check,
         │              │  attendance, notebooks, doubts, cluster mgmt
         └──────┬──────┘
                │
   ┌────────────┼──────────────┬──────────────┐
   │            │              │              │
 ┌─┴────┐  ┌───┴────┐  ┌─────┴─────┐  ┌────┴────┐
 │ vLLM │  │Postgres│  │   Redis   │  │ Qdrant  │
 │:8001+│  │ :5433  │  │   :6380   │  │(RAG vec)│
 └──────┘  └────────┘  └───────────┘  └─────────┘
```

---

## Models

### Chat Models
| Model | Specialty | VRAM |
|-------|-----------|------|
| `qwen2.5:7b` | General chat | ~5 GB |
| `qwen2.5-coder:7b` | Code generation | ~5 GB |
| `deepseek-r1:14b` | Math / reasoning | ~9 GB |
| `gemma3:27b` | Complex analysis | ~18 GB |

### Smart Routing (`model: "auto"`)
| Prompt contains | Routes to |
|-----------------|-----------|
| `python`, `debug`, `function`… | Coder model |
| `equation`, `prove`, `integral`… | Reasoning model |
| `explain`, `essay`, `research`… | Intelligence model |
| General | Speed model |

In cluster mode, requests also route to the **least-loaded GPU** across all workers.

### Other Modalities
| Model | Type | VRAM |
|-------|------|------|
| `whisper-large-v3-turbo` | Speech-to-text | ~4 GB |
| `tts-piper` | Text-to-speech | CPU |
| `nomic-embed-text` | Embeddings | ~550 MB |
| `moondream2` | Vision (answer sheets) | ~2 GB |

---

## API Reference

Base URL: `/api/v1` — Interactive docs at [`/docs`](http://localhost:8000/docs).

### Endpoints

| Area | Endpoint | Auth | Description |
|------|----------|------|-------------|
| **Auth** | `POST /auth/login` | — | Login → JWT |
| | `GET /auth/me` | JWT | Current user profile |
| | `POST /auth/admin/registry/upload` | Admin | Bulk student import |
| **Chat** | `POST /query/chat` | JWT/Key | Chat completion (streaming) |
| | `POST /query/embeddings` | JWT/Key | Generate embeddings |
| | `POST /query/speech-to-text` | JWT/Key | Audio transcription |
| | `POST /query/text-to-speech` | JWT/Key | Text to audio |
| **Models** | `GET /models` | — | List all available models |
| | `GET /models/community` | — | Live community models |
| | `POST /models/submit` | JWT | Submit model for admin review |
| **Copy Check** | `POST /copy-check/sessions` | Faculty/Admin | Create exam session |
| | `GET /copy-check/sessions` | Faculty/Admin | List sessions |
| | `POST /copy-check/sessions/{id}/sheets` | Faculty/Admin | Upload answer sheet |
| | `POST /copy-check/sessions/{id}/evaluate` | Faculty/Admin | Start AI grading |
| | `POST /copy-check/sessions/{id}/plagiarism` | Faculty/Admin | Run plagiarism check |
| | `GET /copy-check/sessions/{id}/report/pdf` | Faculty/Admin | Download PDF report |
| | `PATCH /copy-check/sessions/{id}/archive` | Faculty/Admin | Archive session |
| **Attendance** | `GET /attendance/settings` | Admin | View/configure time windows |
| | `POST /attendance/check-in` | Student | Biometric check-in |
| **Doubts** | `GET /doubts` | JWT | List doubts |
| | `POST /doubts` | Student | Submit a question |
| | `POST /doubts/{id}/reply` | Faculty/Admin | Answer a question |
| **Notebooks** | `GET /notebooks` | JWT | List notebooks |
| | `POST /notebooks` | JWT | Create notebook |
| | `WS /notebook-ws/{id}` | JWT | Live kernel execution |
| **Guardrails** | `GET /guardrails/rules` | Admin | List all rules |
| | `PATCH /guardrails/rules/{id}/toggle` | Admin | Enable/disable rule |
| | `POST /guardrails/rules` | Admin | Add custom rule |
| | `DELETE /guardrails/rules/{id}` | Admin | Remove rule |
| **Notifications** | `GET /notifications` | JWT | In-app notifications |
| | `GET /notifications/activity-stream` | Admin | SSE live activity feed |
| | `GET /notifications/audit-logs` | Admin | Searchable audit log |
| **Cluster** | `GET /nodes` | Admin | List worker nodes |
| | `GET /nodes/cluster-status` | Admin | Cluster health + GPU stats |
| | `POST /nodes/enrollment-token` | Admin | Generate enrollment token |
| **RAG** | `POST /rag/ingest` | JWT | Upload documents |
| | `POST /rag/query` | JWT | RAG-augmented answer |
| **Keys** | `POST /keys/generate` | JWT | Create API key |

### Rate Limits

| Role | Requests/Hour | Tokens/Day |
|------|---------------|------------|
| Student | 100 | 50,000 |
| Faculty | 300 | 200,000 |
| Admin | Unlimited | Unlimited |

---

## Student Registry Import

Admins can bulk-register students via CSV or JSON. Example files are in `examples/`.

**CSV** (`examples/students.csv`):
```csv
roll_number,name,email,department,year,section
CS2301,Aarav Sharma,aarav.sharma@college.edu,CSE,3,A
```

**JSON** (`examples/students.json`):
```json
[
  { "roll_number": "CS2301", "name": "Aarav Sharma", "email": "aarav.sharma@college.edu", "department": "CSE", "year": 3, "section": "A" }
]
```

Upload via Admin panel → **Registry** tab, or:
```bash
curl -X POST http://localhost:8000/api/v1/auth/admin/registry/upload \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "file=@examples/students.csv"
```

---

## Configuration

All settings via `.env`. See `.env.example`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://…` | PostgreSQL connection |
| `JWT_SECRET_KEY` | *(must change)* | JWT signing secret |
| `MAC_SECRET_KEY` | *(must change)* | App secret |
| `VLLM_BASE_URL` | `http://localhost:8001` | Primary LLM endpoint |
| `VLLM_SPEED_URL` | `http://localhost:8001` | Speed model |
| `VLLM_CODE_URL` | `http://localhost:8002` | Code model |
| `VLLM_REASONING_URL` | `http://localhost:8003` | Reasoning model |
| `RATE_LIMIT_REQUESTS_PER_HOUR` | `100` | Per-user rate limit |
| `RATE_LIMIT_TOKENS_PER_DAY` | `50000` | Daily token budget |

---

## Project Structure

```
MAC/
├── mac/
│   ├── main.py                      App entry, router registration
│   ├── config.py                    Settings from .env
│   ├── database.py                  SQLAlchemy async engine
│   ├── models/
│   │   ├── user.py                  User, StudentRegistry
│   │   ├── copy_check.py            CopyCheckSession, Sheet, Plagiarism
│   │   ├── notification.py          Notification, AuditLog
│   │   ├── guardrail.py             GuardrailRule
│   │   ├── attendance.py            AttendanceRecord, AttendanceSettings
│   │   └── doubts.py                Doubt, DoubtReply
│   ├── routers/
│   │   ├── copy_check.py            AI marking + plagiarism + PDF
│   │   ├── guardrails.py            Safety filter CRUD
│   │   ├── notifications.py         In-app + SSE activity stream
│   │   ├── attendance.py            Biometric attendance
│   │   ├── doubts.py                Student Q&A
│   │   ├── notebooks.py             Notebook management
│   │   ├── kernels.py               Jupyter kernel execution
│   │   └── ...                      18+ total route modules
│   ├── services/
│   │   ├── copy_check_service.py    AI eval, plagiarism, PDF generation
│   │   ├── guardrail_service.py     Rule matching, PII redaction
│   │   ├── kernel_manager.py        Kernel lifecycle
│   │   └── ...
│   └── middleware/
│       ├── auth_middleware.py       JWT + API key auth
│       └── rate_limit.py            Redis-backed rate limiting
│
├── frontend/
│   ├── index.html                   PWA shell
│   ├── app.js                       SPA (chat, copy check, notebooks, admin panels)
│   └── style.css                    Warm-palette theme + all component styles
│
├── examples/
│   ├── students.csv                 Sample student registry (16 entries)
│   └── students.json                Same data in JSON format
│
├── worker-packages/                 GPU worker agents
├── setup.bat                        One-click Windows setup
├── setup-worker.ps1                 Automated Windows worker setup
├── docker-compose.yml               Single-PC deployment
├── docker-compose.control-node.yml  Cluster — control node
├── docker-compose.worker-node.yml   Cluster — GPU worker
└── requirements.txt
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
| PDF Reports | fpdf2 |
| Auth | JWT + scoped API keys |
| Real-time | Server-Sent Events (sse-starlette) |
| Frontend | Vanilla JS PWA (no framework) |
| Containers | Docker Compose |
| Migrations | Alembic |

---

## License

MIT — MBM University, Jodhpur

