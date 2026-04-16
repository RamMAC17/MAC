# ═══════════════════════════════════════════════════════════
#  MAC Worker Node Setup Script (Windows)
#  Run this on each worker PC (PC2, PC3, etc.)
#
#  Prerequisites: Windows 10/11, NVIDIA GPU, Admin PowerShell
#  This script installs: WSL2, Docker Desktop, NVIDIA Container Toolkit
#  Then deploys the MAC worker with vLLM + heartbeat agent.
#
#  Usage (run as Administrator):
#    Set-ExecutionPolicy Bypass -Scope Process -Force
#    .\setup-worker.ps1
# ═══════════════════════════════════════════════════════════

param(
    [string]$ControlNodeIP = "10.10.13.30",
    [string]$EnrollmentToken = "",
    [string]$NodeName = "",
    [string]$Model = "",
    [int]$VllmPort = 8001,
    [float]$GpuMemUtil = 0.85,
    [int]$MaxModelLen = 8192
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$msg) Write-Host "`n[MAC] $msg" -ForegroundColor Cyan }
function Write-Ok { param([string]$msg) Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "[!]   $msg" -ForegroundColor Yellow }

Write-Host @"

  ╔══════════════════════════════════════════════════╗
  ║     MAC Worker Node Setup — MBM AI Cloud        ║
  ║     Setting up GPU inference worker              ║
  ╚══════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

# ── Verify admin privileges ──────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell -> Run as Administrator" -ForegroundColor Yellow
    exit 1
}

# ── Check NVIDIA driver ─────────────────────────────────
Write-Step "Checking NVIDIA GPU..."
try {
    $gpu = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>$null
    if ($gpu) {
        Write-Ok "GPU found: $gpu"
    } else {
        throw "No GPU"
    }
} catch {
    Write-Host "ERROR: NVIDIA GPU or driver not found. Install latest NVIDIA drivers first:" -ForegroundColor Red
    Write-Host "  https://www.nvidia.com/Download/index.aspx" -ForegroundColor Yellow
    exit 1
}

# ── Step 1: Install/Enable WSL2 ─────────────────────────
Write-Step "Checking WSL2..."
$wslInstalled = $false
try {
    $wslVersion = wsl --version 2>$null
    if ($LASTEXITCODE -eq 0) { $wslInstalled = $true }
} catch {}

if (-not $wslInstalled) {
    Write-Step "Installing WSL2 (this may require a reboot)..."
    wsl --install --no-distribution
    Write-Warn "WSL2 installed. If prompted, REBOOT and re-run this script."
    Write-Host "After reboot, run: .\setup-worker.ps1" -ForegroundColor Yellow
    Read-Host "Press Enter to continue (or Ctrl+C to reboot first)"
} else {
    Write-Ok "WSL2 is already installed"
}

# ── Step 2: Install Docker Desktop ──────────────────────
Write-Step "Checking Docker..."
$dockerInstalled = $false
try {
    $dockerVer = docker version --format '{{.Server.Version}}' 2>$null
    if ($LASTEXITCODE -eq 0 -and $dockerVer) { $dockerInstalled = $true }
} catch {}

if (-not $dockerInstalled) {
    Write-Step "Downloading Docker Desktop..."
    $dockerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
    $installerPath = "$env:TEMP\DockerDesktopInstaller.exe"
    
    if (-not (Test-Path $installerPath)) {
        Invoke-WebRequest -Uri $dockerUrl -OutFile $installerPath -UseBasicParsing
    }
    
    Write-Step "Installing Docker Desktop (this takes a few minutes)..."
    Start-Process -FilePath $installerPath -ArgumentList "install","--quiet","--accept-license" -Wait -NoNewWindow
    
    Write-Warn "Docker Desktop installed. You need to:"
    Write-Host "  1. Start Docker Desktop from Start Menu" -ForegroundColor Yellow
    Write-Host "  2. Wait for it to finish starting (whale icon in taskbar)" -ForegroundColor Yellow
    Write-Host "  3. Re-run this script" -ForegroundColor Yellow
    Read-Host "Press Enter when Docker Desktop is running"
    
    # Re-check
    try {
        $dockerVer = docker version --format '{{.Server.Version}}' 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Docker not ready" }
        $dockerInstalled = $true
    } catch {
        Write-Host "Docker is not running yet. Start Docker Desktop and re-run." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Ok "Docker is installed: $dockerVer"
}

# ── Step 3: Verify Docker GPU support ───────────────────
Write-Step "Checking Docker GPU support..."
try {
    $gpuTest = docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Docker GPU (NVIDIA Container Toolkit) is working"
    } else {
        throw "GPU test failed"
    }
} catch {
    Write-Warn "Docker GPU test failed. Ensure Docker Desktop has WSL2 backend enabled."
    Write-Host "  Docker Desktop -> Settings -> General -> Use WSL2 based engine = ON" -ForegroundColor Yellow
    Write-Host "  Docker Desktop -> Settings -> Resources -> WSL Integration -> Enable" -ForegroundColor Yellow
    Read-Host "Fix the settings and press Enter to continue"
}

# ── Step 3b: Open firewall for vLLM port ────────────────
Write-Step "Configuring firewall..."
$fwRule = "MAC vLLM Worker ($VllmPort)"
$existing = Get-NetFirewallRule -DisplayName $fwRule -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $fwRule -Direction Inbound -Protocol TCP -LocalPort $VllmPort -Action Allow -Profile Private,Domain | Out-Null
    Write-Ok "Firewall rule created for port $VllmPort"
} else {
    Write-Ok "Firewall rule already exists for port $VllmPort"
}

# ── Step 4: Get deployment parameters ───────────────────
Write-Step "Configuring worker node..."

if (-not $NodeName) {
    $hostname = $env:COMPUTERNAME
    $NodeName = Read-Host "Enter node name (default: worker-$hostname)"
    if (-not $NodeName) { $NodeName = "worker-$hostname" }
}

if (-not $EnrollmentToken) {
    Write-Host "`nYou need an enrollment token from the MAC admin panel." -ForegroundColor Yellow
    Write-Host "Ask the admin to generate one at: http://$ControlNodeIP/admin -> Cluster -> Generate Token`n" -ForegroundColor Yellow
    $EnrollmentToken = Read-Host "Paste enrollment token"
    if (-not $EnrollmentToken) {
        Write-Host "ERROR: Enrollment token is required" -ForegroundColor Red
        exit 1
    }
}

if (-not $Model) {
    Write-Host "`nChoose a model for this worker:" -ForegroundColor Yellow
    Write-Host "  [1] Qwen2.5-Coder-7B     — Code generation & debugging (recommended for PC2)" -ForegroundColor White
    Write-Host "  [2] DeepSeek-R1-7B        — Math & reasoning (recommended for PC3)" -ForegroundColor White
    Write-Host "  [3] Qwen2.5-7B-Instruct   — General chat (same as PC1)" -ForegroundColor White
    Write-Host "  [4] Custom model           — Enter HuggingFace model name" -ForegroundColor White
    $choice = Read-Host "Select (1-4)"
    switch ($choice) {
        "1" { $Model = "Qwen/Qwen2.5-Coder-7B-Instruct-AWQ" }
        "2" { $Model = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B" }
        "3" { $Model = "Qwen/Qwen2.5-7B-Instruct-AWQ" }
        "4" { $Model = Read-Host "Enter full HuggingFace model name" }
        default { $Model = "Qwen/Qwen2.5-Coder-7B-Instruct-AWQ" }
    }
}

# Get local IP
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" -and $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
if (-not $localIP) {
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
}
Write-Ok "This PC's IP: $localIP"

# Get CPU cores and RAM
$cpuCores = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors
$ramMB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1MB)
$gpuInfo = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader).Trim()
$gpuName = ($gpuInfo -split ",")[0].Trim()
$gpuVram = [int](($gpuInfo -split ",")[1].Trim() -replace '[^0-9]','')

Write-Host "`n  Configuration Summary:" -ForegroundColor Cyan
Write-Host "    Node Name:     $NodeName"
Write-Host "    Control Node:  $ControlNodeIP"
Write-Host "    This PC IP:    $localIP"
Write-Host "    GPU:           $gpuName ($gpuVram MB)"
Write-Host "    RAM:           $ramMB MB"
Write-Host "    CPU Cores:     $cpuCores"
Write-Host "    Model:         $Model"
Write-Host "    vLLM Port:     $VllmPort"

# ── Step 5: Create worker directory ─────────────────────
Write-Step "Setting up worker directory..."
$workerDir = "$env:USERPROFILE\mac-worker"
if (-not (Test-Path $workerDir)) { New-Item -ItemType Directory -Path $workerDir | Out-Null }

# Write .env file
$envContent = @"
# MAC Worker Node Configuration
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

CONTROL_NODE_URL=http://${ControlNodeIP}:8000
ENROLLMENT_TOKEN=${EnrollmentToken}
NODE_NAME=${NodeName}
VLLM_MODEL=${Model}
VLLM_PORT=${VllmPort}
GPU_MEM_UTIL=${GpuMemUtil}
MAX_MODEL_LEN=${MaxModelLen}
GPU_NAME=${gpuName}
GPU_VRAM_MB=${gpuVram}
RAM_TOTAL_MB=${ramMB}
CPU_CORES=${cpuCores}
HEARTBEAT_INTERVAL=30
"@

Set-Content -Path "$workerDir\.env" -Value $envContent
Write-Ok "Created .env at $workerDir\.env"

# Write docker-compose.yml
$composeContent = @"
# MAC GPU Worker Node — $NodeName
# Model: $Model
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

services:

  vllm:
    image: vllm/vllm-openai:latest
    container_name: mac-vllm-worker
    ports:
      - "${VllmPort}:${VllmPort}"
    environment:
      - HF_HOME=/root/.cache/huggingface
    volumes:
      - hf-cache:/root/.cache/huggingface
    command: >
      --model `${VLLM_MODEL}
      --port `${VLLM_PORT}
      --gpu-memory-utilization `${GPU_MEM_UTIL}
      --max-model-len `${MAX_MODEL_LEN}
      --trust-remote-code
      --enforce-eager
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    networks:
      - worker-net
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:`${VLLM_PORT}/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s

  worker-agent:
    image: python:3.11-slim
    container_name: mac-worker-agent
    env_file: .env
    volumes:
      - ./worker-agent.py:/app/agent.py:ro
      - agent-state:/tmp
    command: >
      bash -c "pip install httpx psutil --quiet && python /app/agent.py"
    depends_on:
      vllm:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - worker-net

volumes:
  hf-cache:
  agent-state:

networks:
  worker-net:
    driver: bridge
"@

Set-Content -Path "$workerDir\docker-compose.yml" -Value $composeContent
Write-Ok "Created docker-compose.yml"

# Copy worker-agent.py (download from control node or use local copy)
$agentScript = @'
#!/usr/bin/env python3
"""MAC Worker Agent — Enrolls with control node and sends periodic heartbeats."""

import asyncio, json, os, socket, sys, time
import httpx

CONTROL_URL = os.environ.get("CONTROL_NODE_URL", "http://10.10.13.30:8000")
ENROLLMENT_TOKEN = os.environ.get("ENROLLMENT_TOKEN", "")
NODE_NAME = os.environ.get("NODE_NAME", f"worker-{socket.gethostname()}")
VLLM_PORT = int(os.environ.get("VLLM_PORT", 8001))
GPU_NAME = os.environ.get("GPU_NAME", "NVIDIA GPU")
GPU_VRAM_MB = int(os.environ.get("GPU_VRAM_MB", 12288))
RAM_TOTAL_MB = int(os.environ.get("RAM_TOTAL_MB", 16384))
CPU_CORES = int(os.environ.get("CPU_CORES", 8))
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", 30))

API = f"{CONTROL_URL}/api/v1"
STATE_FILE = "/tmp/mac_worker_state.json"


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def load_state():
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(data):
    with open(STATE_FILE, "w") as f:
        json.dump(data, f)


def get_resource_metrics():
    metrics = {"cpu_util_pct": 0.0, "ram_used_mb": 0, "gpu_util_pct": 0.0, "gpu_vram_used_mb": 0}
    try:
        import psutil
        metrics["cpu_util_pct"] = psutil.cpu_percent(interval=1)
        metrics["ram_used_mb"] = int(psutil.virtual_memory().used / 1024 / 1024)
    except ImportError:
        pass
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(",")
            if len(parts) >= 2:
                metrics["gpu_util_pct"] = float(parts[0].strip())
                metrics["gpu_vram_used_mb"] = int(float(parts[1].strip()))
    except (FileNotFoundError, Exception):
        pass
    return metrics


async def enroll(client):
    state = load_state()
    if state.get("node_id"):
        print(f"[AGENT] Already enrolled as node {state['node_id']}")
        return state["node_id"]
    if not ENROLLMENT_TOKEN:
        print("[AGENT] ERROR: No ENROLLMENT_TOKEN set")
        return None
    ip = get_local_ip()
    payload = {
        "enrollment_token": ENROLLMENT_TOKEN, "name": NODE_NAME,
        "hostname": socket.gethostname(), "ip_address": ip, "port": VLLM_PORT,
        "gpu_name": GPU_NAME, "gpu_vram_mb": GPU_VRAM_MB,
        "ram_total_mb": RAM_TOTAL_MB, "cpu_cores": CPU_CORES,
    }
    try:
        resp = await client.post(f"{API}/nodes/enroll", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            node_id = data.get("id")
            save_state({"node_id": node_id, "name": NODE_NAME})
            print(f"[AGENT] Enrolled! Node ID: {node_id}")
            return node_id
        else:
            print(f"[AGENT] Enrollment failed: {resp.status_code} {resp.text}")
            return None
    except httpx.RequestError as e:
        print(f"[AGENT] Connection error: {e}")
        return None


async def heartbeat_loop(client, node_id):
    consecutive_failures = 0
    while True:
        try:
            metrics = get_resource_metrics()
            resp = await client.post(f"{API}/nodes/heartbeat/{node_id}", json=metrics)
            if resp.status_code == 200:
                consecutive_failures = 0
                warnings = resp.json().get("warnings", [])
                if warnings:
                    print(f"[AGENT] Warnings: {warnings}")
            elif resp.status_code == 404:
                print("[AGENT] Node not found — re-enrolling...")
                save_state({})
                return
            else:
                consecutive_failures += 1
        except httpx.RequestError as e:
            consecutive_failures += 1
            print(f"[AGENT] Heartbeat error: {e}")
        if consecutive_failures >= 10:
            print("[AGENT] Too many failures, waiting 60s...")
            await asyncio.sleep(60)
            consecutive_failures = 0
        else:
            await asyncio.sleep(HEARTBEAT_INTERVAL)


async def wait_for_vllm():
    print(f"[AGENT] Waiting for vLLM on port {VLLM_PORT}...")
    async with httpx.AsyncClient(timeout=5) as client:
        for _ in range(120):
            try:
                resp = await client.get(f"http://localhost:{VLLM_PORT}/health")
                if resp.status_code == 200:
                    print("[AGENT] vLLM ready!")
                    return True
            except httpx.RequestError:
                pass
            await asyncio.sleep(5)
    print("[AGENT] WARNING: vLLM not ready after 10 min")
    return False


async def main():
    print(f"[AGENT] MAC Worker Agent — {NODE_NAME}")
    print(f"[AGENT] Control: {CONTROL_URL}")
    await wait_for_vllm()
    async with httpx.AsyncClient(timeout=30) as client:
        node_id = None
        while not node_id:
            node_id = await enroll(client)
            if not node_id:
                print("[AGENT] Retrying in 30s...")
                await asyncio.sleep(30)
        print(f"[AGENT] Starting heartbeat loop (every {HEARTBEAT_INTERVAL}s)")
        while True:
            await heartbeat_loop(client, node_id)
            node_id = None
            while not node_id:
                node_id = await enroll(client)
                if not node_id:
                    await asyncio.sleep(30)

if __name__ == "__main__":
    asyncio.run(main())
'@

Set-Content -Path "$workerDir\worker-agent.py" -Value $agentScript
Write-Ok "Created worker-agent.py"

# ── Step 6: Launch! ─────────────────────────────────────
Write-Step "Starting MAC worker..."
Write-Host "`n  This will pull the vLLM Docker image (~8GB) and the model." -ForegroundColor Yellow
Write-Host "  First run may take 15-30 minutes depending on internet speed.`n" -ForegroundColor Yellow

$startNow = Read-Host "Start the worker now? (Y/n)"
if ($startNow -ne "n" -and $startNow -ne "N") {
    Push-Location $workerDir
    docker compose up -d
    Pop-Location
    
    Write-Host "`n" -NoNewline
    Write-Ok "Worker is starting! Monitor with:"
    Write-Host "    cd $workerDir" -ForegroundColor White
    Write-Host "    docker compose logs -f          # Watch all logs" -ForegroundColor White
    Write-Host "    docker compose logs -f vllm     # Watch model loading" -ForegroundColor White
    Write-Host "    docker compose logs -f worker-agent  # Watch enrollment" -ForegroundColor White
} else {
    Write-Ok "Setup complete. When ready, run:"
    Write-Host "    cd $workerDir" -ForegroundColor White
    Write-Host "    docker compose up -d" -ForegroundColor White
}

Write-Host @"

  ╔══════════════════════════════════════════════════╗
  ║  Setup complete! Worker: $NodeName
  ║  Model:  $Model
  ║  Control: http://${ControlNodeIP}:8000
  ║                                                  ║
  ║  The worker will auto-enroll with the control    ║
  ║  node and start sending heartbeats.              ║
  ╚══════════════════════════════════════════════════╝

"@ -ForegroundColor Green
