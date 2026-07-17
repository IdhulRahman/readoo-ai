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
        # NOTE: API key untuk cloud STT (Groq) sekarang diambil SECARA DINAMIS
        # dari database (Admin dashboard) setiap kali transcribe() dipanggil,
        # BUKAN sekali di sini pas startup. Ini supaya kalau Admin ganti
        # provider/API key lewat dashboard, fitur voice otomatis ikut berubah
        # tanpa perlu restart server.
        model_size = settings.WHISPER_MODEL
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self._load_model(model_size)
        logger.info(
            "STT initialized (local fallback model=%s, device=%s). "
            "Cloud STT (Groq) key will be resolved dynamically per request.",
            model_size,
            self.device,
        )

    def _get_dynamic_groq_key(self):
        """
        Ambil API key Groq secara dinamis dari Admin dashboard (database).
        STT cloud (Groq Whisper) hanya bisa dipakai kalau provider yang
        dipilih Admin saat ini adalah 'groq' - karena endpoint transkripsi
        suara ini spesifik milik Groq.
        """
        try:
            from app.repositories import SettingsRepository
            from app.core.security import decrypt_api_key

            llm_cfg = SettingsRepository.get_settings_by_keys(
                ["llm_provider", "llm_api_key"]
            )
            provider = (llm_cfg.get("llm_provider") or "").lower()

            if provider != "groq":
                # Provider yang aktif di Admin bukan Groq -> tidak ada key
                # Groq yang valid untuk dipakai STT cloud.
                return None

            encrypted_key = llm_cfg.get("llm_api_key", "")
            if not encrypted_key:
                return None

            return decrypt_api_key(encrypted_key)
        except Exception:
            logger.exception("Gagal mengambil API key Groq dari Admin settings")
            return None

    def transcribe(self, audio_path):
        audio_path = os.path.abspath(audio_path)
        if not os.path.isfile(audio_path):
            logger.warning("Audio file not found: %s", audio_path)
            return ""

        groq_api_key = self._get_dynamic_groq_key()

        if groq_api_key:
            text = self._transcribe_groq(audio_path, groq_api_key)
            if text:
                return text
            # Kalau cloud gagal (network error, key invalid, dll),
            # turun ke local Whisper sebagai fallback.
            logger.warning("Groq STT gagal, fallback ke local Whisper model")

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

    def _transcribe_groq(self, audio_path, api_key):
        try:
            with open(audio_path, "rb") as f:
                res = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={
                        "Authorization": f"Bearer {api_key}"
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