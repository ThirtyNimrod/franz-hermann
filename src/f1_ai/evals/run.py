"""Run evaluation suite against local models and record results."""
import argparse
import asyncio
import csv
import time
from pathlib import Path
import yaml

from f1_ai.config import CHAT_MODEL, ROOT
from f1_ai.harness.agent import ask
from f1_ai.llm.ollama_client import ollama_version


async def run_evals(model: str = CHAT_MODEL, questions_file: Path | None = None):
    q_path = questions_file or (ROOT / "evals" / "questions.yaml")
    if not q_path.exists():
        print(f"Questions file not found: {q_path}")
        return

    with open(q_path, "r", encoding="utf-8") as f:
        questions = yaml.safe_load(f)

    results_file = ROOT / "evals" / "results.csv"
    results_file.parent.mkdir(parents=True, exist_ok=True)
    write_header = not results_file.exists()

    ollama_ver = ollama_version()
    correct_count = 0
    total_time = 0.0
    tool_errors = 0

    print(f"Running evals for model: {model} (Ollama {ollama_ver}) on {len(questions)} questions...")

    for q in questions:
        qid = q.get("id")
        prompt = q.get("question")
        expected = str(q.get("answer"))
        check_type = q.get("check", "contains")

        t0 = time.time()
        reply = await ask(prompt, model=model)
        elapsed = time.time() - t0
        total_time += elapsed

        if "TOOL ERROR" in reply:
            tool_errors += 1

        is_correct = False
        if check_type == "contains":
            is_correct = expected.lower() in reply.lower()
        elif check_type == "exact":
            is_correct = expected.strip().lower() == reply.strip().lower()

        if is_correct:
            correct_count += 1

        print(f"[{qid}] {'PASS' if is_correct else 'FAIL'} in {elapsed:.1f}s | expected: {expected!r} in reply")

    accuracy = correct_count / len(questions) if questions else 0.0
    avg_sec = total_time / len(questions) if questions else 0.0
    error_rate = tool_errors / len(questions) if questions else 0.0

    print(f"\nSummary: Accuracy: {accuracy:.1%}, Avg Time: {avg_sec:.2f}s, Tool Error Rate: {error_rate:.1%}")

    with open(results_file, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow([
                "model",
                "ollama_version",
                "think",
                "accuracy",
                "tool_call_error_rate",
                "avg_seconds_per_question",
                "total_questions",
            ])
        writer.writerow([
            model,
            ollama_ver,
            False,
            f"{accuracy:.3f}",
            f"{error_rate:.3f}",
            f"{avg_sec:.2f}",
            len(questions),
        ])
    print(f"Results appended to {results_file}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=CHAT_MODEL)
    args = parser.parse_args()
    asyncio.run(run_evals(model=args.model))


if __name__ == "__main__":
    main()
