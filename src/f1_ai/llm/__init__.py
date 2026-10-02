"""LLM client wrapper guaranteeing think=False."""
from f1_ai.llm.ollama_client import ThinkingLeak, chat_json, chat_tools, ollama_version

__all__ = ["ThinkingLeak", "chat_json", "chat_tools", "ollama_version"]
