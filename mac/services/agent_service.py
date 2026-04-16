"""Agent mode service — plan-and-execute workflows with tool calling."""

import json
import time
import uuid
import httpx
from typing import Optional, AsyncIterator
from datetime import datetime, timezone
from mac.config import settings
from mac.utils.security import generate_request_id


def _utcnow():
    return datetime.now(timezone.utc)


# ── In-memory agent sessions (production: use Redis) ─────

_agent_sessions: dict[str, dict] = {}

AVAILABLE_TOOLS = {
    "web_search": {
        "name": "web_search",
        "description": "Search the web for current information",
        "category": "search",
    },
    "wikipedia": {
        "name": "wikipedia",
        "description": "Search Wikipedia for factual information",
        "category": "search",
    },
    "python_execute": {
        "name": "python_execute",
        "description": "Execute Python code in sandbox",
        "category": "code",
    },
    "generate_document": {
        "name": "generate_document",
        "description": "Generate a document (text, markdown, report)",
        "category": "output",
    },
}


async def create_agent_session(user_id: str, query: str, mode: str = "agent") -> dict:
    """Create a new agent session with initial plan."""
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "user_id": user_id,
        "query": query,
        "mode": mode,
        "status": "planning",  # planning | executing | completed | failed
        "plan": [],
        "current_step": 0,
        "results": [],
        "artifacts": [],
        "created_at": _utcnow().isoformat(),
        "updated_at": _utcnow().isoformat(),
    }
    _agent_sessions[session_id] = session
    return session


async def generate_plan(query: str) -> list[dict]:
    """Use LLM to generate an execution plan for the query."""
    plan_prompt = f"""You are a task planner. Given the user query, break it down into 2-5 clear, actionable steps.
Each step should have: step_number, title, description, tool (one of: web_search, wikipedia, python_execute, generate_document, none).

User query: {query}

Respond in JSON array format:
[{{"step": 1, "title": "...", "description": "...", "tool": "web_search", "status": "pending"}}]"""

    try:
        from mac.services.llm_service import chat_completion
        result = await chat_completion(
            model="auto",
            messages=[{"role": "user", "content": plan_prompt}],
            temperature=0.3,
            max_tokens=1024,
        )
        content = result["choices"][0]["message"]["content"]
        # Try to parse JSON from response
        # Find JSON array in content
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            plan = json.loads(content[start:end])
            return plan
    except Exception:
        pass

    # Fallback plan
    return [
        {"step": 1, "title": "Analyze Query", "description": "Understanding the request", "tool": "none", "status": "pending"},
        {"step": 2, "title": "Research", "description": "Gathering information", "tool": "web_search", "status": "pending"},
        {"step": 3, "title": "Generate Response", "description": "Creating the final output", "tool": "generate_document", "status": "pending"},
    ]


async def execute_tool(tool_name: str, query: str, context: str = "") -> dict:
    """Execute a tool and return results."""
    if tool_name == "web_search":
        return await _tool_web_search(query)
    elif tool_name == "wikipedia":
        return await _tool_wikipedia(query)
    elif tool_name == "python_execute":
        return await _tool_python_sandbox(query, context)
    elif tool_name == "generate_document":
        return {"type": "document", "content": context, "format": "markdown"}
    return {"type": "none", "content": "No tool execution needed"}


async def _tool_web_search(query: str) -> dict:
    """Execute web search via SearXNG."""
    try:
        from mac.services.search_service import web_search
        results = await web_search(query, num_results=5)
        return {"type": "search", "results": results, "source": "searxng"}
    except Exception as e:
        return {"type": "search", "results": [], "error": str(e)}


async def _tool_wikipedia(query: str) -> dict:
    """Execute Wikipedia search."""
    try:
        from mac.services.search_service import wikipedia_search
        results = await wikipedia_search(query)
        return {"type": "wikipedia", "results": results}
    except Exception as e:
        return {"type": "wikipedia", "results": [], "error": str(e)}


async def _tool_python_sandbox(code: str, context: str = "") -> dict:
    """Execute Python code in a restricted sandbox.
    Only allows safe operations — no file I/O, no network, no imports of dangerous modules."""
    # Blocked modules/operations for safety
    BLOCKED = ["os.system", "subprocess", "shutil.rmtree", "__import__", "eval(", "exec(",
               "open(", "socket", "requests", "urllib"]
    for blocked in BLOCKED:
        if blocked in code:
            return {"type": "code", "output": "", "error": f"Blocked operation: {blocked}"}

    try:
        import io
        import contextlib
        output_buffer = io.StringIO()
        safe_globals = {"__builtins__": {
            "print": print, "len": len, "range": range, "int": int, "float": float,
            "str": str, "list": list, "dict": dict, "set": set, "tuple": tuple,
            "sum": sum, "min": min, "max": max, "sorted": sorted, "enumerate": enumerate,
            "zip": zip, "map": map, "filter": filter, "abs": abs, "round": round,
            "True": True, "False": False, "None": None,
        }}
        with contextlib.redirect_stdout(output_buffer):
            exec(code, safe_globals)
        output = output_buffer.getvalue()
        return {"type": "code", "output": output, "error": None}
    except Exception as e:
        return {"type": "code", "output": "", "error": str(e)}


async def run_agent_session(session_id: str) -> AsyncIterator[dict]:
    """Execute an agent session step by step, yielding progress events."""
    session = _agent_sessions.get(session_id)
    if not session:
        yield {"event": "error", "message": "Session not found"}
        return

    # Generate plan
    session["status"] = "planning"
    yield {"event": "status", "status": "planning", "message": "Generating execution plan..."}

    plan = await generate_plan(session["query"])
    session["plan"] = plan
    yield {"event": "plan", "plan": plan}

    # Execute each step
    session["status"] = "executing"
    accumulated_context = session["query"]

    for i, step in enumerate(plan):
        session["current_step"] = i + 1
        step["status"] = "running"
        yield {"event": "step_start", "step": i + 1, "title": step["title"], "description": step.get("description", "")}

        tool = step.get("tool", "none")
        if tool and tool != "none":
            result = await execute_tool(tool, session["query"], accumulated_context)
            session["results"].append(result)

            if result.get("type") == "search" and result.get("results"):
                search_context = "\n".join([
                    f"- {r.get('title', '')}: {r.get('content', r.get('snippet', ''))}"
                    for r in result["results"][:5]
                ]) if isinstance(result["results"], list) else str(result["results"])
                accumulated_context += f"\n\nSearch results:\n{search_context}"

            yield {"event": "tool_result", "step": i + 1, "tool": tool, "result": result}

        step["status"] = "completed"
        yield {"event": "step_complete", "step": i + 1}

    # Generate final response
    yield {"event": "status", "status": "finalizing", "message": "Generating final response..."}

    try:
        from mac.services.llm_service import chat_completion
        final = await chat_completion(
            model="auto",
            messages=[{"role": "user", "content": f"Based on this research and context, provide a comprehensive answer:\n\nOriginal question: {session['query']}\n\nContext gathered:\n{accumulated_context[:4000]}"}],
            temperature=0.7,
            max_tokens=2048,
        )
        final_content = final["choices"][0]["message"]["content"]
        session["final_response"] = final_content
    except Exception as e:
        final_content = f"Agent completed research but could not generate final summary: {str(e)}"
        session["final_response"] = final_content

    session["status"] = "completed"
    session["updated_at"] = _utcnow().isoformat()
    yield {"event": "complete", "response": final_content, "artifacts": session.get("artifacts", [])}


def get_session(session_id: str) -> Optional[dict]:
    return _agent_sessions.get(session_id)


def list_user_sessions(user_id: str) -> list[dict]:
    return [s for s in _agent_sessions.values() if s["user_id"] == user_id]
