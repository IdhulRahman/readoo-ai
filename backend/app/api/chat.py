import json
import logging
from flask import request, jsonify, g

from app.api import api_bp
from app.api.middleware import require_auth, require_rate_limit
from app.services.chat_service import ChatService
from app.core.validators import ChatRequest

logger = logging.getLogger(__name__)

chat_service = ChatService()


@api_bp.route("/chat/text", methods=["POST"])
@require_auth()
@require_rate_limit(limit=10, period=60)
def chat_text():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = ChatRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    logger.info("Text chat request received from User ID %d", g.user_id)
    return jsonify(chat_service.generate_text_response(data.message, payload.get("session_id"), g.user_id))


@api_bp.route("/chat/stream", methods=["POST"])
@require_auth()
@require_rate_limit(limit=10, period=60)
def chat_stream():
    """Streaming chat endpoint using Server-Sent Events."""
    from flask import Response, stream_with_context
    
    payload = request.get_json(silent=True) or {}
    
    try:
        data = ChatRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    logger.info("Streaming chat request received from User ID %d", g.user_id)
    
    def generate():
        for chunk in chat_service.generate_streaming_response(data.message, payload.get("session_id"), g.user_id):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"
    
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@api_bp.route("/chat/avatar", methods=["POST"])
@require_auth()
@require_rate_limit(limit=10, period=60)
def chat_avatar():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = ChatRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    logger.info("Avatar chat request received from User ID %d", g.user_id)
    return jsonify(chat_service.generate_3d_response(data.message, payload.get("session_id"), g.user_id))


@api_bp.route("/chat/sessions", methods=["GET"])
@require_auth()
def get_sessions():
    """Get all chat sessions for the current user."""
    sessions = chat_service.get_user_sessions(g.user_id)
    return jsonify(sessions)


@api_bp.route("/chat/sessions/<session_id>/messages", methods=["GET"])
@require_auth()
def get_session_messages(session_id):
    """Get all messages in a session."""
    messages = chat_service.get_session_messages(session_id, g.user_id)
    return jsonify(messages)


@api_bp.route("/chat/sessions/<session_id>", methods=["DELETE"])
@require_auth()
def delete_session(session_id):
    """Delete a chat session and its messages."""
    chat_service.delete_session(session_id, g.user_id)
    return jsonify({"success": True})


@api_bp.route("/chat/sessions/<session_id>/title", methods=["POST"])
@require_auth()
def update_session_title(session_id):
    """Update session title."""
    payload = request.get_json(silent=True) or {}
    title = payload.get("title", "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    
    from app.repositories.chat_repository import ChatRepository
    from datetime import datetime
    
    ChatRepository.update_chat_session_title(session_id, g.user_id, title, datetime.now().isoformat())
    
    return jsonify({"success": True})