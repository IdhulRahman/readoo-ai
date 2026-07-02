import logging

from app.infrastructure.stt_client import STTClient
from app.infrastructure.tts_client import TTSClient

logger = logging.getLogger(__name__)


class SpeechService:
    def __init__(self):
        self.stt_client = STTClient()
        self.tts_client = TTSClient()

    def transcribe(self, audio_path):
        logger.info("Transcribing audio file: %s", audio_path)
        return self.stt_client.transcribe(audio_path)

    def speak(self, text):
        logger.info(
            "Synthesizing speech for: %s",
            text[:50] + "..." if len(text) > 50 else text,
        )
        return self.tts_client.speak(text)
