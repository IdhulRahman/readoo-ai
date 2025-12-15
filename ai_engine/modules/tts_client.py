import os
import uuid
import logging
import asyncio

import edge_tts


logger = logging.getLogger(__name__)


class TTSEngine:
    def __init__(self):
        self.voice = os.getenv("TTS_VOICE", "id-ID-GadisNeural")
        self.rate = os.getenv("TTS_RATE", "+0%")

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.output_dir = os.path.join(base_dir, "data", "voice", "tts")
        os.makedirs(self.output_dir, exist_ok=True)

        logger.info("TTS initialized (voice=%s)", self.voice)

    def speak(self, text):
        if not text:
            return None

        filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
        output_path = os.path.join(self.output_dir, filename)

        try:
            asyncio.run(self._generate(text, output_path))
            return filename if os.path.isfile(output_path) else None
        except RuntimeError:
            logger.error("Async event loop conflict during TTS generation")
            return None
        except Exception:
            logger.exception("TTS generation failed")
            return None

    async def _generate(self, text, output_path):
        communicator = edge_tts.Communicate(
            text=text,
            voice=self.voice,
            rate=self.rate,
        )
        await communicator.save(output_path)
