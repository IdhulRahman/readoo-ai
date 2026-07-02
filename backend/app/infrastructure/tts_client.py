import os
import uuid
import logging
import asyncio

from app.core.config import settings
from app.infrastructure.database import get_db_connection

logger = logging.getLogger(__name__)


class TTSClient:
    def __init__(self):
        # Fallback defaults from configuration
        self.provider = settings.TTS_PROVIDER
        self.voice = settings.TTS_VOICE
        self.rate = settings.TTS_RATE
        self.language = "id"

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.output_dir = os.path.join(base_dir, "data", "voice", "tts")
        os.makedirs(self.output_dir, exist_ok=True)

        self._load_dynamic_config()

    def _load_dynamic_config(self):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT key, value FROM settings WHERE key IN ('tts_provider', 'tts_voice', 'tts_language')"
            )
            rows = cursor.fetchall()
            conn.close()

            cfg = {r["key"]: r["value"] for r in rows}
            self.provider = cfg.get("tts_provider", self.provider)
            self.voice = cfg.get("tts_voice", self.voice)
            self.language = cfg.get("tts_language", "id-ID")
        except Exception:
            logger.warning("Failed to load dynamic TTS settings, using defaults")

        # Initialize engines dynamically based on current provider
        if self.provider == "supertonic":
            if not hasattr(self, "tts_local"):
                try:
                    from supertonic import TTS
                    self.tts_local = TTS(auto_download=True)
                    logger.info("Supertonic TTS initialized")
                except Exception as e:
                    logger.warning("Failed to load Supertonic: %s. Falling back to edge-tts.", e)
                    self.provider = "edge-tts"

            if hasattr(self, "tts_local"):
                try:
                    # Self.voice might be a Supertonic voice like W1, W2, M1, etc.
                    self.style = self.tts_local.get_voice_style(voice_name=self.voice)
                except Exception:
                    logger.warning("Voice style %s not found in Supertonic, falling back to W1", self.voice)
                    self.style = self.tts_local.get_voice_style(voice_name="W1")

        if self.provider == "edge-tts":
            if not hasattr(self, "edge_tts_module"):
                try:
                    import edge_tts
                    self.edge_tts_module = edge_tts
                    logger.info("Edge-TTS initialized")
                except Exception as e:
                    logger.error("Failed to load edge-tts module: %s", e)

    def speak(self, text):
        if not text:
            return None

        # Reload configurations to reflect admin modifications
        self._load_dynamic_config()

        if self.provider == "supertonic":
            filename = f"tts_{uuid.uuid4().hex[:8]}.wav"
            output_path = os.path.join(self.output_dir, filename)
            try:
                # Supertonic language option (e.g. 'id' or 'en' derived from locale 'id-ID')
                lang_code = self.language.split("-")[0]
                wav, duration = self.tts_local.synthesize(text, voice_style=self.style, lang=lang_code)
                self.tts_local.save_audio(wav, output_path)
                return filename if os.path.isfile(output_path) else None
            except Exception:
                logger.exception("Supertonic TTS generation failed")
                return None
        else:
            filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
            output_path = os.path.join(self.output_dir, filename)
            try:
                asyncio.run(self._generate_edge(text, output_path))
                return filename if os.path.isfile(output_path) else None
            except RuntimeError:
                logger.error("Async event loop conflict during Edge-TTS generation")
                return None
            except Exception:
                logger.exception("Edge-TTS generation failed")
                return None

    async def _generate_edge(self, text, output_path):
        communicator = self.edge_tts_module.Communicate(
            text=text,
            voice=self.voice,
            rate=self.rate,
        )
        await communicator.save(output_path)
