# MAC — MBM AI Cloud: Project Explanation

> Yeh document explain karta hai ki **kya banaya, kaise banaya, kyun banaya** — simple Hinglish mein.

---

## Ek Line Mein Kya Hai Yeh?

**MAC ek AI API platform hai** jo college ke students ko **free API keys** deta hai taaki wo open-source AI models apne kisi bhi project mein use kar sakein — bina ek paisa kharch kiye.

College ke PC/server pe open-source AI models host hote hain → MAC unko **OpenAI-compatible API** ke through serve karta hai → student ko API key milti hai → wo apne Python script, mobile app, web app, chatbot — kisi bhi project mein laga le.

Upar se: college ka **knowledge base** (notes, syllabus) RAG se integrate hai, **guardrails** se content safe hai, **web search** se latest info milti hai, aur ek ready-made **web interface** bhi diya hai taaki bina code likhe bhi use kar sake.

---

## Kyun Banaya? — The Real Problem

| Problem | MAC Ka Solution |
|---------|----------------|
| OpenAI / ChatGPT ki API **paid** hai — students ke paas paisa nahi | College ke server pe **free open-source models** host karo, students ko **free API keys** do |
| Student project bana raha hai (chatbot, app) — AI API chahiye | MAC ki API key le lo, OpenAI jaisa hi format hai — seedha project mein use karo |
| Paid APIs pe students ka data bahar jaata hai | **Self-hosted** — sab data college ke server pe, privacy safe |
| Open-source models chalana mushkil hai | MAC sab handle karta hai — student ko sirf API key aur endpoint chahiye |
| Koi ek student poora GPU kha jaaye | **Quota system** — fair usage, sabko equal access |
| Professor chahein ki students kuch galat na karein | **Guardrails** — harmful content block hota hai |
| AI ke paas college-specific info nahi hai | **RAG** — college ke notes/documents upload karke AI ko smart banao |
| AI ka data purana hota hai | **Web Search** — live internet search + Wikipedia se latest info |

---

## Core Idea — API Keys For Students

> **Socho aise:** Jaise AWS/Google Cloud students ko free credits deta hai — MAC students ko **free AI API access** deta hai.

### Student ka flow:
1. Roll number + DOB se **verify** karo
2. Password set karo → **API key** mil jaati hai
3. Ab yeh API key apne **kisi bhi project** mein use karo:

```python
# Student ke Python project mein — bilkul OpenAI jaisa
import requests

response = requests.post(
    "https://mac.mbm.ac.in/api/v1/query/chat",   # college ka server
    headers={"Authorization": "Bearer STUDENT_API_KEY"},
    json={
        "model": "auto",
        "messages": [{"role": "user", "content": "Explain linked lists"}]
    }
)
print(response.json()["choices"][0]["message"]["content"])
```

```javascript
// Student ke JavaScript/React project mein
const res = await fetch("https://mac.mbm.ac.in/api/v1/query/chat", {
    method: "POST",
    headers: {
        "Authorization": "Bearer STUDENT_API_KEY",
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        model: "auto",
        messages: [{ role: "user", content: "Write a sorting algorithm" }]
    })
});
```

> **Key point:** API format bilkul **OpenAI ke ChatGPT API jaisa** hai. Student ne agar OpenAI ka tutorial padha hai toh seedha MAC pe kaam karega — sirf URL aur API key change karna hai.

---

## Kya Kya Features Banaye?

### 1. API Key System (Core Feature)
- Har verified student ko **unique API key** milti hai
- Yeh key **OpenAI-compatible** hai — koi bhi tool/library jo OpenAI support karta hai, wo MAC se bhi kaam karega
- Student apni key regenerate kar sakta hai (security ke liye)
- Admin kisi bhi student ki key revoke kar sakta hai
- Key usage track hoti hai — kitni requests, kitne tokens

**Use cases students ke liye:**
- Python chatbot banana → MAC API key lagao
- React/Flutter app mein AI feature → MAC API use karo
- LangChain / LlamaIndex project → MAC endpoint + key
- Jupyter notebook mein AI experiments → MAC API
- College hackathon mein AI project → free API ready hai

### 2. Open-Source AI Models (College Ke Server Pe)
- **Koi paid model nahi** — sab open-source, free, transparent
- College ke server pe hosted — data bahar nahi jaata

| Model | Kya Karta Hai | Kab Use Hota Hai |
|-------|--------------|-----------------|
| Qwen2.5-Coder 7B | Code likhna, debug, explain | Student ne coding question pucha |
| DeepSeek-R1 7B | Maths, proofs, step-by-step | Maths/reasoning question |
| Qwen2.5-72B | General Q&A, essays, summaries | General knowledge |
| Qwen2.5-7B | Quick light chat | Simple fast answers |

### 3. Smart Routing — Automatic Model Selection
- Student ko model choose karne ki zaroorat nahi
- `"model": "auto"` set karo → system **khud samajh jaata hai** kaunsa model best hai:
  - `"Write Python code"` → Coder model
  - `"Prove this theorem"` → Maths model
  - `"Explain photosynthesis"` → General model
- Keywords detect karke best model assign hota hai

### 4. College Knowledge Base — RAG (Retrieval Augmented Generation)
- Professor apne **notes, syllabus, PDFs** upload karta hai
- Student jab question puchta hai → system **pehle college ke documents mein dhundhta hai**
- Fir AI ko woh relevant text context ke saath bhejta hai
- **Result:** AI college-specific jawab deta hai, hallucinate nahi karta
- Example: *"What are the exam topics for DSA?"* → AI syllabus PDF se jawab nikalega

### 5. Guardrails — Content Safety
- **Input check:** Student ne kuch inappropriate likha → block before sending to AI
- **Output check:** AI ne kuch galat generate kiya → block before showing to student
- Admin rules configure kar sakta hai (regex patterns, block/warn actions)
- College environment ke liye safe aur controlled

### 6. Web Search + Wikipedia
- AI models ka training data purana hota hai
- Web search feature **live internet** se latest info laata hai
- Wikipedia search direct factual info deta hai
- **Grounded search:** Search results + AI = accurate, up-to-date answers

### 7. Web Interface (Bonus — PWA)
- Har student ko coding nahi aati API use karne ki
- Toh ek **ready-made chat interface** bhi diya — browser mein kholo, use karo
- **PWA** hai — phone mein install ho sakta hai jaise native app
- Dark theme, responsive, model selector, streaming responses
- Yeh web interface khud bhi MAC ki **API keys** use karta hai internally

### 8. Quota System — Fair Usage
- Har student ko daily limit: kitni requests, kitne tokens
- Koi ek student poora GPU/server occupy nahi kar sakta
- Admin limits customize kar sakta hai
- Exceeding pe clear error message — *"Quota exhausted, try tomorrow"*

### 9. Usage Tracking + Admin Dashboard
- Har API call log hoti hai — kaun, kab, kaunsa model, kitne tokens
- **Student** apni history dekh sakta hai
- **Admin** dekh sakta hai:
  - Overall usage stats
  - Model-wise breakdown
  - Department-wise usage
  - Top users
  - Quota exceeded students

### 10. Authentication — Secure Access
- Roll number + DOB se verify → password set → JWT token + API key
- **JWT tokens** — har request mein encrypted pass jaata hai (30 min valid)
- **bcrypt** — password hashed store hota hai, plain text mein nahi
- First login pe **mandatory password change**
- Admin alag role — full control

---

## Tech Stack — Kya Kya Use Kiya?

### Backend (Server Side)
| Technology | Kyun Use Kiya |
|-----------|---------------|
| **Python** | AI/ML ecosystem sabse strong Python mein hai |
| **FastAPI** | Fastest Python web framework — async, automatic API docs, type-safe |
| **SQLAlchemy 2.0** | Database ORM — Python objects se DB handle, raw SQL nahi |
| **SQLite / PostgreSQL** | Dev mein SQLite (file-based), production mein PostgreSQL |
| **Alembic** | Database migration — schema change ho toh data safe rahe |
| **Pydantic** | Request/response validation — galat data auto-reject |
| **JWT (JSON Web Tokens)** | Stateless authentication — encrypted tokens |
| **bcrypt** | Password hashing — rainbow table attacks se safe |
| **httpx** | Async HTTP client — AI model ko request bhejne ke liye |

### Frontend (Web Interface)
| Technology | Kyun Use Kiya |
|-----------|---------------|
| **HTML/CSS/JS** | Pure vanilla — lightweight, no framework dependency |
| **PWA** | Phone pe install without Play Store |
| **Service Worker** | Offline caching — ek baar load, fir fast |

### AI / LLM Layer
| Technology | Kyun Use Kiya |
|-----------|---------------|
| **Open-source models** | Free, transparent, college-controlled |
| **OpenAI-compatible API** | Industry standard — har tool samajhta hai |
| **Smart Routing** | Auto model selection by keyword analysis |
| **vLLM / Ollama** | Local inference server (college GPU pe) |
| **HuggingFace Inference** | Cloud fallback (free tier, demo ke liye) |

> **Note:** Production mein college GPU server pe **vLLM** ya **Ollama** chalega. Demo ke liye abhi HuggingFace ka free Inference API use ho raha hai. Sirf ek env variable (`VLLM_BASE_URL`) change karna hai — code same rahega.

### Deployment
| Technology | Kyun Use Kiya |
|-----------|---------------|
| **Docker** | Poora app ek container mein — kahin bhi deploy karo |
| **HuggingFace Spaces** | Free hosting for demo |
| **Nginx** | Reverse proxy for production |
| **GitHub** | Source code version control |

### Testing
| Technology | Kyun Use Kiya |
|-----------|---------------|
| **pytest** | 81 automated tests — sab features covered |
| **httpx + pytest-asyncio** | Async API endpoint testing |

---

## Architecture — System Kaise Kaam Karta Hai?

```
+------------------------------------------------------+
|              STUDENTS KE PROJECTS                     |
|                                                       |
|  Python Script    React App    Flutter App    Jupyter  |
|       |              |             |            |      |
|       +--------------+-------------+------------+      |
|                        |                               |
|               API Key + HTTP Request                   |
|            (OpenAI-compatible format)                  |
+------------------------+---------+-------------------+
                         |
                         v
              +--- Web Interface (PWA) ---+
              |  Browser/Phone se direct   |
              |  chat -- bina code likhe   |
              +------------+--------------+
                           |
                           v
+------------------------------------------------------+
|               MAC FastAPI Backend                     |
|               (College Server)                        |
|                                                       |
|  Auth --- API Keys --- Quota --- Guardrails           |
|    |          |           |          |                 |
|    v          v           v          v                 |
|  +------------------------------------------+         |
|  |         Smart Router                      |         |
|  |  Code -> Coder | Math -> DeepSeek         |         |
|  |  General -> Qwen | Auto -> Best Match     |         |
|  +----------------+-------------------------+         |
|                   |                                    |
|  +----------------+------------------+                |
|  |                |                  |                |
|  v                v                  v                |
| RAG           Web Search         Usage                |
| (College      (Live Internet     Tracking             |
|  Notes/PDF)    + Wikipedia)      (Logs)               |
|                                                       |
|  Database: Users, Keys, Quotas, Logs, Documents       |
+------------------------+-----------------------------+
                         |
                  API Calls (OpenAI format)
                         |
                         v
+------------------------------------------------------+
|          College GPU Server (vLLM / Ollama)           |
|          ya HuggingFace Inference (demo)              |
|                                                       |
|  Qwen2.5-Coder | DeepSeek-R1 | Qwen2.5-72B | Qwen-7B|
+------------------------------------------------------+
```

---

## Request Flow — API Key Se AI Tak Ka Safar

### Via API Key (Student ka project):
1. Student apne Python/JS project se **API call** bhejta hai with **API key**
2. **Auth Middleware** key verify karta hai — valid toh aage, nahi toh 401
3. **Rate Limiter** quota check karta hai — remaining hai toh aage, nahi toh 429
4. **Guardrails** input content check karta hai — safe toh aage
5. **Smart Router** question type detect karta hai → best model select
6. **LLM Service** college server (vLLM/Ollama) ya HuggingFace ko request bhejta hai
7. AI model jawab deta hai
8. **Usage Service** log karta hai — tokens, model, timestamp
9. Response student ke project ko milta hai — **OpenAI format mein**

### Via Web Interface:
1. Student browser mein MAC kholta hai → login karta hai
2. Chat mein question type karta hai
3. **Internally same API call hoti hai** (web interface bhi API key use karta hai)
4. Jawab streaming mein word-by-word dikhta hai

---

## API Endpoints — Total 48 Working Endpoints

### Student ke liye important endpoints:

```
POST /api/v1/auth/verify          -> Roll number + DOB se verify karo
POST /api/v1/auth/login           -> Login karke JWT token lo
POST /api/v1/auth/set-password    -> Password set karo, API key milegi

GET  /api/v1/keys/my-key          -> Apni API key dekho
POST /api/v1/keys/generate        -> Nayi API key banao

POST /api/v1/query/chat           -> AI se chat karo (MAIN ENDPOINT)
POST /api/v1/query/completions    -> Text completion
POST /api/v1/query/embeddings     -> Text embeddings (vector search ke liye)

POST /api/v1/search/web           -> Web search
POST /api/v1/search/wikipedia     -> Wikipedia search

POST /api/v1/rag/query            -> College knowledge base se pucho

GET  /api/v1/models               -> Available models dekho
GET  /api/v1/usage/me             -> Apni usage dekho
GET  /api/v1/quota/me             -> Apna quota dekho
```

### Admin ke liye:
```
GET  /api/v1/auth/admin/users     -> Saare students
POST /api/v1/auth/admin/registry  -> Student registry manage
GET  /api/v1/usage/admin/all      -> Overall usage stats
GET  /api/v1/keys/admin/all       -> Sabki API keys
PUT  /api/v1/quota/admin/user/{r} -> Kisi ka quota change
```

### Full count:
| Category | Count |
|----------|:-----:|
| Auth | 11 |
| Query/Chat | 6 |
| Models | 6 |
| Keys | 5 |
| Usage | 6 |
| Quota | 4 |
| Search | 4 |
| Explore | 5 |
| RAG | 6 |
| Guardrails | 3 |
| Integration | 4 |
| **Total** | **48** |

---

## Database Schema — Data Kaise Store Hota Hai

```
Users Table:
+-- id, roll_number, name
+-- password_hash (bcrypt encrypted)
+-- role ("student" / "admin")
+-- api_key (UNIQUE -- yahi student projects mein use hoti hai)
+-- department ("CSE", "ME", "ECE")
+-- tokens_used, requests_today
+-- created_at, last_login

Student Registry Table:
+-- roll_number, name, department
+-- dob (verify ke liye)
+-- batch_year

Usage Logs Table:
+-- user_id, model_used
+-- prompt_tokens, completion_tokens
+-- timestamp, request_type

Guardrail Rules Table:
+-- rule_type ("input"/"output")
+-- pattern, action ("block"/"warn")
+-- enabled

RAG Collections + Documents:
+-- collection_name
+-- document content (chunked)
+-- embeddings (vector search ke liye)
```

---

## Security

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt, 12 rounds |
| JWT tokens | 30 min access + 7 day refresh |
| API key auth | Per-student unique key, revocable |
| Rate limiting | Per-user daily quota |
| Input validation | Pydantic strict schemas |
| CORS | Whitelisted origins only |
| SQL injection safe | SQLAlchemy ORM, no raw SQL |
| Content filtering | Guardrails on input + output |
| Forced password change | First login pe mandatory |

---

## Testing

```
Total Tests: 81 (ALL PASSING)

test_auth.py        -> 12 tests
test_query.py       -> 10 tests
test_models.py      ->  8 tests
test_keys.py        ->  7 tests
test_usage.py       ->  7 tests
test_quota.py       ->  6 tests
test_search.py      ->  6 tests
test_explore.py     ->  6 tests
test_rag.py         ->  6 tests
test_guardrails.py  ->  5 tests
test_integration.py ->  5 tests
```

---

## Live Deployment

| Item | Detail |
|------|--------|
| **Live URL** | https://aaryan17-mac-mbm-ai-cloud.hf.space |
| **API Docs (Swagger)** | https://aaryan17-mac-mbm-ai-cloud.hf.space/docs |
| **GitHub** | https://github.com/23f2003700/mac |
| **Platform** | HuggingFace Spaces (Demo) / College Server (Production) |
| **AI Models** | Open-source, via vLLM/Ollama (local) or HuggingFace (demo) |

---

## File Structure

```
MAC/
+-- mac/                     <-- Main application
|   +-- main.py              <-- Entry point, startup
|   +-- config.py            <-- Environment settings
|   +-- database.py          <-- DB connection
|   +-- models/              <-- DB tables (SQLAlchemy)
|   +-- schemas/             <-- Request/Response validation (Pydantic)
|   +-- routers/             <-- 11 API route files
|   +-- services/            <-- 7 business logic files
|   +-- middleware/           <-- Auth + rate limiting
|   +-- utils/               <-- JWT, password helpers
+-- frontend/                <-- PWA (HTML/CSS/JS)
+-- tests/                   <-- 81 automated tests
+-- Dockerfile               <-- Production container
+-- Dockerfile.hf            <-- Demo deployment container
+-- docker-compose.yml       <-- Multi-container setup
+-- requirements.txt         <-- Dependencies
+-- README.md                <-- Documentation
```

---

## Key Technical Decisions

### 1. OpenAI-compatible API format kyun?
```json
{
  "model": "auto",
  "messages": [{"role": "user", "content": "Hello"}]
}
```
Yeh **industry standard** hai. Matlab:
- Student ne OpenAI ka tutorial padha -> MAC pe same code chalega
- LangChain, LlamaIndex, OpenAI SDK — sab directly compatible
- Sirf `base_url` aur `api_key` change karna hai — code same

### 2. Local server (vLLM/Ollama) vs Cloud API
- **Production:** College ka GPU server -> vLLM/Ollama pe models run
- **Demo:** HuggingFace Inference API (free, GPU nahi chahiye)
- Code mein **sirf ek env variable** change: `VLLM_BASE_URL`
- Backend-agnostic design — server chahe koi bhi ho, API same

### 3. Smart Routing
```
Student ka question -> keyword analysis -> best model auto-select
"Python code"   -> Coder model
"Prove theorem"  -> Maths model
"Explain water"  -> General model
```
Student ko models ke baare mein sochna hi nahi padta.

### 4. DeepSeek-R1 ka special handling
DeepSeek-R1 ek "reasoning" model hai — yeh seedha jawab nahi deta, **pehle sochta hai** (`reasoning_content` field mein), fir jawab deta hai (`content` field mein). Kabhi kabhi `content` null aata hai aur sirf reasoning hota hai. Humne special code likha jo dono merge kar deta hai.

### 5. PWA as Web Interface
- **Lightweight:** 4 files, no React/Vue/build step
- **Installable:** Phone pe app jaisa icon
- **Offline:** Service worker se cached
- **Purpose:** Jo student code nahi kar sakta wo bhi AI use kare

---

## Summary

| | |
|---|---|
| **Kya hai** | College students ke liye **free AI API platform** — API keys deta hai OpenAI-compatible format mein |
| **Core feature** | API keys -> students apne projects mein free AI use karein |
| **Extra features** | College knowledge base (RAG), guardrails, web search, web chat interface |
| **Models** | Open-source (Qwen, DeepSeek) — college server pe hosted, zero cost |
| **Endpoints** | 48 working APIs |
| **Tests** | 81 automated tests |
| **Security** | JWT + bcrypt + quotas + guardrails |
| **Live** | https://aaryan17-mac-mbm-ai-cloud.hf.space |