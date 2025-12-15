import os
import uuid
import logging
import datetime

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from waitress import serve

from modules.rag_engine import RAGEngine
from modules.stt_whisper import STTEngine
from modules.tts_client import TTSEngine


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = Flask(__name__)
CORS(app)


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STT_DIR = os.path.join(BASE_DIR, "data", "voice", "stt")
TTS_DIR = os.path.join(BASE_DIR, "data", "voice", "tts")

os.makedirs(STT_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)


rag = RAGEngine()
stt = STTEngine(model_size="medium")
tts = TTSEngine()


@app.route("/api/chat/text", methods=["POST"])
def chat_text():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Text chat request received")
    return jsonify(rag.generate_text_response(message))


@app.route("/api/chat/avatar", methods=["POST"])
def chat_avatar():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Avatar chat request received")
    return jsonify(rag.generate_3d_response(message))


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    if "audio_data" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio_data"]

    filename = f"user_{datetime.datetime.utcnow():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:4]}.webm"
    file_path = os.path.join(STT_DIR, filename)

    audio_file.save(file_path)

    text = stt.transcribe(file_path)
    if not text:
        logger.warning("Empty transcription result")
        return jsonify({"error": "Transcription failed"}), 400

    logger.info("STT completed successfully")
    return jsonify({"text": text})


@app.route("/api/tts", methods=["POST"])
def tts_endpoint():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text is required"}), 400

    filename = tts.speak(text)
    if not filename:
        logger.error("TTS generation failed")
        return jsonify({"error": "TTS failed"}), 500

    return jsonify({"audio_url": f"/api/audio/{filename}"})


@app.route("/api/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(TTS_DIR, filename, as_attachment=False)


if __name__ == "__main__":
    logger.info("Starting production server")
    serve(app, host="0.0.0.0", port=5000, threads=16)
