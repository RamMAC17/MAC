"""Query endpoints — /query — core inference API."""

import json
import base64
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.schemas.chat import (
    ChatRequest, ChatResponse, ChatChoice, ChatMessage, UsageInfo,
    CompletionRequest, CompletionResponse, CompletionChoice,
    EmbeddingRequest, EmbeddingResponse,
    RerankRequest, RerankResponse, RerankResult,
    STTResponse, TTSRequest,
)
from mac.services import llm_service
from mac.services.usage_service import log_request
from mac.middleware.rate_limit import check_rate_limit
from mac.models.user import User

router = APIRouter(prefix="/query", tags=["Query"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Chat completion — multi-turn conversation. OpenAI-compatible."""
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Streaming
    if body.stream:
        async def stream_gen():
            async for chunk in llm_service.chat_completion_stream(
                model=body.model,
                messages=messages,
                temperature=body.temperature,
                max_tokens=body.max_tokens,
                top_p=body.top_p,
                stop=body.stop,
            ):
                yield chunk

        return StreamingResponse(stream_gen(), media_type="text/event-stream")

    # Non-streaming
    try:
        result = await llm_service.chat_completion(
            model=body.model,
            messages=messages,
            temperature=body.temperature,
            max_tokens=body.max_tokens,
            top_p=body.top_p,
            frequency_penalty=body.frequency_penalty,
            presence_penalty=body.presence_penalty,
            stop=body.stop,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Model inference failed: {str(e)}",
        })

    # Log usage
    usage = result.get("usage", {})
    await log_request(
        db, user.id, result["model"], "/query/chat",
        tokens_in=usage.get("prompt_tokens", 0),
        tokens_out=usage.get("completion_tokens", 0),
        latency_ms=result.get("_latency_ms", 0),
        status_code=200,
        request_id=result["id"],
    )

    # Build response
    choice_data = result["choices"][0]
    return ChatResponse(
        id=result["id"],
        created=result["created"],
        model=result["model"],
        choices=[ChatChoice(
            index=0,
            message=ChatMessage(role="assistant", content=choice_data["message"]["content"]),
            finish_reason=choice_data.get("finish_reason", "stop"),
        )],
        usage=UsageInfo(**usage),
        context_id=result.get("context_id"),
    )


@router.post("/completions", response_model=CompletionResponse)
async def completions(
    body: CompletionRequest,
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Raw text completion — OpenAI-compatible."""
    try:
        result = await llm_service.text_completion(
            model=body.model,
            prompt=body.prompt,
            max_tokens=body.max_tokens,
            temperature=body.temperature,
            stop=body.stop,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Model inference failed: {str(e)}",
        })

    usage = result.get("usage", {})
    await log_request(
        db, user.id, result["model"], "/query/completions",
        tokens_in=usage.get("prompt_tokens", 0),
        tokens_out=usage.get("completion_tokens", 0),
        latency_ms=result.get("_latency_ms", 0),
        status_code=200,
        request_id=result["id"],
    )

    choice_data = result["choices"][0]
    return CompletionResponse(
        id=result["id"],
        created=result["created"],
        model=result["model"],
        choices=[CompletionChoice(text=choice_data["text"], finish_reason=choice_data.get("finish_reason", "stop"))],
        usage=UsageInfo(**usage),
    )


@router.post("/embeddings", response_model=EmbeddingResponse)
async def embeddings(
    body: EmbeddingRequest,
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Generate vector embeddings for text."""
    texts = body.input if isinstance(body.input, list) else [body.input]

    try:
        result = await llm_service.generate_embeddings(texts, body.model)
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Embedding generation failed: {str(e)}",
        })

    await log_request(
        db, user.id, result.get("model", "embedding"), "/query/embeddings",
        tokens_in=result["usage"]["prompt_tokens"],
        tokens_out=0,
        latency_ms=0,
        status_code=200,
        request_id="emb-0",
    )

    return EmbeddingResponse(**result)


@router.post("/rerank", response_model=RerankResponse)
async def rerank(
    body: RerankRequest,
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Re-rank documents by relevance to a query.
    Simple implementation using embeddings cosine similarity.
    """
    try:
        # Get embeddings for query and all documents
        all_texts = [body.query] + body.documents
        result = await llm_service.generate_embeddings(all_texts)

        emb_data = result.get("data", [])
        if len(emb_data) < 2:
            raise ValueError("Not enough embeddings returned")

        query_emb = emb_data[0]["embedding"]
        doc_embs = [d["embedding"] for d in emb_data[1:]]

        # Cosine similarity
        def cosine_sim(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = sum(x * x for x in a) ** 0.5
            norm_b = sum(x * x for x in b) ** 0.5
            if norm_a == 0 or norm_b == 0:
                return 0
            return dot / (norm_a * norm_b)

        scored = []
        for i, doc_emb in enumerate(doc_embs):
            score = cosine_sim(query_emb, doc_emb)
            scored.append(RerankResult(index=i, document=body.documents[i], relevance_score=round(score, 4)))

        scored.sort(key=lambda x: x.relevance_score, reverse=True)

        if body.top_k:
            scored = scored[:body.top_k]

        return RerankResponse(results=scored)

    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Rerank failed: {str(e)}",
        })


@router.post("/vision", response_model=ChatResponse)
async def vision(
    image: UploadFile = File(..., description="Image file (jpg, png, webp)"),
    prompt: str = Form(default="Describe this image in detail."),
    model: str = Form(default="qwen2.5:7b"),
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Vision — analyse an image with a multimodal model."""
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail={
            "code": "invalid_file",
            "message": f"Unsupported image type: {image.content_type}. Use JPEG, PNG, or WebP.",
        })

    raw = await image.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be under 20 MB")
    image_b64 = base64.b64encode(raw).decode()

    try:
        result = await llm_service.vision_chat(image_b64, prompt, model)
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Vision inference failed: {str(e)}",
        })

    usage = result.get("usage", {})
    await log_request(
        db, user.id, result["model"], "/query/vision",
        tokens_in=usage.get("prompt_tokens", 0),
        tokens_out=usage.get("completion_tokens", 0),
        latency_ms=result.get("_latency_ms", 0),
        status_code=200,
        request_id=result["id"],
    )

    choice_data = result["choices"][0]
    return ChatResponse(
        id=result["id"],
        created=result["created"],
        model=result["model"],
        choices=[ChatChoice(
            index=0,
            message=ChatMessage(role="assistant", content=choice_data["message"]["content"]),
            finish_reason="stop",
        )],
        usage=UsageInfo(**usage),
    )


@router.post("/speech-to-text", response_model=STTResponse)
async def speech_to_text(
    audio: UploadFile = File(..., description="Audio file (mp3, wav, ogg, m4a)"),
    model: str = Form(default="default"),
    language: str = Form(default="en"),
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Speech-to-text — transcribe audio via Whisper endpoint."""
    allowed_types = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4",
                     "audio/x-wav", "audio/webm", "audio/mp3", "audio/m4a"}
    if image_type := audio.content_type:
        if image_type not in allowed_types:
            raise HTTPException(status_code=400, detail={
                "code": "invalid_file",
                "message": f"Unsupported audio type: {audio.content_type}",
            })

    raw = await audio.read()
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio must be under 50 MB")

    try:
        result = await llm_service.speech_to_text(
            audio_bytes=raw,
            filename=audio.filename or "audio.wav",
            model=model,
            language=language,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail={
            "code": "not_configured",
            "message": str(e),
        })
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Speech-to-text failed: {str(e)}",
        })

    await log_request(
        db, user.id, result.get("model", "whisper"), "/query/speech-to-text",
        tokens_in=0, tokens_out=0,
        latency_ms=result.get("_latency_ms", 0),
        status_code=200,
        request_id=result["id"],
    )

    return STTResponse(
        id=result["id"],
        model=result["model"],
        text=result["text"],
        language=result["language"],
        duration_seconds=result["duration_seconds"],
        segments=result.get("segments", []),
    )


@router.post("/text-to-speech")
async def text_to_speech(
    body: TTSRequest,
    user: User = Depends(check_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    """Text-to-speech — generate audio from text via TTS endpoint."""
    try:
        audio_bytes = await llm_service.text_to_speech(
            text=body.text,
            voice=body.voice,
            speed=body.speed,
            response_format=body.response_format,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail={
            "code": "not_configured",
            "message": str(e),
        })
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "code": "model_unavailable",
            "message": f"Text-to-speech failed: {str(e)}",
        })

    content_types = {"mp3": "audio/mpeg", "wav": "audio/wav", "opus": "audio/opus"}
    media_type = content_types.get(body.response_format, "audio/mpeg")

    await log_request(
        db, user.id, "tts", "/query/text-to-speech",
        tokens_in=len(body.text), tokens_out=0,
        latency_ms=0, status_code=200,
        request_id="tts-0",
    )

    from fastapi.responses import Response
    return Response(content=audio_bytes, media_type=media_type, headers={
        "Content-Disposition": f'attachment; filename="speech.{body.response_format}"',
    })
