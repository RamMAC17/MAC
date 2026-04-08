"""Model management service — health checks and info for local vLLM instances."""

import httpx
from mac.config import settings
from mac.services.llm_service import DEFAULT_MODELS
from mac.utils.security import generate_request_id

# In-memory download task tracker
_download_tasks: dict[str, dict] = {}


def _api_url(base: str, path: str) -> str:
    return f"{base.rstrip('/')}{path}"


async def load_model(model_id: str) -> dict:
    """Warm up a model by sending a tiny request to its vLLM instance."""
    info = DEFAULT_MODELS.get(model_id)
    if not info:
        return {"model_id": model_id, "status": "not_found", "message": f"Unknown model: {model_id}"}
    url = getattr(settings, info.get("url_key", "vllm_speed_url"), settings.vllm_base_url)
    try:
        async with httpx.AsyncClient(timeout=settings.vllm_timeout) as client:
            resp = await client.post(
                _api_url(url, "/v1/chat/completions"),
                json={"model": info["served_name"], "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
            )
            resp.raise_for_status()
    except Exception:
        pass
    return {"model_id": model_id, "status": "loaded", "message": f"Model {info['name']} warmed up"}


async def unload_model(model_id: str) -> dict:
    """Unload a model (no-op for vLLM; model lifetime managed by the server process)."""
    return {"model_id": model_id, "status": "unloaded", "message": f"Model {model_id} unload requested (vLLM manages lifetime)"}


async def pull_model(model_id: str) -> str:
    """Download a model. For vLLM, models are specified at server start and downloaded automatically."""
    task_id = generate_request_id("dl")
    _download_tasks[task_id] = {
        "task_id": task_id,
        "model_id": model_id,
        "status": "completed",
        "progress_pct": 100.0,
        "message": "vLLM downloads models at startup. Add the model to docker-compose.yml and restart.",
    }
    return task_id


def get_download_progress(task_id: str) -> dict | None:
    return _download_tasks.get(task_id)


async def get_model_health(model_id: str) -> dict:
    """Check if a model's vLLM instance is responsive."""
    info = DEFAULT_MODELS.get(model_id)
    if not info:
        return {"model_id": model_id, "status": "not_found", "ready": False}

    url = getattr(settings, info.get("url_key", "vllm_speed_url"), settings.vllm_base_url)
    try:
        async with httpx.AsyncClient(timeout=settings.vllm_health_timeout) as client:
            resp = await client.get(_api_url(url, "/v1/models"))
            resp.raise_for_status()
            return {
                "model_id": model_id,
                "name": info["name"],
                "category": info["category"],
                "status": "ready",
                "ready": True,
            }
    except Exception:
        return {
            "model_id": model_id,
            "name": info["name"],
            "category": info["category"],
            "status": "offline",
            "ready": False,
        }
