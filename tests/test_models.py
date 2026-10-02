"""Ollama models tests: verify thinking is disabled and structured JSON works."""
import httpx
import pytest
from ollama import chat

from f1_ai.debrief.schema import TeamDebrief


def _ollama_up() -> bool:
    try:
        return httpx.get("http://localhost:11434/api/version", timeout=2).status_code == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _ollama_up(), reason="Ollama not running")
MODELS = ["qwen3.5:4b", "granite4.2:8b"]


@pytest.mark.parametrize("model", MODELS)
def test_thinking_disabled(model):
    r = chat(
        model=model,
        messages=[{"role": "user", "content": "Reply with the word OK."}],
        think=False,
        options={"num_ctx": 2048},
    )
    assert not getattr(r.message, "thinking", None)
    assert "OK" in (r.message.content or "").upper()


@pytest.mark.parametrize("model", MODELS)
def test_structured_output_without_thinking(model):
    prompt = (
        "Team McLaren. Facts: seg.T3-T4 value 0.084 s, faster PIA, slower NOR. "
        "Write a debrief as JSON."
    )
    r = chat(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        think=False,
        format=TeamDebrief.model_json_schema(),
        options={"num_ctx": 4096},
    )
    content = (r.message.content or "").strip()
    clean = content.strip("`").removeprefix("json").strip()
    deb = TeamDebrief.model_validate_json(clean)
    assert deb.team != ""
