"""Ask questions about F1 sessions using a local model and the f1 MCP server."""
import asyncio
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from f1_ai.config import CHAT_MODEL
from f1_ai.llm.ollama_client import chat_tools

SYSTEM = (
    "You are an F1 race engineer assistant. Answer ONLY from tool results. "
    "Start with f1_list_sessions if you don't know the session_id, and f1_list_drivers or "
    "f1_list_corners before guessing names. Quote numbers exactly as the tools return them, with units. "
    "If the tools don't contain the answer, say so."
)
MAX_TOOL_CHARS = 6000  # protect a small context window


def to_ollama_tool(tool) -> dict:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.inputSchema,
        },
    }


async def ask(question: str, model: str = CHAT_MODEL, max_steps: int = 6) -> str:
    server = StdioServerParameters(
        command=sys.executable,
        args=["-m", "f1_ai.mcp_server"],
        env=dict(os.environ),
    )
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = [to_ollama_tool(t) for t in (await session.list_tools()).tools]
            messages: list = [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": question},
            ]
            for _ in range(max_steps):
                msg = await chat_tools(model, messages, tools)
                messages.append(msg)
                if not getattr(msg, "tool_calls", None):
                    if "<tool_call>" in (getattr(msg, "content", "") or ""):  # small model text failure
                        messages.append({
                            "role": "user",
                            "content": "You printed a tool call as text. Call the tool properly instead.",
                        })
                        continue
                    return getattr(msg, "content", "") or ""
                for call in msg.tool_calls:
                    fn_name = call.function.name
                    fn_args = dict(call.function.arguments) if hasattr(call.function, "arguments") else {}
                    result = await session.call_tool(fn_name, fn_args)
                    text = "\n".join(
                        c.text for c in result.content if getattr(c, "type", "") == "text"
                    )
                    if getattr(result, "isError", False):
                        text = f"TOOL ERROR: {text}"
                    messages.append({
                        "role": "tool",
                        "content": text[:MAX_TOOL_CHARS],
                        "tool_name": fn_name,
                    })
            return "Stopped after too many tool steps; try a more specific question."


if __name__ == "__main__":
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "What sessions are available?"
    print(asyncio.run(ask(prompt)))
