import os
import uuid
import datetime
import logging
from flask import Blueprint, request, jsonify, send_from_directory

from app.services.chat_service import ChatService
from app.services.speech_service import SpeechService

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)

# Initialize services
chat_service = ChatService()
speech_service = SpeechService()

# Setup paths
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STT_DIR = os.path.join(base_dir, "data", "voice", "stt")
TTS_DIR = os.path.join(base_dir, "data", "voice", "tts")

os.makedirs(STT_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)


@api_bp.route("/chat/text", methods=["POST"])
def chat_text():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Text chat request received")
    return jsonify(chat_service.generate_text_response(message))


@api_bp.route("/chat/avatar", methods=["POST"])
def chat_avatar():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Avatar chat request received")
    return jsonify(chat_service.generate_3d_response(message))


@api_bp.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio_data" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio_data"]

    # Utcnow is deprecated in python 3.12 but we keep format consistency
    filename = f"user_{datetime.datetime.utcnow():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:4]}.webm"
    file_path = os.path.join(STT_DIR, filename)

    audio_file.save(file_path)

    text = speech_service.transcribe(file_path)
    if not text:
        logger.warning("Empty transcription result")
        return jsonify({"error": "Transcription failed"}), 400

    logger.info("STT completed successfully")
    return jsonify({"text": text})


@api_bp.route("/tts", methods=["POST"])
def tts_endpoint():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text is required"}), 400

    filename = speech_service.speak(text)
    if not filename:
        logger.error("TTS generation failed")
        return jsonify({"error": "TTS failed"}), 500

    return jsonify({"audio_url": f"/api/audio/{filename}"})


@api_bp.route("/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(TTS_DIR, filename, as_attachment=False)


@api_bp.route("/admin/books", methods=["GET"])
def admin_get_books():
    try:
        books = chat_service.vector_store.get_all_books()
        return jsonify(books)
    except Exception as e:
        logger.exception("Failed to retrieve books")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/admin/books", methods=["POST"])
def admin_add_book():
    try:
        book_data = request.get_json(silent=True) or {}
        book_id = chat_service.vector_store.add_book(book_data)
        if book_id:
            return jsonify({"success": True, "id": book_id}), 201
        return jsonify({"error": "Failed to add book"}), 500
    except Exception as e:
        logger.exception("Failed to add book")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/admin/books/<book_id>", methods=["PUT"])
def admin_update_book(book_id):
    try:
        book_data = request.get_json(silent=True) or {}
        success = chat_service.vector_store.update_book(book_id, book_data)
        if success:
            return jsonify({"success": True})
        return jsonify({"error": "Failed to update book"}), 500
    except Exception as e:
        logger.exception("Failed to update book")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/admin/books/<book_id>", methods=["DELETE"])
def admin_delete_book(book_id):
    try:
        success = chat_service.vector_store.delete_book(book_id)
        if success:
            return jsonify({"success": True})
        return jsonify({"error": "Failed to delete book"}), 500
    except Exception as e:
        logger.exception("Failed to delete book")
        return jsonify({"error": str(e)}), 500

