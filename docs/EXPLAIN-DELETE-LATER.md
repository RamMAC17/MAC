# MAC Project — Professor Ke Liye Tayaari (DELETE LATER)

## Yeh Project Kya Hai — Ek Line Mein
College ke lab PCs pe open-source AI models run karenge, students LAN pe API se access karenge — koi cloud subscription nahi, sab apna hardware.

---

## Overall Flow Samjho

```
Student laptop → (LAN) → Nginx (reverse proxy) → FastAPI (auth + routing) → LiteLLM (model selector) → vLLM (GPU pe model run hota hai) → response wapas
```

Matlab:
- **Nginx**: Pehle request aati hai yahan. Yeh TLS handle karta hai (HTTPS), aur request FastAPI ko forward karta hai.
- **FastAPI**: Yeh humara main server hai. Yeh check karta hai ki request valid hai ya nahi — JWT token sahi hai? Rate limit exceed toh nahi ho gaya? Sab theek hai toh aage bhejta hai.
- **LiteLLM**: Yeh ek proxy hai jo decide karta hai ki kaunsa model use karna hai. Agar user ne `model: "auto"` diya toh yeh content dekhke best model choose karta hai.
- **vLLM**: Yeh actual GPU pe model run karta hai. PagedAttention use karta hai jo memory efficient hai.

---

## Phase 1 — API Endpoints (Sabse Pehle Yeh Banana Hai)

### Kya hai Phase 1?
4 endpoint groups bana rahe hain:
1. `/auth` — login/logout/token refresh
2. `/explore` — models kya available hain, health check
3. `/query` — actual AI se baat karo (chat, vision, speech)
4. `/usage` — kitna use kiya track karo

### Professor Puchhe: "Authentication kaise kaam karega?"
- Student apna roll number aur password bhejega `POST /auth/login` pe
- Server verify karega (password bcrypt se hashed hai DB mein)
- Sahi hai toh **JWT access token** (24 ghante valid) aur **refresh token** (30 din valid) milega
- Har request mein student header mein bhejega: `Authorization: Bearer <token>`
- Token expire ho jaye toh `/auth/refresh` se naya le lo, dobara login nahi karna
- JWT **RS256** se signed hai — asymmetric keys, zyada secure than HS256

### Professor Puchhe: "JWT kyun? Session-based kyun nahi?"
- JWT **stateless** hai — server ko har request pe database hit nahi karna padta
- Horizontally scale karna easy hai — koi bhi server token verify kar sakta hai
- Refresh token pattern use kar rahe hain toh security bhi strong hai
- Access token short-lived (24h), refresh token long-lived (30d) — agar access token leak ho jaye toh limited damage

### Professor Puchhe: "Query endpoint kaise kaam karega?"
- Student `POST /query/chat` pe request bhejega
- Request mein `model` field hoga — ya toh specific model ID (`qwen2.5-coder-7b`) ya `"auto"`
- `"auto"` diya toh **smart routing** hoga:
  - Code keywords detect hue → Qwen2.5-Coder
  - Math/reasoning → DeepSeek-R1
  - Image attached → LLaVA
  - Audio file → Whisper
  - Baaki sab → Qwen2.5-14B (general)
- Response **OpenAI format** mein aayega — `choices[0].message.content` — toh OpenAI SDK seedha kaam karega

### Professor Puchhe: "Rate limiting kaise implement karoge?"
- **Redis** use kar rahe hain — sliding window algorithm
- Student: 50,000 tokens/day, 100 requests/hour, max 4096 tokens per request
- Faculty: 200,000 tokens/day, 500 req/hr
- Admin: unlimited
- Response headers mein `X-RateLimit-Remaining` aata hai — client ko pata rehta hai kitna bacha
- Exceed kare toh `429 Too Many Requests` + `retry_after` seconds

### Professor Puchhe: "API key aur JWT mein kya fark hai?"
- **JWT token**: short-lived, login se milta hai, session ke liye use hota hai (web dashboard)
- **API key**: long-lived, programmatic access ke liye (scripts, notebooks), format: `mac_sk_live_xxxxx`
- Dono kaam karte hain `/query` endpoints pe — student jo bhi use kare
- API key ka sirf **SHA-256 hash** DB mein store hota hai — raw key ek baar dikhti hai, phir kabhi nahi

### Professor Puchhe: "OpenAI compatible kyun?"
- Students ko naya SDK nahi seekhna padega
- Har tutorial jo OpenAI API use karta hai, woh hamare system pe seedha kaam karega
- Bas `base_url` change karo: `OpenAI(base_url="http://mac-server/api/v1")`
- Industry standard hai — students ko real-world experience milega

---

## Phase 2 — Models

### Professor Puchhe: "Kaunse models use kar rahe ho? Kyun?"
5 models, har ek apne field ka best:

| Model | Kaam | Kyun yeh? |
|---|---|---|
| Qwen2.5-Coder 7B | Code likhna, debug, explain | HumanEval pe top open-source coder |
| DeepSeek-R1 8B | Math, reasoning, proof | Chain-of-thought reasoning best-in-class |
| LLaVA 1.6 7B | Image samajhna | Best open VLM at 7B size |
| Whisper Large v3 | Audio → text | OpenAI ka model, speech recognition ka gold standard |
| Qwen2.5 14B | General chat, summarize | Best overall generalist at this size |

### Professor Puchhe: "Ek PC pe sab fit honge?"
- Nahi, sabko ek saath load nahi kar sakte (total ~32 GB VRAM chahiye)
- **On-demand loading** — sirf woh model load hoga jo abhi chahiye
- Baaki models idle hain toh VRAM se hata denge (configurable timeout: 15 min default)
- Sabse zyada use hone wala model (Qwen2.5-14B) resident rehta hai
- Queue system hai — agar model load ho raha hai toh request wait karegi, reject nahi hogi

### Professor Puchhe: "Scale kaise karoge?"
- Phase 1: ek PC pe sab run hoga, models swap hote rahenge
- Phase 2: 2-5 PCs, har PC pe 1-2 fixed models
- Phase 3: 6-30 PCs, har model multiple PCs pe, LiteLLM least-busy routing karega
- **Koi code change nahi** — sirf LiteLLM config mein naye worker ka address add karo

---

## Phase 3 — Integration (Model ko API se jodna)

### Professor Puchhe: "LiteLLM kyun? Seedha vLLM se kyun nahi baat karte?"
- LiteLLM ek **translation layer** hai — hamare request ko vLLM format mein convert karta hai
- **Load balancing** built-in hai — agar 5 PCs pe same model hai toh least-busy pe bhejega
- **Retry logic** — agar ek worker fail ho jaye toh doosre pe try karega
- **Health checks** — unhealthy workers ko automatically hata deta hai routing se
- Iske bina humein yeh sab khud likhna padta

---

## Phase 4 — Usage Control (Fair Access)

### Professor Puchhe: "Quota system kaise kaam karega?"
- Har request ke baad **tokens count** hota hai (prompt tokens + completion tokens)
- Redis mein har student ka daily counter maintain hota hai
- Sliding window algorithm — 100 requests per hour matlab kisi bhi 60-min window mein
- Exceed karne pe `429` aata hai with `retry_after` — client ko pata hai kab retry kare
- Admin kisi bhi student ka quota override kar sakta hai (project ke liye extra de sakta hai)

### Professor Puchhe: "API key management kaise?"
- Do type: **Static** (kabhi expire nahi, manually rotate) aur **Refresh** (30 din pe auto-rotate)
- Key generate hone pe ek baar dikhti hai — phir sirf hash stored hai
- Student khud regenerate kar sakta hai (`POST /keys/generate`) — purani key turant invalid
- Admin force-revoke kar sakta hai agar misuse ho

---

## Phase 5 — Web Interface

### Professor Puchhe: "Frontend kya dikhega?"
- **Dashboard**: tokens used today, requests count, quota remaining, model status, weekly chart
- **API Keys page**: key dikhao (masked), copy button, regenerate
- **History**: sab requests ki table — kab, kaunsa model, kitne tokens, kitni latency
- **Playground**: browser mein hi chat kar sakte ho models se
- **Admin panel**: users manage karo, CSV se bulk create, models load/unload, live logs

---

## Phase 6 — Guardrails

### Professor Puchhe: "Safety kaise ensure karoge?"
- Har request **dono taraf filter** hoti hai — input bhi, output bhi
- **Input filters**: prompt injection detection, blocked topics, max length
- **Output filters**: PII redaction (email/phone hata do), harmful content block, academic integrity notice
- Rules database mein stored hain — admin UI se change kar sakte hain, code change nahi
- Implementation: pehle keyword matching (fast), phir classifier model (accurate)

### Professor Puchhe: "Prompt injection kya hai?"
- Jab user try kare model ka system prompt override karne — jaise "Ignore all previous instructions..."
- Hum input mein known injection patterns detect karte hain
- Detect hone pe request block + log (admin ko dikhai dega)

---

## Phase 7 — RAG (Textbooks se answer do)

### Professor Puchhe: "RAG kaise kaam karega?"
1. Admin textbook PDF upload karta hai
2. PDF ko **chunks** mein todto hai (512 tokens, 50 overlap)
3. Har chunk ka **embedding** (768-dim vector) banate hain
4. **Qdrant** (vector DB) mein store karte hain
5. Student question aata hai → question ka bhi embedding banao → Qdrant mein similar chunks dhundo (top-5)
6. Retrieved chunks + question → LLM ko do → answer with citations

### Professor Puchhe: "Chunk overlap kyun?"
- Agar chunk boundary pe important info hai toh overlap ensure karta hai ki woh dono chunks mein aaye
- 50 tokens overlap = ~2-3 sentences ka overlap

### Professor Puchhe: "Qdrant kyun? FAISS ya Pinecone kyun nahi?"
- **Qdrant**: self-hosted, Docker mein chalta hai, filtering support (collection-wise search), snapshot/backup easy
- FAISS: library hai, server nahi — persistence khud handle karni padti
- Pinecone: cloud service — hum cloud avoid kar rahe hain
- ChromaDB bhi option tha but Qdrant production-grade hai

---

## Phase 8 — Web Search

### Professor Puchhe: "SearXNG kya hai?"
- Self-hosted meta-search engine — Google, Bing, DuckDuckGo, Wikipedia se results aggregate karta hai
- Docker container mein chalta hai, koi API key nahi chahiye
- Privacy-respecting — koi data bahar nahi jaata (except search queries to search engines)

### Professor Puchhe: "Grounded search kya hai?"
- Student question kare → SearXNG se web results lao → results + question LLM ko do → LLM cited answer de
- Matlab AI ka answer **web sources** pe based hoga, fabricated nahi
- Har answer ke saath source URLs aate hain

---

## Technical Questions — Quick Answers

### "Database schema explain karo"
- **users**: roll_number (unique), name, dept, role, hashed_password, is_active
- **api_keys**: key_hash (SHA-256), user_id (FK), type (static/refresh), expires_at
- **request_logs**: user_id, model, endpoint, tokens_in, tokens_out, latency_ms, created_at
- **quota_overrides**: admin specific student ka quota change kare
- **rag_documents**: uploaded PDFs ka metadata + chunk count
- Sab primary keys **UUID** hain — sequential IDs guess karna mushkil

### "Security measures kya hain?"
- Passwords: **bcrypt** (work factor 12)
- JWT: **RS256** (asymmetric, public key se verify)
- API keys: sirf **SHA-256 hash** stored, raw key ek baar dikhta hai
- SQL injection: **SQLAlchemy ORM** — parameterised queries
- Rate limiting: **Redis sliding window**
- CORS: sirf MAC frontend allowed
- Transport: **Nginx TLS** (HTTPS)
- Input validation: **Pydantic** schemas har request pe

### "Docker kyun use kar rahe ho?"
- **Reproducible**: ek command se pura stack start — `docker-compose up`
- **Isolated**: har service apne container mein
- **Scalable**: naya PC add karo → naya vLLM container start karo → LiteLLM config update karo
- **Portable**: kisi bhi Ubuntu machine pe chalega, dependencies ka jhanjhat nahi

### "FastAPI kyun? Flask/Django kyun nahi?"
- **Async**: concurrent requests handle karta hai bina blocking ke — AI inference ke liye important kyunki requests slow hote hain
- **Auto-docs**: Swagger UI automatically generate hoti hai — professor ko live demo de sakte hain
- **Type-safe**: Pydantic se request/response validation automatic
- **Fast**: benchmarks mein NodeJS ke comparable, Django/Flask se 5-10x fast
- **Modern**: Python 3.11+ features use karta hai

### "vLLM kyun? Ollama ya llama.cpp kyun nahi?"
- **PagedAttention**: memory efficient, zyada concurrent users handle kar sakta hai
- **Continuous batching**: multiple requests ek saath process — throughput 2-4x better
- **OpenAI-compatible server**: seedha OpenAI format mein response deta hai
- **Production-grade**: companies production mein use karti hain
- Ollama: simple hai but production features kam hain (no batching, limited concurrency)
- llama.cpp: C++ hai, integration mushkil, no batching

---

## Agar Professor Bole "Demo Dikhao"

Phase 1 complete hone pe yeh dikhana:
1. Swagger UI (`/docs`) — sab endpoints dikhao
2. Login karo → JWT milega
3. `/explore/models` call karo → models ki list
4. `/query/chat` mein simple question bhejo → AI ka response dikhao
5. `/usage/me` se dikhao kitna use hua
6. Rate limit exceed karke dikhao → 429 error
7. Python script se OpenAI SDK use karke dikhao — "dekho sir, OpenAI SDK seedha kaam karta hai"

---

## One-liner Answers (Quick Fire)

- **"Kitne models?"** — 5, har ek specialist
- **"Total VRAM?"** — ~32 GB sab milaake, but on-demand load hote hain
- **"Kya koi cloud use hoga?"** — Nahi, zero cloud. Sab local.
- **"Internet chahiye?"** — Sirf model download ke liye ek baar. Phir fully offline.
- **"Kitne students handle kar sakta hai?"** — Single PC pe 20-30 concurrent, 30 PCs pe 500+
- **"Data privacy?"** — Sab data college network mein rehta hai, bahar nahi jaata
- **"Existing code compatible?"** — Haan, OpenAI SDK seedha kaam karta hai
- **"Kitna time lagega?"** — Phase 1 pehle, phir sequentially baaki phases
- **"Cost?"** — Zero recurring. Hardware already hai. Software sab open-source.
