import os
import logging
import warnings

import torch
import whisper


logger = logging.getLogger(__name__)
warnings.filterwarnings("ignore")


class STTEngine:
    def __init__(self, model_size="medium"):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self._load_model(model_size)

        logger.info(
            "STT initialized (model=%s, device=%s)",
            model_size,
            self.device,
        )

    def transcribe(self, audio_path):
        if self.model is None:
            logger.error("STT model is not available")
            return ""

        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            logger.warning("Audio file not found: %s", audio_path)
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

    def _load_model(self, model_size):
        try:
            return whisper.load_model(model_size, device=self.device)
        except Exception:
            logger.exception("Failed to load Whisper model")
            return None
