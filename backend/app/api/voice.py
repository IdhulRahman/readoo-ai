import os
import uuid
import datetime
import logging
from flask import request, jsonify, send_from_directory

from app.api import api_bp
from app.api.middleware import require_auth, require_rate_limit
from app.services.speech_service import SpeechService
from app.core.validators import TTSRequest

logger = logging.getLogger(__name__)

speech_service = SpeechService()

# Setup paths
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STT_DIR = os.path.join(base_dir, "data", "voice", "stt")
TTS_DIR = os.path.join(base_dir, "data", "voice", "tts")

os.makedirs(STT_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)


@api_bp.route("/transcribe", methods=["POST"])
@require_auth()
@require_rate_limit(limit=10, period=60)
def transcribe():
    if "audio_data" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio_data"]
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
@require_auth()
def tts_endpoint():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = TTSRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    filename = speech_service.speak(data.text)
    if not filename:
        logger.error("TTS generation failed")
        return jsonify({"error": "TTS failed"}), 500

    return jsonify({"audio_url": f"/api/audio/{filename}"})


@api_bp.route("/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(TTS_DIR, filename, as_attachment=False)