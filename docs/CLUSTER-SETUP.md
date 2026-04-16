# MAC Multi-Node GPU Cluster Setup Guide

## Architecture

```
  [PC1 — Control Node]          [PC2 — Worker 1]           [PC3 — Worker 2]
  10.10.13.30                   10.10.13.??                 10.10.13.??
  ┌─────────────────────┐       ┌───────────────────┐       ┌───────────────────┐
  │ MAC API Server      │◄──────│ Worker Agent      │       │ Worker Agent      │
  │ PostgreSQL          │       │ vLLM + RTX 3060   │       │ vLLM + RTX 3060   │
  │ Redis               │       │                   │       │                   │
  │ Nginx (Web UI)      │       │ Qwen2.5-Coder-7B  │       │ DeepSeek-R1-7B    │
  │ Qdrant (RAG)        │       │ (Code generation)  │       │ (Math/Reasoning)  │
  │ SearXNG (Search)    │       └───────────────────┘       └───────────────────┘
  │ vLLM + RTX 3060     │
  │ Qwen2.5-7B          │       All connected via WiFi (10.10.13.0/23)
  │ (General chat)      │
  └─────────────────────┘
```

**Smart Routing**: When a user asks a code question → automatically routes to PC2's Coder model.
Math question → PC3's DeepSeek. General chat → PC1's Qwen.

---

## Step 1: Setup Control Node (This PC — PC1)

### 1a. Open firewall ports

Run **as Administrator** in PowerShell:
```powershell
cd D:\MAC
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-firewall.ps1
```

### 1b. Start the control node

```powershell
cd D:\MAC
docker compose -f docker-compose.control-node.yml up -d
```

Or if you're using the original single-PC compose:
```powershell
docker compose up -d
```

### 1c. Generate enrollment tokens

Open browser: **http://localhost** → Login as admin → Admin Panel → **Cluster** tab

Click **"Generate Enrollment Token"** — you'll get a token like:
```
mac_enroll_AbCdEf123456...
```

**Generate 2 tokens** (one for each worker PC). Copy them somewhere safe.

---

## Step 2: Setup Worker PC2 (Coding Model)

### 2a. Copy the setup script

Copy **`setup-worker.ps1`** from this PC to PC2. Options:
- USB drive
- Shared folder: `\\10.10.13.30\Users\HP\` 
- Just copy-paste the file

### 2b. Run the setup

On **PC2**, open PowerShell **as Administrator**:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-worker.ps1 -ControlNodeIP "10.10.13.30" -NodeName "pc2-coder"
```

The script will:
1. Check GPU (RTX 3060 ✓)
2. Install WSL2 (may need reboot)
3. Install Docker Desktop
4. Ask for enrollment token → paste Token #1
5. Ask model choice → select **[1] Qwen2.5-Coder-7B**
6. Open firewall port 8001
7. Start the worker containers

**First time takes 15-30 min** (downloads vLLM image + model weights ~8GB).

### 2c. Verify it's working

On PC2:
```powershell
cd $env:USERPROFILE\mac-worker
docker compose logs -f worker-agent
```

You should see:
```
[AGENT] MAC Worker Agent — pc2-coder
[AGENT] vLLM ready!
[AGENT] Enrolled! Node ID: abc123...
[AGENT] Registering model: qwen2.5-coder:7b
[AGENT] Model registered
[AGENT] Starting heartbeat loop
```

---

## Step 3: Setup Worker PC3 (Reasoning Model)

Same process as PC2, but with different parameters:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup-worker.ps1 -ControlNodeIP "10.10.13.30" -NodeName "pc3-reasoning"
```

When asked for model → select **[2] DeepSeek-R1-7B (Math & reasoning)**

Use **Token #2** for enrollment.

---

## Step 4: Verify the Cluster

### From the admin panel (http://10.10.13.30)

Go to **Admin → Cluster** tab. You should see:

| Node | Status | GPU | Model | GPU Usage |
|------|--------|-----|-------|-----------|
| control-node | active | RTX 3060 12GB | Qwen2.5-7B | ~45% VRAM |
| pc2-coder | active | RTX 3060 12GB | Qwen2.5-Coder-7B | ~45% VRAM |
| pc3-reasoning | active | RTX 3060 12GB | DeepSeek-R1-7B | ~50% VRAM |

### Test routing

In the chat:
- Type "write a Python function to sort a list" → should route to **pc2-coder**
- Type "solve the integral of x²dx" → should route to **pc3-reasoning**
- Type "explain quantum physics" → should route to **pc1 (general)**

---

## Troubleshooting

### Worker can't connect to control node
```powershell
# On the worker PC, test connectivity:
Test-NetConnection -ComputerName 10.10.13.30 -Port 8000
```
If it fails → re-run `setup-firewall.ps1` on the control PC.

### vLLM takes too long to start
First run downloads model weights (~4-8GB). Check progress:
```powershell
docker compose logs -f vllm
```

### Worker enrolls but model not routing
Check if model is registered:
```powershell
docker compose logs worker-agent | Select-String "register"
```

The worker agent queries vLLM's `/v1/models` endpoint and auto-registers.

### WiFi disconnects break heartbeat
The worker agent auto-reconnects. If a node shows "offline" in admin, it will
recover when WiFi reconnects within ~5 minutes.

### Out of VRAM
The AWQ quantized models (~4.5GB for 7B) should fit easily in 12GB.
If you see OOM errors, reduce `GPU_MEM_UTIL` to 0.75:
```powershell
# In worker's .env file:
GPU_MEM_UTIL=0.75
```

---

## Model Recommendations for 12GB GPUs

| Model | VRAM | Best For |
|-------|------|----------|
| Qwen2.5-7B-Instruct-AWQ | ~4.5GB | General chat, Q&A |
| Qwen2.5-Coder-7B-Instruct-AWQ | ~4.5GB | Code gen, debug |
| DeepSeek-R1-Distill-Qwen-7B | ~5GB | Math, reasoning |
| Qwen2.5-7B-Instruct (FP16) | ~14GB | **Won't fit!** |

---

## Quick Commands Reference

**Control Node (PC1):**
```powershell
# Start everything
docker compose -f docker-compose.control-node.yml up -d

# View logs
docker compose -f docker-compose.control-node.yml logs -f mac

# Generate enrollment token via API
curl -X POST http://localhost:8000/api/v1/nodes/enrollment-token -H "Authorization: Bearer <admin_jwt>" -H "Content-Type: application/json" -d '{"label":"PC2","expires_in_hours":24}'
```

**Worker Nodes (PC2, PC3):**
```powershell
# Start
cd $env:USERPROFILE\mac-worker
docker compose up -d

# Stop
docker compose down

# View model loading progress
docker compose logs -f vllm

# View agent status
docker compose logs -f worker-agent

# Restart with different model
# Edit .env, change VLLM_MODEL, then:
docker compose down
docker compose up -d
```
