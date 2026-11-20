"""AI Chat Assistant endpoints: conversation history, file context, and AI code actions."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_app_settings, get_db
from app.core.config import Settings
from app.models.entities import Conversation, Message
from app.security.auth import verify_api_key
from app.services import ai_service

router = APIRouter(
    prefix="/api/v1/chat",
    tags=["chat"],
    dependencies=[Depends(verify_api_key)],
)


class ConversationCreate(BaseModel):
    title: str = Field(default="New Coding Chat", min_length=1, max_length=200)
    project_id: Optional[int] = None
    mode: str = Field(default="chat")
    model_name: Optional[str] = None


class AttachedFile(BaseModel):
    path: str
    content: str = Field(..., max_length=60000)


class ChatSendRequest(BaseModel):
    conversation_id: Optional[int] = None
    project_id: Optional[int] = None
    message: str = Field(..., min_length=1, max_length=16000)
    model_name: Optional[str] = None
    attached_files: list[AttachedFile] = Field(default_factory=list)


class CodeActionRequest(BaseModel):
    action: str = Field(..., pattern="^(explain|refactor|generate|sql|commit_message)$")
    code: str = Field(..., max_length=30000)
    language: str = Field(default="plaintext")
    instruction: str = Field(default="", max_length=4000)
    model_name: Optional[str] = None


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(Conversation).order_by(desc(Conversation.updated_at))).all()
    return [
        {
            "id": c.id,
            "project_id": c.project_id,
            "title": c.title,
            "mode": c.mode,
            "model_name": c.model_name,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in rows
    ]


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    cfg = ai_service.get_model_config(db, settings)
    conv = Conversation(
        title=payload.title.strip(),
        project_id=payload.project_id,
        mode=payload.mode,
        model_name=payload.model_name or cfg["default_model"],
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {
        "id": conv.id,
        "project_id": conv.project_id,
        "title": conv.title,
        "mode": conv.mode,
        "model_name": conv.model_name,
        "created_at": conv.created_at.isoformat(),
        "updated_at": conv.updated_at.isoformat(),
    }


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int, db: Session = Depends(get_db)) -> list[dict]:
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    rows = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id.asc())
    ).all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)) -> Response:
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    db.delete(conv)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/send")
async def send_chat_message(
    payload: ChatSendRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    cfg = ai_service.get_model_config(db, settings)
    selected_model = payload.model_name or cfg["default_model"]

    if payload.conversation_id is not None:
        conv = db.get(Conversation, payload.conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found.")
    else:
        conv = Conversation(
            title=payload.message.strip()[:60],
            project_id=payload.project_id,
            model_name=selected_model,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

    user_msg = Message(conversation_id=conv.id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()

    history = db.scalars(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.id.asc())
    ).all()[-14:]

    llm_messages = [{"role": m.role, "content": m.content} for m in history]
    if payload.attached_files:
        untrusted = ai_service.format_untrusted_context(
            [f.model_dump() for f in payload.attached_files]
        )
        llm_messages[-1]["content"] = f"{llm_messages[-1]['content']}\n\nAttached project files:\n{untrusted}"

    try:
        reply_text = await ai_service.generate_complete_response(
            messages=llm_messages,
            config=cfg,
            settings=settings,
            model_override=selected_model,
        )
    except ai_service.AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    assistant_msg = Message(conversation_id=conv.id, role="assistant", content=reply_text)
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return {
        "conversation_id": conv.id,
        "model": selected_model,
        "reply": {
            "id": assistant_msg.id,
            "role": assistant_msg.role,
            "content": assistant_msg.content,
            "created_at": assistant_msg.created_at.isoformat(),
        },
    }


@router.post("/code-action")
async def run_code_action(
    payload: CodeActionRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    cfg = ai_service.get_model_config(db, settings)
    selected_model = payload.model_name or cfg["default_model"]

    prompts = {
        "explain": f"Explain the following {payload.language} code clearly, step by step:\n",
        "refactor": f"Refactor the following {payload.language} code for readability, safety, and maintainability. Return the improved code and explain key changes:\n",
        "generate": f"Generate clean, production-quality {payload.language} code for this request: {payload.instruction}\nExisting context:\n",
        "sql": f"Generate or explain SQL for this request ({payload.instruction}):\n",
        "commit_message": "Write a concise conventional Git commit message (subject + short bullet body) for this diff:\n",
    }
    untrusted_block = ai_service.format_untrusted_context(
        [{"path": f"selection.{payload.language}", "content": payload.code}]
    )
    full_prompt = f"{prompts[payload.action]}\n{untrusted_block}"

    try:
        output = await ai_service.generate_complete_response(
            messages=[{"role": "user", "content": full_prompt}],
            config=cfg,
            settings=settings,
            model_override=selected_model,
        )
    except ai_service.AIProviderError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {"action": payload.action, "model": selected_model, "result": output}
