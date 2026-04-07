"""Model management endpoints — /models (Phase 2)."""

from fastapi import APIRouter, Depends, HTTPException
from mac.schemas.models import (
    ModelStatusResponse, ModelHealthResponse, ModelDownloadRequest,
    DownloadProgressResponse,
)
from mac.schemas.explore import ModelInfo, ModelsListResponse, ModelDetail
from mac.services import model_service
from mac.services.llm_service import DEFAULT_MODELS, list_available_models, get_model_detail
from mac.middleware.auth_middleware import require_admin
from mac.models.user import User

router = APIRouter(prefix="/models", tags=["Models"])


@router.get("", response_model=ModelsListResponse)
async def list_models():
    """List all models with their current status."""
    backend_models = await list_available_models()
    backend_ids = {m.get("id", "") for m in backend_models}

    models = []
    for model_id, info in DEFAULT_MODELS.items():
        tag = info["served_name"]
        is_loaded = tag in backend_ids or any(tag in mid for mid in backend_ids)

        models.append(ModelInfo(
            id=model_id,
            name=info["name"],
            specialty=info.get("specialty", ""),
            parameters=info.get("parameters", ""),
            context_length=info.get("context_length", 4096),
            status="loaded" if is_loaded else "offline",
            capabilities=info.get("capabilities", []),
        ))

    return ModelsListResponse(models=models, total=len(models))


@router.get("/{model_id}", response_model=ModelDetail)
async def get_model(model_id: str):
    """Get detailed model info."""
    if model_id not in DEFAULT_MODELS:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"Model '{model_id}' not found"})

    info = DEFAULT_MODELS[model_id]
    detail = await get_model_detail(info["served_name"])
    return ModelDetail(
        id=model_id,
        name=info["name"],
        specialty=info.get("specialty", ""),
        parameters=info.get("parameters", ""),
        context_length=info.get("context_length", 4096),
        capabilities=info.get("capabilities", []),
        status="loaded" if detail else "offline",
    )


@router.post("/{model_id}/load", response_model=ModelStatusResponse)
async def load_model(model_id: str, admin: User = Depends(require_admin)):
    """Load a model into GPU memory (admin-only)."""
    try:
        result = await model_service.load_model(model_id)
        return ModelStatusResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=503, detail={"code": "load_failed", "message": str(e)})


@router.post("/{model_id}/unload", response_model=ModelStatusResponse)
async def unload_model(model_id: str, admin: User = Depends(require_admin)):
    """Unload a model from GPU memory (admin-only)."""
    try:
        result = await model_service.unload_model(model_id)
        return ModelStatusResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=503, detail={"code": "unload_failed", "message": str(e)})


@router.get("/{model_id}/health", response_model=ModelHealthResponse)
async def model_health(model_id: str):
    """Check if a model is ready and responsive."""
    result = await model_service.get_model_health(model_id)
    return ModelHealthResponse(**result)


@router.post("/download", response_model=DownloadProgressResponse)
async def download_model(body: ModelDownloadRequest, admin: User = Depends(require_admin)):
    """Download a model from Ollama registry (admin-only)."""
    task_id = await model_service.pull_model(body.model_id)
    progress = model_service.get_download_progress(task_id)
    if progress:
        return DownloadProgressResponse(**progress)
    return DownloadProgressResponse(task_id=task_id, model_id=body.model_id, status="queued")


@router.get("/download/{task_id}", response_model=DownloadProgressResponse)
async def download_progress(task_id: str):
    """Check model download progress."""
    progress = model_service.get_download_progress(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Download task not found"})
    return DownloadProgressResponse(**progress)
