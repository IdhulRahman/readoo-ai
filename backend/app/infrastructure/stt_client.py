import os
import logging
import warnings

import requests
import torch
import whisper

from app.core.config import settings

logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


class STTClient:
    def __init__(self):
        self.groq_api_key = settings.GROQ_STT_API_KEY or settings.GROQ_API_KEY
        if self.groq_api_key:
            self.model = None
            self.device = "cloud"
            logger.info("STT initialized using Groq Cloud API")
        else:
            model_size = settings.WHISPER_MODEL
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model = self._load_model(model_size)
            logger.info(
                "STT initialized (model=%s, device=%s)",
                model_size,
                self.device,
            )

    def transcribe(self, audio_path):
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            logger.warning("Audio file not found: %s", audio_path)
            return ""

        if self.groq_api_key:
            return self._transcribe_groq(audio_path)

        if self.model is None:
            logger.error("STT model is not available")
            return ""

        try:
            result = self.model.transcribe(
                audio_path,
                language="id",
                fp16=self.device == "cuda",
                condition_on_previous_text=False,
                no_speech_threshold=0.6,
                temperature=0.0,
            )

            return result.get("text", "").strip()

        except Exception:
            logger.exception("STT transcription failed")
            return ""

    def _transcribe_groq(self, audio_path):
        try:
            with open(audio_path, "rb") as f:
                res = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={
                        "Authorization": f"Bearer {self.groq_api_key}"
                    },
                    files={
                        "file": (os.path.basename(audio_path), f, "audio/webm")
                    },
                    data={
                        "model": "whisper-large-v3",
                        "language": "id"
                    },
                    timeout=15
                )
            if res.status_code == 200:
                return res.json().get("text", "").strip()
            else:
                logger.error("Groq STT failed with status %d: %s", res.status_code, res.text)
                return ""
        except Exception:
            logger.exception("Groq STT request failed")
            return ""

    def _load_model(self, model_size):
        try:
            return whisper.load_model(model_size, device=self.device)
        except Exception:
            logger.exception("Failed to load Whisper model")
            return None
