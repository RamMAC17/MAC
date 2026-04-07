"""LLM service — proxy requests to vLLM / OpenAI-compatible backends."""

import time
import json
import httpx
from typing import AsyncIterator
from mac.config import settings
from mac.utils.security import generate_request_id

# Model registry — maps friendly IDs to served model names.
# Works with any OpenAI-compatible backend (vLLM, Ollama /v1, LiteLLM).
DEFAULT_MODELS = {
    "qwen2.5-coder:7b": {
        "name": "Qwen2.5-Coder 7B",
        "specialty": "Code generation, debugging, explanation",
        "parameters": "7B",
        "context_length": 32768,
        "capabilities": ["code", "chat", "completion"],
        "served_name": "qwen2.5-coder:7b",
    },
    "deepseek-r1:8b": {
        "name": "DeepSeek-R1 8B",
        "specialty": "Maths, reasoning, step-by-step logic",
        "parameters": "8B",
        "context_length": 65536,
        "capabilities": ["reasoning", "math", "chat"],
        "served_name": "deepseek-r1:8b",
    },
    "llava:7b": {
        "name": "LLaVA 1.6 7B",
        "specialty": "Image understanding and visual Q&A",
        "parameters": "7B",
        "context_length": 4096,
        "capabilities": ["vision", "chat"],
        "served_name": "llava:7b",
    },
    "qwen2.5:14b": {
        "name": "Qwen2.5 14B",
        "specialty": "General purpose — essays, summarisation, Q&A",
        "parameters": "14B",
        "context_length": 32768,
        "capabilities": ["chat", "completion", "reasoning"],
        "served_name": "qwen2.5:14b",
    },
    "whisper-large-v3": {
        "name": "Whisper Large V3",
        "specialty": "Speech-to-text transcription and translation",
        "parameters": "1.5B",
        "context_length": 0,
        "capabilities": ["speech"],
        "served_name": "whisper-large-v3",
    },
}

# The default/auto model for routing
AUTO_MODEL = "qwen2.5-coder:7b"

# Smart routing keywords
_CODE_KEYWORDS = {"code", "function", "bug", "error", "debug", "python", "javascript",
                  "typescript", "java", "rust", "golang", "c++", "compile", "syntax",
                  "refactor", "class", "api", "algorithm", "programming", "script",
                  "html", "css", "sql", "git", "docker", "def ", "import ", "print("}
_MATH_KEYWORDS = {"math", "equation", "calculate", "prove", "integral", "derivative",
                  "theorem", "matrix", "algebra", "calculus", "probability",
                  "statistics", "geometry", "trigonometry", "factorial", "logarithm",
                  "solve", "sum of", "product of", "limit", "series"}


def _smart_route(messages: list[dict] | None = None) -> str:
    """Pick the best model based on message content keywords."""
    if not messages:
        return AUTO_MODEL
    text = " ".join(m.get("content", "") for m in messages).lower()
    code_score = sum(1 for k in _CODE_KEYWORDS if k in text)
    math_score = sum(1 for k in _MATH_KEYWORDS if k in text)
    if math_score > code_score and math_score >= 2:
        return "deepseek-r1:8b"
    if code_score >= 1:
        return "qwen2.5-coder:7b"
    # Default to general-purpose model
    return "qwen2.5:14b"


def _resolve_model(model_id: str, messages: list[dict] | None = None) -> str:
    """Resolve 'auto' or friendly name to served model name."""
    if model_id == "auto":
        return _smart_route(messages)
    if model_id in DEFAULT_MODELS:
        return DEFAULT_MODELS[model_id]["served_name"]
    return model_id


def _api_url(path: str) -> str:
    """Build full URL for vLLM / OpenAI-compatible endpoint."""
    base = settings.vllm_base_url.rstrip("/")
    return f"{base}{path}"


async def chat_completion(
    model: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2048,
    top_p: float = 1.0,
    frequency_penalty: float = 0.0,
    presence_penalty: float = 0.0,
    stop: list[str] | str | None = None,
) -> dict:
    """Send a chat completion via OpenAI-compatible API (vLLM / Ollama /v1)."""
    resolved = _resolve_model(model, messages)
    request_id = generate_request_id("mac-chat")
    start = time.time()

    payload: dict = {
        "model": resolved,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": top_p,
        "frequency_penalty": frequency_penalty,
        "presence_penalty": presence_penalty,
        "stream": False,
    }
    if stop:
        payload["stop"] = stop if isinstance(stop, list) else [stop]

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(_api_url("/v1/chat/completions"), json=payload)
        resp.raise_for_status()
        data = resp.json()

    latency_ms = int((time.time() - start) * 1000)

    # vLLM / OpenAI response is already in the right format
    usage = data.get("usage", {})
    choice = data["choices"][0]

    return {
        "id": data.get("id", request_id),
        "object": "chat.completion",
        "created": data.get("created", int(time.time())),
        "model": resolved,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": choice["message"]["content"]},
                "finish_reason": choice.get("finish_reason", "stop"),
            }
        ],
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        },
        "context_id": None,
        "_latency_ms": latency_ms,
    }


async def chat_completion_stream(
    model: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2048,
    top_p: float = 1.0,
    stop: list[str] | str | None = None,
) -> AsyncIterator[str]:
    """Stream a chat completion as SSE data lines (OpenAI-compatible)."""
    resolved = _resolve_model(model, messages)
    request_id = generate_request_id("mac-chat")

    payload: dict = {
        "model": resolved,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": top_p,
        "stream": True,
    }
    if stop:
        payload["stop"] = stop if isinstance(stop, list) else [stop]

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", _api_url("/v1/chat/completions"), json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                err_msg = body.decode(errors="replace")[:200]
                error_sse = {
                    "id": request_id,
                    "object": "chat.completion.chunk",
                    "error": {"code": "model_unavailable", "message": f"Backend returned {resp.status_code}: {err_msg}"},
                }
                yield f"data: {json.dumps(error_sse)}\n\n"
                yield "data: [DONE]\n\n"
                return
            async for line in resp.aiter_lines():
                if not line:
                    continue
                # OpenAI SSE format: "data: {...}" or "data: [DONE]"
                text = line.removeprefix("data: ").strip()
                if not text or text == "[DONE]":
                    if text == "[DONE]":
                        yield "data: [DONE]\n\n"
                    continue
                try:
                    chunk = json.loads(text)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    sse = {
                        "id": chunk.get("id", request_id),
                        "object": "chat.completion.chunk",
                        "choices": [{"delta": {"content": content}, "index": 0}],
                    }
                    yield f"data: {json.dumps(sse)}\n\n"
                finish = chunk.get("choices", [{}])[0].get("finish_reason")
                if finish:
                    yield "data: [DONE]\n\n"


async def text_completion(
    model: str,
    prompt: str,
    max_tokens: int = 256,
    temperature: float = 0.7,
    stop: list[str] | str | None = None,
) -> dict:
    """Text completion via OpenAI-compatible /v1/completions."""
    resolved = _resolve_model(model)
    request_id = generate_request_id("mac-comp")
    start = time.time()

    payload: dict = {
        "model": resolved,
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": False,
    }
    if stop:
        payload["stop"] = stop if isinstance(stop, list) else [stop]

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(_api_url("/v1/completions"), json=payload)
        resp.raise_for_status()
        data = resp.json()

    latency_ms = int((time.time() - start) * 1000)
    usage = data.get("usage", {})
    choice = data["choices"][0]

    return {
        "id": data.get("id", request_id),
        "object": "text_completion",
        "created": data.get("created", int(time.time())),
        "model": resolved,
        "choices": [{"text": choice.get("text", ""), "index": 0, "finish_reason": choice.get("finish_reason", "stop")}],
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        },
        "_latency_ms": latency_ms,
    }


async def generate_embeddings(texts: list[str], model: str = "default") -> dict:
    """Generate embeddings via OpenAI-compatible /v1/embeddings."""
    resolved = "nomic-embed-text" if model == "default" else model

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            _api_url("/v1/embeddings"),
            json={"model": resolved, "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "object": "list",
        "data": data.get("data", []),
        "model": resolved,
        "usage": data.get("usage", {"prompt_tokens": 0, "total_tokens": 0}),
    }


async def list_available_models() -> list[dict]:
    """Fetch models from the OpenAI-compatible /v1/models endpoint."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_api_url("/v1/models"))
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
    except Exception:
        return []


# Keep backward-compat aliases
list_ollama_models = list_available_models


async def get_model_detail(model_name: str) -> dict | None:
    """Get info about a model from /v1/models/{model}."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(_api_url(f"/v1/models/{model_name}"))
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


# Keep backward-compat alias
get_ollama_model_detail = get_model_detail


async def vision_chat(
    image_b64: str,
    prompt: str,
    model: str = "llava:7b",
) -> dict:
    """Send an image + prompt to a vision model via OpenAI-compatible API."""
    resolved = _resolve_model(model)
    request_id = generate_request_id("mac-vis")
    start = time.time()

    payload = {
        "model": resolved,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                ],
            },
        ],
        "max_tokens": 1024,
        "stream": False,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(_api_url("/v1/chat/completions"), json=payload)
        resp.raise_for_status()
        data = resp.json()

    latency_ms = int((time.time() - start) * 1000)
    choice = data["choices"][0]
    usage = data.get("usage", {})

    return {
        "id": data.get("id", request_id),
        "object": "chat.completion",
        "created": data.get("created", int(time.time())),
        "model": resolved,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": choice["message"]["content"]}, "finish_reason": choice.get("finish_reason", "stop")}],
        "usage": {"prompt_tokens": usage.get("prompt_tokens", 0), "completion_tokens": usage.get("completion_tokens", 0), "total_tokens": usage.get("total_tokens", 0)},
        "_latency_ms": latency_ms,
    }
