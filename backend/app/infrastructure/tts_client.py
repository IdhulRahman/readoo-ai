import os
import uuid
import logging
import asyncio

from app.core.config import settings

logger = logging.getLogger(__name__)


class TTSClient:
    def __init__(self):
        self.provider = settings.TTS_PROVIDER
        self.voice = settings.TTS_VOICE
        self.rate = settings.TTS_RATE

        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.output_dir = os.path.join(base_dir, "data", "voice", "tts")
        os.makedirs(self.output_dir, exist_ok=True)

        if self.provider == "supertonic":
            try:
                from supertonic import TTS
                # Auto download is enabled to fetch ONNX models from Hugging Face on demand
                self.tts_local = TTS(auto_download=True)
                voice_name = settings.SUPERTONIC_VOICE
                self.style = self.tts_local.get_voice_style(voice_name=voice_name)
                logger.info("TTS initialized using Supertonic (voice=%s)", voice_name)
            except Exception as e:
                logger.warning("Failed to initialize Supertonic TTS: %s. Falling back to edge-tts.", e)
                self.provider = "edge-tts"

        if self.provider == "edge-tts":
            try:
                import edge_tts
                self.edge_tts_module = edge_tts
                logger.info("TTS initialized using Edge-TTS (voice=%s)", self.voice)
            except Exception as e:
                logger.error("Failed to load edge-tts: %s", e)

    def speak(self, text):
        if not text:
            return None

        if self.provider == "supertonic":
            filename = f"tts_{uuid.uuid4().hex[:8]}.wav"
            output_path = os.path.join(self.output_dir, filename)
            try:
                wav, duration = self.tts_local.synthesize(text, voice_style=self.style, lang="id")
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
                logger.error("Async event loop conflict during TTS generation")
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
