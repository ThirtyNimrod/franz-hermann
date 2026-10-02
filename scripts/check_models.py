"""Fails loudly if a model still produces a thinking trace, and prints speed."""
import sys
from ollama import chat

MODELS = ["qwen3.5:4b", "granite4.2:8b"]
PROMPT = [{"role": "user", "content": "List three F1 tyre compounds, comma separated."}]

failed = False
for model in MODELS:
    try:
        r = chat(model=model, messages=PROMPT, think=False, options={"num_ctx": 4096})
        thinking = getattr(r.message, "thinking", "") or ""
        eval_count = getattr(r, "eval_count", 0) or 0
        eval_duration = getattr(r, "eval_duration", 0) or 0
        tps = eval_count / (eval_duration / 1e9) if eval_duration else 0.0
        content = (r.message.content or "").strip()
        print(
            f"{model:16s} thinking_chars={len(thinking):5d} tokens={eval_count:4d} "
            f"speed={tps:5.1f} tok/s  reply={content[:60]!r}"
        )
        failed |= bool(thinking) or "<think>" in content
    except Exception as e:
        print(f"{model:16s} ERROR: {e}")
        failed = True

sys.exit(1 if failed else 0)
