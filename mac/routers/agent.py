"""Agent mode router — plan-and-execute workflows with streaming progress."""

import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from mac.database import get_db
from mac.middleware.auth_middleware import get_current_user
from mac.middleware.rate_limit import check_rate_limit
from mac.models.user import User
from mac.services import agent_service, notification_service

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentRequest:
    def __init__(self, query: str, mode: str = "agent"):
        self.query = query
        self.mode = mode


@router.post("/run")
async def run_agent(
    body: dict,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start an agent execution session. Returns SSE stream with progress events."""
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    session = await agent_service.create_agent_session(user.id, query)

    await notification_service.log_audit(
        db, action="agent.run", resource_type="agent_session",
        resource_id=session["id"], actor_id=user.id, actor_role=user.role,
        details=f"Query: {query[:200]}",
    )

    async def event_stream():
        async for event in agent_service.run_agent_session(session["id"]):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/sessions")
async def list_sessions(
    user: User = Depends(get_current_user),
):
    """List current user's agent sessions."""
    sessions = agent_service.list_user_sessions(user.id)
    return {
        "sessions": [
            {
                "id": s["id"],
                "query": s["query"][:100],
                "status": s["status"],
                "steps": len(s.get("plan", [])),
                "created_at": s["created_at"],
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user: User = Depends(get_current_user),
):
    """Get agent session details."""
    session = agent_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return session


@router.get("/tools")
async def list_tools():
    """List available agent tools."""
    return {"tools": list(agent_service.AVAILABLE_TOOLS.values())}
