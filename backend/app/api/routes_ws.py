"""WebSocket endpoints for health ping and real-time streaming AI chat."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import Settings
from app.database.session import DatabaseManager
from app.models.entities import Conversation, Message
from app.services import ai_service

router = APIRouter(prefix="/api/v1/ws", tags=["websocket"])


@router.websocket("/ping")
async def websocket_ping(websocket: WebSocket) -> None:
    """Verify real-time WebSocket connectivity for streaming readiness."""
    await websocket.accept()
    await websocket.send_json(
        {
            "type": "connected",
            "service": "Vardhan AI Studio",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    try:
        while True:
            payload = await websocket.receive_json()
            await websocket.send_json(
                {
                    "type": "pong",
                    "echo": payload,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
    except WebSocketDisconnect:
        return


@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    """Stream AI chat responses token-by-token over WebSocket and persist history to SQLite."""
    await websocket.accept()
    settings: Settings = websocket.app.state.settings
    db_manager: DatabaseManager = websocket.app.state.db_manager

    try:
        while True:
            payload = await websocket.receive_json()
            user_text = str(payload.get("message", "")).strip()
            if not user_text:
                await websocket.send_json({"type": "error", "detail": "Empty message."})
                continue

            conversation_id = payload.get("conversation_id")
            project_id = payload.get("project_id")
            model_override = payload.get("model_name")
            attached_files = payload.get("attached_files") or []

            db = db_manager.session_factory()
            try:
                cfg = ai_service.get_model_config(db, settings)
                selected_model = model_override or cfg["default_model"]

                conv = db.get(Conversation, conversation_id) if conversation_id else None
                if conv is None:
                    conv = Conversation(
                        title=user_text[:60],
                        project_id=project_id,
                        model_name=selected_model,
                    )
                    db.add(conv)
                    db.commit()
                    db.refresh(conv)

                db.add(Message(conversation_id=conv.id, role="user", content=user_text))
                db.commit()

                history = db.scalars(
                    select(Message)
                    .where(Message.conversation_id == conv.id)
                    .order_by(Message.id.asc())
                ).all()[-14:]

                llm_messages = [{"role": m.role, "content": m.content} for m in history]
                if attached_files:
                    untrusted = ai_service.format_untrusted_context(attached_files)
                    llm_messages[-1]["content"] = (
                        f"{llm_messages[-1]['content']}\n\nAttached project files:\n{untrusted}"
                    )

                await websocket.send_json(
                    {
                        "type": "start",
                        "conversation_id": conv.id,
                        "model": selected_model,
                    }
                )

                chunks: list[str] = []
                try:
                    async for token in ai_service.stream_chat_completion(
                        messages=llm_messages,
                        config=cfg,
                        settings=settings,
                        model_override=selected_model,
                    ):
                        chunks.append(token)
                        await websocket.send_json({"type": "token", "token": token})

                    full_reply = "".join(chunks)
                    assistant_msg = Message(
                        conversation_id=conv.id,
                        role="assistant",
                        content=full_reply,
                    )
                    db.add(assistant_msg)
                    db.commit()
                    db.refresh(assistant_msg)

                    await websocket.send_json(
                        {
                            "type": "done",
                            "conversation_id": conv.id,
                            "message_id": assistant_msg.id,
                            "content": full_reply,
                        }
                    )
                except ai_service.AIProviderError as exc:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "conversation_id": conv.id,
                            "detail": str(exc),
                        }
                    )
            finally:
                db.close()
    except WebSocketDisconnect:
        return
