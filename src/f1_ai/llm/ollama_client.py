"""The only module that calls models. Thinking is always off."""
import re

import httpx
from ollama import AsyncClient, Client

from f1_ai.config import MODELS

_sync = Client()  # honours OLLAMA_HOST; default http://localhost:11434
_async = AsyncClient()
_FENCE = re.compile(r"^`{3}(?:json)?\s*|\s*`{3}$")  # strips Markdown code fences


class ThinkingLeak(RuntimeError):
    """Raised when a model returns a thinking trace despite think=False."""


def ollama_version() -> str:
    """Query running Ollama instance version."""
    try:
        return httpx.get("http://localhost:11434/api/version", timeout=3).json().get("version", "unknown")
    except Exception:
        return "unknown"


def _check(msg) -> None:
    thinking = getattr(msg, "thinking", None)
    content = getattr(msg, "content", "") or ""
    if thinking or "<think>" in content:
        raise ThinkingLeak("Model produced a thinking trace; check think=False and Ollama version.")


def chat_json(model: str, messages: list[dict], schema: dict) -> tuple[str, dict]:
    """Structured-output call for the debrief pipeline. Returns (clean_json_text, metadata)."""
    opts = MODELS[model].options() if model in MODELS else {"num_ctx": 8192}
    r = _sync.chat(
        model=model,
        messages=messages,
        format=schema,
        think=False,
        options=opts,
        stream=False,
    )
    _check(r.message)
    content = (r.message.content or "").strip()
    text = _FENCE.sub("", content).strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    metadata = {
        "prompt_tokens": getattr(r, "prompt_eval_count", 0) or 0,
        "output_tokens": getattr(r, "eval_count", 0) or 0,
        "seconds": (getattr(r, "total_duration", 0) or 0) / 1e9,
    }
    return text, metadata


async def chat_tools(model: str, messages: list, tools: list[dict]):
    """Tool-calling call for the harness. Returns the assistant message."""
    opts = MODELS[model].options() if model in MODELS else {"num_ctx": 8192}
    r = await _async.chat(
        model=model,
        messages=messages,
        tools=tools,
        think=False,
        options=opts,
    )
    _check(r.message)
    return r.message
