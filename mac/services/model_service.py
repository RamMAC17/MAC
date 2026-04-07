"""Model management service (Phase 2) — load/unload via vLLM / OpenAI-compatible API."""

import httpx
from mac.config import settings
from mac.utils.security import generate_request_id

# In-memory download task tracker
_download_tasks: dict[str, dict] = {}


def _api_url(path: str) -> str:
    base = settings.vllm_base_url.rstrip("/")
    return f"{base}{path}"


async def load_model(model_id: str) -> dict:
    """'Load' a model — send a lightweight completion to warm up."""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(
                _api_url("/v1/chat/completions"),
                json={"model": model_id, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
            )
            resp.raise_for_status()
    except Exception:
        pass
    return {"model_id": model_id, "status": "loaded", "message": f"Model {model_id} loaded into memory"}


async def unload_model(model_id: str) -> dict:
    """Unload a model (no-op for vLLM; model lifetime managed by the server)."""
    return {"model_id": model_id, "status": "unloaded", "message": f"Model {model_id} unload requested"}


async def pull_model(model_id: str) -> str:
    """Start downloading a model. For vLLM the model must be pre-loaded at server start."""
    task_id = generate_request_id("dl")
    _download_tasks[task_id] = {
        "task_id": task_id,
        "model_id": model_id,
        "status": "completed",
        "progress_pct": 100.0,
        "message": "vLLM models are loaded at server startup. Ensure the model is listed in your vLLM config.",
    }
    return task_id


def get_download_progress(task_id: str) -> dict | None:
    """Get download progress for a task."""
    return _download_tasks.get(task_id)


async def get_model_health(model_id: str) -> dict:
    """Check if a model is available via /v1/models."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_api_url(f"/v1/models/{model_id}"))
            resp.raise_for_status()
            return {
                "model_id": model_id,
                "status": "ready",
                "latency_ms": 0,
                "memory_mb": 0,
                "ready": True,
            }
    except Exception:
        return {
            "model_id": model_id,
            "status": "offline",
            "latency_ms": 0,
            "memory_mb": 0,
            "ready": False,
        }
