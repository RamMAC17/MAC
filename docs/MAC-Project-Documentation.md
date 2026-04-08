# MAC — MBM AI Cloud: Complete Project Documentation

> A self-hosted AI inference platform that turns a single GPU-equipped PC into a private AI cloud for an entire college.

---

## Table of Contents

1. [What is MAC?](#1-what-is-mac)
2. [Why Does MAC Exist?](#2-why-does-mac-exist)
3. [How Does It Work? (Big Picture)](#3-how-does-it-work-big-picture)
4. [System Architecture (Deep Dive)](#4-system-architecture-deep-dive)
5. [The AI Models — What, Why, and How](#5-the-ai-models--what-why-and-how)
6. [Why vLLM?](#6-why-vllm)
7. [Smart Routing — Automatic Model Selection](#7-smart-routing--automatic-model-selection)
8. [Authentication and API Keys](#8-authentication-and-api-keys)
9. [Usage Tracking and Quotas](#9-usage-tracking-and-quotas)
10. [The Frontend Dashboard (PWA)](#10-the-frontend-dashboard-pwa)
11. [RAG — Knowledge Base Search](#11-rag--knowledge-base-search)
12. [Web Search Integration](#12-web-search-integration)
13. [Guardrails — Content Safety](#13-guardrails--content-safety)
14. [Infrastructure Services](#14-infrastructure-services)
15. [API Design Principles](#15-api-design-principles)
16. [Security Model](#16-security-model)
17. [Hardware Requirements and GPU Planning](#17-hardware-requirements-and-gpu-planning)
18. [Setup Guide — Step by Step](#18-setup-guide--step-by-step)
19. [How Students Use MAC](#19-how-students-use-mac)
20. [How Admins Manage MAC](#20-how-admins-manage-mac)
21. [Troubleshooting](#21-troubleshooting)
22. [Project File Map](#22-project-file-map)
23. [Technology Choices Explained](#23-technology-choices-explained)

---

## 1. What is MAC?

**MAC** stands for **MBM AI Cloud**. It is a complete AI platform that runs on a local server inside a college. Think of it as your own private ChatGPT — but you own the hardware, the data stays on campus, and there are no per-token API charges.

MAC takes a PC with a decent GPU, loads open-source language models onto it, and exposes them through a clean API that is **100% compatible with the OpenAI SDK**. This means any tool, library, or application that works with OpenAI's API can work with MAC — just change the base URL.

The platform includes:
- **Multiple AI models** running simultaneously, each specializing in different tasks
- **A web dashboard** where students log in and chat directly
- **API keys** so students can use the AI from their own code, Jupyter notebooks, or apps
- **Usage tracking** so admins know who is using what and how much
- **Rate limiting and quotas** to ensure fair use across all students
- **Content guardrails** to keep responses appropriate
- **RAG (knowledge base)** to let the AI answer questions from uploaded documents
- **Web search** so the AI can fetch and reason over live internet data

---

## 2. Why Does MAC Exist?

### The Problem

College students need access to AI for coursework, projects, research, and learning. But:

1. **Cloud APIs are expensive.** OpenAI charges per token. A class of 60 students doing assignments quickly runs up a bill.
2. **Free tiers are limited.** ChatGPT Free has message caps, no API, and can't be integrated into projects.
3. **Data privacy matters.** Research data, student work, and college documents shouldn't be sent to third-party cloud servers.
4. **Internet dependency.** Many Indian colleges have unreliable internet. A local server works even when the internet is down.

### The Solution

MAC puts the AI on a server that sits physically in the college lab. The models run directly on the server's GPU. Students connect over the campus network (or LAN). No internet required for inference, no per-token billing, and all data stays on campus.

### The Economics

- A single RTX 4090 GPU (₹1.5-2L) can serve 30-50 concurrent students running 7B-14B models
- The same usage via OpenAI's API would cost ₹50K-1L per month
- MAC pays for itself in 2-3 months, then runs at zero marginal cost

---

## 3. How Does It Work? (Big Picture)

Here's what happens when a student sends a message:

```
Student types "Write a Python function for binary search"
    │
    ▼
Browser → Nginx (port 80) → MAC API (port 8000)
    │
    ▼
MAC checks: Is the student authenticated? → Yes (JWT token valid)
MAC checks: Has the student exceeded their quota? → No
MAC checks: Does the message violate guardrails? → No
    │
    ▼
Smart Router analyzes the message:
  "Python function" → code keywords detected → Route to Code Model
    │
    ▼
MAC sends request to vLLM Code Server (port 8002)
  → Qwen2.5-Coder-7B-Instruct processes the prompt on the GPU
  → Generates response tokens
    │
    ▼
Response streams back: MAC API → Nginx → Browser
    │
    ▼
MAC logs: user=21CS045, model=qwen2.5-coder:7b, tokens=342, latency=1.2s
    │
    ▼
Student sees the response in the chat UI (streamed in real-time)
```

That's the full flow. Every request follows this path. The smart router, authentication, quota checks, and logging all happen in milliseconds before the actual AI inference begins.

---

## 4. System Architecture (Deep Dive)

MAC is a **microservices architecture** — each component runs as a separate Docker container, communicating over an internal Docker network.

### The Components

#### Nginx (Port 80)
The single entry point. All traffic goes through Nginx. It does two things:
- Serves the **frontend dashboard** (static HTML/CSS/JS files) directly
- **Reverse-proxies** all `/api/*` requests to the MAC API backend

This means students only need to know one URL: `http://server-ip`. Nginx figures out what goes where.

#### MAC API (Port 8000)
The brain of the platform. Written in Python using **FastAPI**. This is where all the business logic lives:
- **11 routers** handling different API areas (auth, query, models, keys, usage, quota, guardrails, rag, search, explore, integration)
- **7 services** containing the core logic (auth, LLM, model management, usage tracking, guardrails, RAG, search)
- **Middleware** for JWT authentication and rate limiting
- **Database models** for users, usage logs, quotas, guardrail rules, RAG documents

The API runs with **4 Uvicorn workers** (async Python HTTP server) for concurrent request handling.

#### vLLM Servers (Ports 8001-8004)
Each AI model gets its own vLLM server process. vLLM exposes an **OpenAI-compatible API**, so MAC talks to it using the exact same format as the OpenAI API.

Why separate instances? Because:
- Each model needs its own dedicated GPU memory
- If one model crashes, the others keep running
- You can restart or swap individual models without downtime

#### PostgreSQL (Port 5432)
The relational database. Stores:
- **Users** — roll number, email, hashed password, role
- **Usage logs** — every API request with model, tokens, latency
- **Refresh tokens** — for JWT session management
- **Quota overrides** — custom limits per user
- **Guardrail rules** — content moderation configuration
- **RAG documents** — metadata for uploaded knowledge base files

#### Redis (Port 6379)
An in-memory key-value store used for:
- **Rate limiting** — tracking requests per user per hour
- **Token counting** — tracking daily token consumption per user
- **Caching** — search results, model health status

#### Qdrant (Port 6333)
A vector database used for **RAG** (Retrieval-Augmented Generation). When documents are uploaded, they're split into chunks, converted to embeddings (vector representations), and stored in Qdrant. When a user asks a question, Qdrant finds the most relevant chunks to include as context for the AI.

#### SearXNG (Port 8888)
A self-hosted meta search engine. When a user requests a "grounded" answer, MAC:
1. Searches the web via SearXNG
2. Extracts relevant content from the results
3. Feeds that content to the AI as context
4. The AI generates an answer backed by real web sources

---

## 5. The AI Models — What, Why, and How

### Model Selection Philosophy

Not all AI tasks are equal. A student asking "What is a linked list?" needs a fast answer. A student asking "Prove that the sum of the first n squares equals n(n+1)(2n+1)/6" needs deep reasoning. A student asking "Debug this 200-line Python script" needs code expertise.

MAC solves this by running **specialized models** for different task categories:

### The Four Tiers

#### 1. Speed Tier — Qwen2.5-7B-Instruct
- **Purpose:** Fast general-purpose responses
- **Good at:** Q&A, summarization, general chat, simple explanations
- **Parameters:** 7 billion
- **GPU VRAM:** ~5 GB
- **Response speed:** Fastest (high tokens/second due to small size)
- **Why this model:** Qwen2.5 from Alibaba ranks near the top of the 7B model benchmarks. It's fast enough for real-time chat and smart enough for most daily questions.

#### 2. Code Tier — Qwen2.5-Coder-7B-Instruct
- **Purpose:** Code generation, debugging, explanation
- **Good at:** Writing functions, fixing bugs, explaining code, generating tests
- **Parameters:** 7 billion
- **GPU VRAM:** ~5 GB
- **Response speed:** Fast (same architecture as speed tier)
- **Why this model:** Specifically fine-tuned on code data. It understands Python, JavaScript, Java, C++, SQL, and 50+ languages far better than a general model of the same size.

#### 3. Reasoning Tier — DeepSeek-R1-Distill-Qwen-14B
- **Purpose:** Step-by-step logical reasoning and mathematics
- **Good at:** Proofs, equations, calculus, physics problems, multi-step logic
- **Parameters:** 14 billion
- **GPU VRAM:** ~9 GB
- **Response speed:** Moderate (larger model, more compute per token)
- **Why this model:** DeepSeek-R1 pioneered "chain-of-thought" reasoning in open-source models. The 14B distilled version retains most of R1's reasoning ability while fitting on consumer GPUs.

#### 4. Intelligence Tier — Gemma-3-27B-IT (Optional)
- **Purpose:** Complex analysis, creative writing, research assistance
- **Good at:** Essays, comparisons, in-depth explanations, nuanced understanding
- **Parameters:** 27 billion
- **GPU VRAM:** ~18 GB
- **Response speed:** Slower (largest model)
- **Requirement:** 48GB+ GPU (this model is disabled by default on 24GB GPUs)
- **Why this model:** Google's Gemma 3 is one of the highest-quality open-source models available. The 27B variant approaches the quality of much larger closed models.

### How Models Are Served

Each model runs as a **separate vLLM Docker container**. vLLM loads the model weights into GPU memory at startup and keeps them there. When a request comes in, vLLM:

1. Tokenizes the input (converts text to numbers the model understands)
2. Runs forward passes through the neural network on the GPU
3. Generates output tokens one at a time (or in batches)
4. Streams the response back

The model weights are downloaded from **HuggingFace Hub** on first startup and cached in a shared Docker volume (`hf-cache`). This means:
- First startup: 10-15 minutes (downloads ~15GB of model weights)
- Every subsequent startup: Instant (reads from cache)

---

## 6. Why vLLM?

When serving language models, the serving engine matters enormously. Here's why vLLM was chosen over alternatives:

### vLLM vs. Ollama
| Feature | vLLM | Ollama |
|---------|------|--------|
| **Concurrent users** | Excellent (continuous batching) | Poor (sequential processing) |
| **Memory efficiency** | PagedAttention (2-4x better) | Standard KV-cache |
| **Throughput (tokens/sec)** | Very high | Moderate |
| **GPU memory control** | Precise (`--gpu-memory-utilization`) | Automatic, less control |
| **OpenAI API compatibility** | Native | Partial |
| **Multi-model on one GPU** | Yes (with memory splitting) | Difficult |
| **Production readiness** | Enterprise-grade | Developer tool |

### vLLM vs. Raw HuggingFace Transformers
| Feature | vLLM | HuggingFace |
|---------|------|-------------|
| **Serving overhead** | Minimal (built for serving) | High (built for research) |
| **Batching** | Automatic continuous batching | Manual |
| **Memory optimization** | PagedAttention, prefix caching | None by default |
| **API server** | Built-in OpenAI-compatible | Must build your own |

### Key vLLM Technologies
- **PagedAttention:** Instead of allocating a contiguous block of GPU memory for each request's KV-cache (wasteful), vLLM uses a paged approach (like virtual memory in operating systems). This allows up to 24x more concurrent requests.
- **Continuous Batching:** Traditional serving processes requests one batch at a time. vLLM dynamically adds new requests to the running batch without waiting for all previous requests to finish. This means near-zero wait time.
- **Prefix Caching:** If multiple requests start with the same system prompt, vLLM reuses the computed KV-cache instead of recomputing it.

---

## 7. Smart Routing — Automatic Model Selection

When a student sends `"auto"` as the model (or uses the default), MAC's **smart router** reads the prompt and decides which model to use.

### How It Works

The router scans the user's message for keywords in three categories:

**Code keywords** (25+ words):
`code`, `function`, `bug`, `debug`, `python`, `javascript`, `class`, `api`, `algorithm`, `programming`, `html`, `css`, `sql`, `git`, `docker`, `def `, `import `, `print(`...

**Math keywords** (20+ words):
`math`, `equation`, `calculate`, `prove`, `integral`, `derivative`, `theorem`, `matrix`, `algebra`, `calculus`, `probability`, `statistics`, `solve`...

**Intelligence keywords** (20+ words):
`explain`, `analyze`, `research`, `essay`, `write`, `creative`, `story`, `compare`, `evaluate`, `summarize`, `thesis`, `report`, `comprehensive`...

### Routing Logic

```
1. Count how many code keywords appear → code_score
2. Count how many math keywords appear → math_score
3. Count how many intel keywords appear → intel_score

4. If math_score > code_score AND math_score >= 2 → DeepSeek-R1 (reasoning)
5. If code_score >= 1                              → Qwen2.5-Coder (code)
6. If intel_score >= 2                             → Gemma-3 (intelligence)
7. Otherwise                                       → Qwen2.5 (speed — general)
```

### Examples

| Student Message | Routed To | Reason |
|---|---|---|
| "Write a Python function for binary search" | Qwen2.5-Coder | "python" + "function" → code |
| "Prove that √2 is irrational using calculus" | DeepSeek-R1 | "prove" + "calculus" → math (score 2) |
| "Write a comprehensive essay comparing democracy vs communism" | Gemma-3 | "comprehensive" + "essay" + "compare" → intel (score 3) |
| "What is the capital of France?" | Qwen2.5 | No category matches → fast general |

Students can bypass smart routing by specifying a model ID directly: `"model": "deepseek-r1:14b"`.

---

## 8. Authentication and API Keys

MAC uses a dual authentication system:

### 1. JWT Tokens (Session-Based)

Used for the **web dashboard**:
- Student logs in with roll number + date of birth (first time) or roll number + password (after setting one)
- Server returns an **access token** (valid 24 hours) and a **refresh token** (valid 30 days)
- Every API request includes the access token in the `Authorization: Bearer <token>` header
- When the access token expires, the frontend silently uses the refresh token to get a new one

### 2. API Keys (Persistent)

Used for **programmatic access**:
- Students generate an API key from the dashboard or via `POST /api/v1/keys/generate`
- The key looks like: `mac_7a3b9c2d...` (32-character hex string)
- It can be used anywhere — Python scripts, Jupyter notebooks, curl, VSCode extensions, mobile apps
- The key doesn't expire (unless revoked), so students don't need to re-authenticate
- All usage is tracked per key: which model, how many tokens, when

### How API Keys Are Tracked

Every request made with an API key is logged:
```json
{
  "user": "21CS045",
  "api_key": "mac_7a3b...",
  "model": "qwen2.5-coder:7b",
  "prompt_tokens": 45,
  "completion_tokens": 287,
  "total_tokens": 332,
  "latency_ms": 1200,
  "timestamp": "2025-04-15T10:30:00Z"
}
```

Admins can see:
- Total usage per student
- Which models each student uses most
- Usage over time (daily/hourly patterns)
- Who is exceeding their quotas

---

## 9. Usage Tracking and Quotas

### Why Quotas?

GPU time is a shared resource. Without limits, one student running a script in a loop could consume all available compute, leaving nothing for others.

### Default Limits

| Role | Requests per Hour | Tokens per Day |
|------|------------------|---------------|
| Student | 100 | 50,000 |
| Faculty | 300 | 200,000 |
| Admin | Unlimited | Unlimited |

### How It Works

1. **Request-level:** Every request to `/query/*` endpoints is counted. Redis stores a counter per user with a 1-hour TTL.
2. **Token-level:** After each response, the total tokens (prompt + completion) are added to a daily counter in Redis.
3. **Headers:** Every response includes `X-RateLimit-Remaining` and `X-TokenLimit-Remaining` so the client always knows how much quota is left.
4. **Rejection:** When limits are exceeded, the API returns `429 Too Many Requests` with details on when the limit resets.

### Custom Overrides

Admins can set per-user overrides. For example, a student working on a research project might get 200,000 tokens/day instead of the default 50,000:

```
PUT /api/v1/quota/admin/user/21CS045
{
  "requests_per_hour": 200,
  "tokens_per_day": 200000
}
```

---

## 10. The Frontend Dashboard (PWA)

The dashboard is a **Progressive Web App** built with vanilla JavaScript, HTML, and CSS. No React, no Vue, no build tools — just files served directly by Nginx.

### Features

**For Students:**
- **Chat interface** — Send messages, choose models (or use auto), see streaming responses
- **Stat cards** — Total requests, tokens used, active models, days active
- **Activity heatmap** — GitHub-style 26-week grid showing daily usage intensity
- **Model distribution doughnut** — Which models you use most
- **Hourly usage chart** — Gradient area chart showing activity by hour
- **Quota rings** — Visual progress indicators for request and token limits
- **Activity table** — Recent requests with model, tokens, and timestamp

**For Admins:**
- **User management** — View all users, their roles, and usage
- **Model management** — Monitor model health, load/unload
- **Quota management** — Set limits, view who's exceeding quotas
- **API key management** — View all keys, revoke misbehaving ones
- **System health** — infrastructure status, uptime

### Why a PWA?
- Works on any device — desktop, laptop, phone, tablet
- Can be installed to the home screen (looks like a native app)
- Works offline for cached resources (service worker)
- No app store approval needed
- Instant updates (just refresh)

### Interactive Particle Background
The login screen features an animated canvas background with floating particles that form "MAC" and "MBM" text. The particles have physics-based hover interaction — they disperse when the cursor approaches and rejoin when it moves away.

---

## 11. RAG — Knowledge Base Search

**RAG** stands for **Retrieval-Augmented Generation**. It lets the AI answer questions based on specific documents you upload — like textbooks, research papers, or lecture notes.

### How It Works

1. **Upload:** A user uploads a document (PDF, TXT, etc.) via the API or dashboard
2. **Chunking:** MAC splits the document into small overlapping chunks (~500 tokens each)
3. **Embedding:** Each chunk is converted to a vector (a list of numbers that captures its meaning) using an embedding model
4. **Storage:** The vectors are stored in Qdrant alongside the original text
5. **Query:** When a user asks a question:
   - The question is also converted to a vector
   - Qdrant finds the most similar document chunks (nearest neighbors in vector space)
   - Those chunks are prepended to the AI prompt as context
   - The AI generates an answer grounded in the retrieved documents

### Example

A professor uploads the "Data Structures" textbook. A student asks:
> "Explain how AVL trees maintain balance after insertion"

Without RAG: The AI gives a general answer from its training data.
With RAG: The AI finds the relevant textbook section about AVL rotations and gives a specific answer that matches the course material.

---

## 12. Web Search Integration

MAC includes **SearXNG**, a self-hosted meta search engine. This enables three search features:

### Web Search
```
POST /api/v1/search/web
{"query": "latest Python 3.13 features"}
```
Returns top search results from multiple engines (Google, Bing, DuckDuckGo, etc.) without sending user data to any single search engine.

### Wikipedia Search
```
POST /api/v1/search/wikipedia
{"query": "PagedAttention mechanism"}
```
Searches Wikipedia specifically and returns relevant article summaries.

### Grounded Search
```
POST /api/v1/search/grounded
{"query": "What are the new features in CUDA 12.4?"}
```
This is the most powerful: MAC searches the web, extracts content from top results, feeds it to the AI as context, and returns an answer that cites real sources. The AI doesn't hallucinate because it's working from actual web pages.

---

## 13. Guardrails — Content Safety

MAC has a content moderation layer to keep AI interactions appropriate:

### Input Guardrails
Before a prompt reaches the AI, it's checked for:
- Blocked keywords or phrases
- Prompt injection attempts
- Requests to generate harmful content

### Output Guardrails
After the AI generates a response, it's checked for:
- Personal Identifiable Information (PII) leakage
- Inappropriate content
- Safety violations

### Configuration
Admins configure guardrail rules via the API:
```
PUT /api/v1/guardrails/rules
{
  "blocked_categories": ["violence", "malware"],
  "custom_blocked_phrases": ["how to hack", "generate exploit"],
  "pii_detection": true
}
```

---

## 14. Infrastructure Services

### PostgreSQL 16
- **Role:** Primary data store for all structured data
- **Stored data:** Users, usage logs, tokens, quotas, guardrail rules, RAG metadata
- **Why PostgreSQL:** Robust, ACID-compliant, handles concurrent writes from multiple API workers, excellent query performance, widely supported

### Redis 7
- **Role:** In-memory data store for rate limiting and caching
- **How rate limiting works:** Each user has a Redis key `ratelimit:user_id` with a counter and TTL. Incremented on each request. When it exceeds the limit, requests are rejected.
- **Why Redis:** Sub-millisecond read/write, perfect for checking rate limits on every request without adding latency

### Nginx
- **Role:** Reverse proxy and static file server
- **Why Nginx:** Extremely fast at serving static files (the frontend), handles thousands of concurrent connections, provides rate limiting at the network level (10 req/sec per IP), supports SSE streaming for chat responses

### Docker Compose
- **Role:** Orchestrates all services into a single `docker compose up` command
- **Why Docker:** Guarantees identical environments everywhere, isolates services, makes updates easy (`docker compose pull && docker compose up -d`)

---

## 15. API Design Principles

MAC's API follows specific design principles:

1. **OpenAI-compatible:** The `/query/chat` endpoint accepts the exact same request format as OpenAI's API. Any code that works with `openai` Python package works with MAC.

2. **RESTful:** Resources are nouns (`/models`, `/keys`, `/usage`), actions are HTTP verbs (`GET` = read, `POST` = create, `PUT` = update, `DELETE` = remove).

3. **Versioned:** All endpoints are under `/api/v1/` so the API can evolve without breaking existing clients.

4. **Streaming:** Chat responses are streamed via **Server-Sent Events (SSE)**. Tokens appear one by one in real-time, just like ChatGPT. This is critical for user experience — waiting 10 seconds for a complete response feels slow; seeing tokens appear instantly feels fast.

5. **Self-documenting:** FastAPI auto-generates interactive Swagger docs at `/docs` and ReDoc at `/redoc`. Every endpoint, parameter, and response type is documented.

---

## 16. Security Model

### Authentication Chain
```
Request arrives
    │
    ├─ Has "Authorization: Bearer <JWT>" header?
    │   └─ Yes → Validate JWT signature and expiry → Proceed
    │
    ├─ Has "Authorization: Bearer mac_<key>" header?
    │   └─ Yes → Look up API key in database → Proceed
    │
    └─ Neither → Return 401 Unauthorized
```

### Password Security
- Passwords are hashed with **bcrypt** (cost factor 12) before storage
- Raw passwords are never stored or logged
- JWT tokens are signed with **HS256** using a secret key from the environment

### Rate Limiting (Two Layers)
1. **Nginx layer:** 10 requests/second per IP address (prevents DDoS)
2. **Application layer:** Per-user limits with Redis (prevents quota abuse)

### Access Control (Three Roles)
| Role | Can Do |
|------|--------|
| **Student** | Chat, view own usage, manage own API key |
| **Faculty** | Same as student + higher limits |
| **Admin** | Everything: manage users, quotas, models, guardrails, view all usage |

---

## 17. Hardware Requirements and GPU Planning

### Minimum Requirements (3 models: speed + code + reasoning)
- **GPU:** NVIDIA GPU with 24GB VRAM (RTX 3090, RTX 4090, A5000)
- **CPU:** 8 cores / 16 threads
- **RAM:** 32 GB
- **Storage:** 100 GB SSD (for model weights and database)
- **Network:** Gigabit Ethernet (for serving multiple students)
- **OS:** Ubuntu 22.04 or Windows 11 with WSL2

### Recommended (4 models including Gemma-3-27B)
- **GPU:** 48GB+ VRAM (A6000, 2× RTX 3090, A100)
- **CPU:** 16 cores
- **RAM:** 64 GB
- **Storage:** 200 GB NVMe SSD

### How GPU Memory is Shared

vLLM's `--gpu-memory-utilization` flag controls how much GPU memory each model can use:

```
24 GB GPU:
├── vLLM Speed (Qwen2.5-7B):    0.22 × 24 = 5.3 GB
├── vLLM Code (Coder-7B):       0.22 × 24 = 5.3 GB
├── vLLM Reasoning (R1-14B):    0.35 × 24 = 8.4 GB
└── Free for CUDA overhead:     ~5.0 GB
```

Each vLLM instance reserves its memory at startup. They don't interfere with each other.

### Scaling for More Students

| Students | GPU Recommendation |
|----------|-------------------|
| 1-20 | Single RTX 4090 (24GB) |
| 20-50 | A6000 (48GB) or 2× RTX 4090 |
| 50-100 | A100 (80GB) or multiple GPUs with tensor parallelism |
| 100+ | Multiple servers with MAC's worker integration |

---

## 18. Setup Guide — Step by Step

### Option A: Docker (Recommended)

This is the fastest way. Docker handles everything — database, cache, models, proxy.

**Step 1: Install Docker and NVIDIA Container Toolkit**

For Ubuntu:
```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

For Windows:
- Install Docker Desktop with WSL2 backend
- In WSL2: Install NVIDIA Container Toolkit (same commands as Ubuntu)

**Step 2: Clone and Configure**
```bash
git clone https://github.com/23f2003700/mac.git
cd mac
cp .env.example .env
```

Edit `.env`:
- Change `JWT_SECRET_KEY` to a random string
- Change `MAC_SECRET_KEY` to a different random string
- Everything else can stay default for local use

**Step 3: Start**
```bash
docker compose up -d
```

Watch the logs to see models downloading:
```bash
docker compose logs -f vllm-speed    # Watch Qwen2.5-7B downloading
docker compose logs -f vllm-code     # Watch Qwen2.5-Coder downloading
docker compose logs -f vllm-reason   # Watch DeepSeek-R1 downloading
```

When you see `Uvicorn running on http://0.0.0.0:800X` in each log, the models are ready.

**Step 4: Access**
- Dashboard: `http://localhost` (or `http://server-ip` from other machines)
- API Docs: `http://localhost/docs`
- Health: `http://localhost/api/v1/explore/health`

### Option B: Manual (No Docker)

See the [Manual Setup](../README.md#manual-setup-no-docker) section in the README.

---

## 19. How Students Use MAC

### Using the Dashboard

1. Open `http://server-ip` in a browser
2. Log in with your roll number and password
3. Type a message in the chat box
4. The AI responds in real-time (streaming)
5. Choose a model from the dropdown, or leave it on "auto"
6. View your usage stats on the dashboard

### Using the API Key (for projects and scripts)

1. Log in to the dashboard
2. Go to Settings → Generate API Key
3. Copy the key (e.g., `mac_7a3b9c2d...`)
4. Use it in your code:

**Python:**
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://server-ip/api/v1/query",
    api_key="mac_7a3b9c2d..."
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain quicksort"}]
)
print(response.choices[0].message.content)
```

**curl:**
```bash
curl http://server-ip/api/v1/query/chat \
  -H "Authorization: Bearer mac_7a3b9c2d..." \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello"}]}'
```

**JavaScript:**
```javascript
const response = await fetch('http://server-ip/api/v1/query/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer mac_7a3b9c2d...',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'Hello' }]
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

The API key works from anywhere on the campus network — laptops, phones, lab computers. Usage is tracked to your account regardless of the device.

---

## 20. How Admins Manage MAC

### Dashboard Admin Panel

Login as admin to access the admin tabs:
- **Users** — See all registered users, their roles, last active time
- **Models** — Check which models are online/offline, view health metrics
- **Quotas** — See who's approaching or exceeding limits, set overrides
- **Keys** — View all API keys, revoke any that are being misused
- **System** — Overall health, uptime, resource usage

### Common Admin Tasks

**Add a new student:**
Students are created on first login (verify with roll number + DOB). Admins can also create bulk accounts.

**Increase a student's quota:**
```bash
curl -X PUT http://localhost/api/v1/quota/admin/user/21CS045 \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requests_per_hour": 200, "tokens_per_day": 200000}'
```

**Check which model is most used:**
```bash
curl http://localhost/api/v1/usage/admin/models \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Revoke a misbehaving API key:**
```bash
curl -X POST http://localhost/api/v1/keys/admin/revoke \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"roll_number": "21CS045"}'
```

### Server Maintenance

**Update models:**
Edit `docker-compose.yml` to change model names/versions, then:
```bash
docker compose up -d --build
```

**View logs:**
```bash
docker compose logs -f mac           # API logs
docker compose logs -f vllm-speed    # Speed model logs
docker compose logs -f postgres      # Database logs
```

**Backup the database:**
```bash
docker exec mac-postgres pg_dump -U mac mac_db > backup.sql
```

**Restore from backup:**
```bash
docker exec -i mac-postgres psql -U mac mac_db < backup.sql
```

---

## 21. Troubleshooting

### vLLM Won't Start

**Symptom:** `docker compose logs vllm-speed` shows CUDA errors.

**Causes:**
1. NVIDIA driver not installed → `nvidia-smi` should show GPU info
2. NVIDIA Container Toolkit not installed → `docker run --gpus all nvidia/cuda:12.0-base nvidia-smi` should work
3. Not enough GPU memory → Reduce `--gpu-memory-utilization` values in `docker-compose.yml`

### MAC API Shows "Model Unavailable"

**Symptom:** Chat returns "vLLM returned 502" or connection refused.

**Cause:** The vLLM instance for that model isn't running or hasn't finished starting up.

**Fix:**
1. Check if the vLLM container is running: `docker compose ps`
2. Check its logs: `docker compose logs vllm-speed`
3. Wait for model download to finish (first startup only)

### Slow Responses

**Cause:** GPU is at capacity with too many concurrent requests.

**Fix:**
- Reduce `--max-model-len` (uses less GPU memory per request, allowing more concurrent requests)
- Remove a model to free GPU memory
- Upgrade to a larger GPU

### Out of Memory (OOM)

**Symptom:** vLLM crashes with CUDA OOM error.

**Fix:**
1. Reduce `--gpu-memory-utilization` for each vLLM instance
2. Reduce `--max-model-len` (most impactful)
3. Remove a model to free memory
4. Restart: `docker compose restart vllm-speed`

### Frontend Not Loading

**Cause:** Nginx isn't running or can't find the frontend files.

**Fix:**
```bash
docker compose restart nginx
docker compose logs nginx
```

### Database Connection Failed

**Cause:** PostgreSQL isn't ready when MAC starts.

**Fix:** The Docker Compose configuration includes health checks that prevent MAC from starting before PostgreSQL is ready. If it still fails:
```bash
docker compose restart mac
```

---

## 22. Project File Map

```
mac/                         ← Python backend package
├── __init__.py
├── main.py                  ← FastAPI app, startup events, DB init, user seeding
├── config.py                ← Pydantic settings loaded from .env
├── database.py              ← SQLAlchemy async engine and session factory
├── models/                  ← Database table definitions (SQLAlchemy ORM)
│   ├── user.py              ← User, RefreshToken, UsageLog tables
│   ├── guardrail.py         ← GuardrailRule table
│   ├── quota.py             ← QuotaOverride table
│   └── rag.py               ← RAGCollection, RAGDocument tables
├── schemas/                 ← Pydantic request/response schemas (11 files)
│   ├── auth.py              ← Login, token, password change schemas
│   ├── chat.py              ← Chat completion request/response
│   ├── explore.py           ← Model listing, health schemas
│   └── ...                  ← (one per router)
├── routers/                 ← API endpoint handlers (11 files)
│   ├── auth.py              ← /auth/* endpoints
│   ├── query.py             ← /query/* (chat, completions, embeddings)
│   ├── models.py            ← /models/* (health, load/unload)
│   ├── keys.py              ← /keys/* (generate, revoke, stats)
│   ├── usage.py             ← /usage/* (personal + admin stats)
│   ├── quota.py             ← /quota/* (limits, overrides)
│   ├── guardrails.py        ← /guardrails/* (content moderation)
│   ├── rag.py               ← /rag/* (document upload, search)
│   ├── search.py            ← /search/* (web, wikipedia, grounded)
│   ├── explore.py           ← /explore/* (public model list, health)
│   └── integration.py       ← /integration/* (routing rules, workers)
├── services/                ← Business logic (7 files)
│   ├── llm_service.py       ← ★ Core: model registry, smart routing, vLLM proxy
│   ├── auth_service.py      ← Login verification, JWT creation, password management
│   ├── usage_service.py     ← Log requests, aggregate stats, admin reports
│   ├── model_service.py     ← Model health checks, warmup, management
│   ├── guardrail_service.py ← Input/output content filtering
│   ├── rag_service.py       ← Document ingestion, chunking, vector search
│   └── search_service.py    ← Web search, Wikipedia, grounded answers
├── middleware/               ← Request interceptors
│   ├── auth_middleware.py   ← JWT/API-key validation on every request
│   └── rate_limit.py        ← Redis-based rate limiting
└── utils/
    └── security.py          ← Password hashing, JWT encode/decode, request IDs

frontend/                    ← PWA dashboard (served by Nginx)
├── index.html               ← Single-page app shell
├── app.js                   ← Full application (login, chat, dashboard, admin)
├── style.css                ← Responsive styles, particle background
├── manifest.json            ← PWA manifest (name, icons, theme)
└── sw.js                    ← Service worker for caching

nginx/
└── nginx.conf               ← Reverse proxy rules, rate limiting, static serving

tests/                       ← Pytest test suite
├── conftest.py              ← Shared fixtures (test client, auth helpers)
├── test_auth.py             ← Authentication tests
├── test_query.py            ← Chat completion and routing tests
├── test_models.py           ← Model management tests
├── test_keys.py             ← API key tests
├── test_usage.py            ← Usage tracking tests
├── test_quota.py            ← Quota enforcement tests
├── test_guardrails.py       ← Content moderation tests
├── test_rag.py              ← RAG pipeline tests
├── test_search.py           ← Search integration tests
├── test_explore.py          ← Public API tests
└── test_integration.py      ← Worker/routing tests

docker-compose.yml           ← Full-stack orchestration (all services)
Dockerfile                   ← MAC API container build
requirements.txt             ← Python dependencies
alembic.ini                  ← Database migration config
alembic/                     ← Migration scripts directory
```

---

## 23. Technology Choices Explained

### Why FastAPI (and not Flask or Django)?

| Factor | FastAPI | Flask | Django |
|--------|---------|-------|--------|
| **Async support** | Native (built on ASGI) | Bolt-on | Bolt-on |
| **Speed** | One of the fastest Python frameworks | Moderate | Slower |
| **Auto-docs** | Built-in Swagger + ReDoc | Manual | Manual |
| **Type checking** | First-class Pydantic integration | None | Basic |
| **Learning curve** | Low | Low | High |
| **Streaming** | Native SSE support | Difficult | Difficult |

For an AI proxy that needs async HTTP, streaming responses, and auto docs, FastAPI is the clear choice.

### Why PostgreSQL (and not SQLite or MySQL)?

- **Concurrent writes** — Multiple API workers writing usage logs simultaneously. SQLite locks on writes.
- **JSONB support** — For storing flexible metadata (guardrail rules, model configs)
- **Robust** — Battle-tested, handles millions of rows, excellent query optimizer
- **Production standard** — Same DB in development and production means no surprises

(SQLite is still supported for quick dev/testing via `aiosqlite`.)

### Why Redis?

Rate limiting needs sub-millisecond reads on every single request. A database query would add 1-5ms per request. Redis returns in <0.1ms because data is in memory.

### Why Docker Compose?

Starting MAC manually would mean:
1. Start PostgreSQL server
2. Start Redis server
3. Start 3 vLLM instances
4. Start Qdrant
5. Start SearXNG
6. Start Nginx
7. Start the MAC API

With Docker Compose: `docker compose up -d`. One command. Done.

### Why Nginx (and not serving from FastAPI directly)?

- **Static files** — Nginx serves HTML/CSS/JS at wire speed. FastAPI would waste Python CPU cycles on static files.
- **Reverse proxy** — Nginx cleanly separates "frontend at /" and "API at /api/"
- **Rate limiting** — Network-level protection before requests even reach Python
- **Buffering** — Handles slow clients without tying up FastAPI workers
- **Production standard** — Used by Netflix, Airbnb, and millions of other applications

### Why Vanilla JS (and not React/Vue)?

The entire frontend is ~3 files (HTML + JS + CSS). Adding React would mean:
- A build step (npm, webpack/vite)
- 100+ npm dependencies
- 10x more code for the same functionality
- A separate dev server during development

For a dashboard with chat + charts + admin panel, vanilla JS with Chart.js is simpler, faster to load, and has zero build complexity.

---

*MAC — Built at MBM, for MBM.*
