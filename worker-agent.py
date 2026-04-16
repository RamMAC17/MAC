#!/usr/bin/env python3
"""
MAC Worker Agent — Enrolls with control node and sends periodic heartbeats.
Runs as a sidecar container alongside vLLM on each GPU worker PC.
"""

import asyncio
import json
import os
import socket
import sys
import time

import httpx

CONTROL_URL = os.environ.get("CONTROL_NODE_URL", "http://192.168.1.100:8000")
ENROLLMENT_TOKEN = os.environ.get("ENROLLMENT_TOKEN", "")
NODE_NAME = os.environ.get("NODE_NAME", f"worker-{socket.gethostname()}")
VLLM_PORT = int(os.environ.get("VLLM_PORT", 8001))
VLLM_MODEL = os.environ.get("VLLM_MODEL", "")
GPU_NAME = os.environ.get("GPU_NAME", "NVIDIA GPU")
GPU_VRAM_MB = int(os.environ.get("GPU_VRAM_MB", 12288))
RAM_TOTAL_MB = int(os.environ.get("RAM_TOTAL_MB", 16384))
CPU_CORES = int(os.environ.get("CPU_CORES", 8))
HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", 30))

API = f"{CONTROL_URL}/api/v1"
STATE_FILE = "/tmp/mac_worker_state.json"


def get_local_ip():
    """Get the local IP address visible on the network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def load_state():
    """Load saved node ID from previous enrollment."""
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(data):
    """Save enrollment state."""
    with open(STATE_FILE, "w") as f:
        json.dump(data, f)


def get_resource_metrics():
    """Collect current resource utilization metrics."""
    metrics = {
        "cpu_util_pct": 0.0,
        "ram_used_mb": 0,
        "gpu_util_pct": 0.0,
        "gpu_vram_used_mb": 0,
    }
    try:
        import psutil
        metrics["cpu_util_pct"] = psutil.cpu_percent(interval=1)
        mem = psutil.virtual_memory()
        metrics["ram_used_mb"] = int(mem.used / 1024 / 1024)
    except ImportError:
        pass

    # Try nvidia-smi for GPU metrics
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=utilization.gpu,memory.used",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split(",")
            if len(parts) >= 2:
                metrics["gpu_util_pct"] = float(parts[0].strip())
                metrics["gpu_vram_used_mb"] = int(float(parts[1].strip()))
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        pass

    return metrics


async def enroll(client: httpx.AsyncClient) -> str | None:
    """Enroll this node with the control server. Returns node ID."""
    state = load_state()
    if state.get("node_id"):
        print(f"[AGENT] Already enrolled as node {state['node_id']}")
        return state["node_id"]

    if not ENROLLMENT_TOKEN:
        print("[AGENT] ERROR: No ENROLLMENT_TOKEN set. Cannot enroll.")
        return None

    ip = get_local_ip()
    payload = {
        "enrollment_token": ENROLLMENT_TOKEN,
        "name": NODE_NAME,
        "hostname": socket.gethostname(),
        "ip_address": ip,
        "port": VLLM_PORT,
        "gpu_name": GPU_NAME,
        "gpu_vram_mb": GPU_VRAM_MB,
        "ram_total_mb": RAM_TOTAL_MB,
        "cpu_cores": CPU_CORES,
    }

    try:
        resp = await client.post(f"{API}/nodes/enroll", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            node_id = data.get("id")
            save_state({"node_id": node_id, "name": NODE_NAME})
            print(f"[AGENT] Enrolled successfully! Node ID: {node_id}")
            return node_id
        else:
            print(f"[AGENT] Enrollment failed: {resp.status_code} {resp.text}")
            return None
    except httpx.RequestError as e:
        print(f"[AGENT] Connection error during enrollment: {e}")
        return None


async def heartbeat_loop(client: httpx.AsyncClient, node_id: str):
    """Send periodic heartbeats with resource metrics."""
    consecutive_failures = 0
    max_failures = 10

    while True:
        try:
            metrics = get_resource_metrics()
            resp = await client.post(
                f"{API}/nodes/heartbeat/{node_id}",
                json=metrics
            )

            if resp.status_code == 200:
                data = resp.json()
                consecutive_failures = 0
                warnings = data.get("warnings", [])
                if warnings:
                    print(f"[AGENT] Resource warnings: {warnings}")
            elif resp.status_code == 404:
                print("[AGENT] Node not found — re-enrollment needed")
                save_state({})
                return
            else:
                consecutive_failures += 1
                print(f"[AGENT] Heartbeat failed: {resp.status_code}")

        except httpx.RequestError as e:
            consecutive_failures += 1
            print(f"[AGENT] Heartbeat connection error: {e}")

        if consecutive_failures >= max_failures:
            print(f"[AGENT] {max_failures} consecutive failures. Waiting 60s before retry.")
            await asyncio.sleep(60)
            consecutive_failures = 0
        else:
            await asyncio.sleep(HEARTBEAT_INTERVAL)


async def wait_for_vllm():
    """Wait for local vLLM server to be ready."""
    print(f"[AGENT] Waiting for vLLM on port {VLLM_PORT}...")
    async with httpx.AsyncClient(timeout=5) as client:
        for attempt in range(120):  # Wait up to 10 minutes
            try:
                resp = await client.get(f"http://localhost:{VLLM_PORT}/health")
                if resp.status_code == 200:
                    print("[AGENT] vLLM is ready!")
                    return True
            except httpx.RequestError:
                pass
            await asyncio.sleep(5)
    print("[AGENT] WARNING: vLLM did not become ready in time")
    return False


async def detect_vllm_model():
    """Query vLLM to find what model it's actually serving."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"http://localhost:{VLLM_PORT}/v1/models")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])
                if models:
                    return models[0].get("id", "")
    except Exception:
        pass
    return VLLM_MODEL


def _model_id_from_served_name(served_name: str) -> str:
    """Map HuggingFace model name to MAC model_id."""
    mapping = {
        "Qwen/Qwen2.5-7B-Instruct-AWQ": "qwen2.5:7b",
        "Qwen/Qwen2.5-7B-Instruct": "qwen2.5:7b",
        "Qwen/Qwen2.5-Coder-7B-Instruct-AWQ": "qwen2.5-coder:7b",
        "Qwen/Qwen2.5-Coder-7B-Instruct": "qwen2.5-coder:7b",
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B": "deepseek-r1:14b",
        "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": "deepseek-r1:7b",
        "google/gemma-3-27b-it": "gemma3:27b",
    }
    return mapping.get(served_name, served_name)


async def register_model(client: httpx.AsyncClient, node_id: str):
    """Register the served model with the control node."""
    served_name = await detect_vllm_model()
    if not served_name:
        print("[AGENT] Could not detect model — skipping registration")
        return

    model_id = _model_id_from_served_name(served_name)
    print(f"[AGENT] Registering model: {model_id} ({served_name})")

    try:
        resp = await client.post(
            f"{API}/nodes/register-model/{node_id}",
            json={
                "model_id": model_id,
                "served_name": served_name,
                "model_name": served_name.split("/")[-1] if "/" in served_name else served_name,
                "vllm_port": VLLM_PORT,
            }
        )
        if resp.status_code == 200:
            print(f"[AGENT] Model registered: {resp.json()}")
        else:
            print(f"[AGENT] Model registration failed: {resp.status_code} {resp.text}")
    except httpx.RequestError as e:
        print(f"[AGENT] Model registration error: {e}")


async def main():
    print(f"[AGENT] MAC Worker Agent starting — {NODE_NAME}")
    print(f"[AGENT] Control node: {CONTROL_URL}")
    if VLLM_MODEL:
        print(f"[AGENT] Configured model: {VLLM_MODEL}")

    await wait_for_vllm()

    async with httpx.AsyncClient(timeout=30) as client:
        # Enrollment loop
        node_id = None
        while not node_id:
            node_id = await enroll(client)
            if not node_id:
                print("[AGENT] Retrying enrollment in 30s...")
                await asyncio.sleep(30)

        # Register model with control node
        await register_model(client, node_id)

        # Heartbeat loop
        print(f"[AGENT] Starting heartbeat loop (interval: {HEARTBEAT_INTERVAL}s)")
        while True:
            await heartbeat_loop(client, node_id)

            # If heartbeat loop exits (node not found), re-enroll
            print("[AGENT] Heartbeat loop exited. Re-enrolling...")
            node_id = None
            while not node_id:
                node_id = await enroll(client)
                if not node_id:
                    await asyncio.sleep(30)
            await register_model(client, node_id)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[AGENT] Shutting down...")
        sys.exit(0)
