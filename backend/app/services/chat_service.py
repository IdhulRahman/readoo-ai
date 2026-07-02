import os
import logging
import requests
import numpy as np

from app.core.config import settings
from app.infrastructure.vector_store import VectorStore

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self):
        self.vector_store = VectorStore()
        self.chat_history = []
        self.max_history_turns = 2
        self._init_llm_provider()

    def _init_llm_provider(self):
        self.ollama_url = settings.OLLAMA_BASE_URL

        if self._ollama_available():
            self.active_provider = "ollama"
        else:
            self.active_provider = settings.LLM_PROVIDER

        logger.info("Active LLM provider: %s", self.active_provider)

    def _ollama_available(self):
        try:
            requests.get(self.ollama_url, timeout=1)
            return True
        except requests.RequestException:
            return False

    def generate_text_response(self, user_msg):
        logger.debug("[TEXT MODE] %s", user_msg)

        if self._is_greeting(user_msg):
            reply = "Halo! Ada buku yang ingin kamu cari hari ini?"
            self._update_history(user_msg, reply)
            return {"reply": reply, "books": []}

        retrieved = self.vector_store.search(user_msg, top_k=20)
        reranked = self.vector_store.rerank(user_msg, retrieved, top_k=5)
        books = self._deduplicate(reranked, limit=5)

        if books:
            context_str = ""
            for i, b in enumerate(books, 1):
                context_str += (
                    f"Buku #{i}\n"
                    f"Judul: {b['judul']}\n"
                    f"Penulis: {b['pengarang']} ({b['tahun']})\n"
                    f"Rak: {b['rak']}\n\n"
                )
        else:
            context_str = "Tidak ada buku yang relevan ditemukan."

        prompt_template = settings.PROMPT_TEXT_MODE
        system_prompt = prompt_template.format(
            context_str=context_str,
            user_msg=user_msg,
        )

        reply = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, reply)

        return {
            "reply": reply,
            "books": self._format_books(books),
        }

    def generate_3d_response(self, user_msg):
        if self._is_greeting(user_msg):
            system_prompt = settings.PROMPT_3D_GREETING
            speech = self._call_llm(system_prompt, user_msg)
            self._update_history(user_msg, speech)
            return {"speech_text": speech, "books": []}

        retrieved = self.vector_store.search(user_msg, top_k=20)
        books = self.vector_store.rerank(user_msg, retrieved, top_k=5)

        if not books:
            speech = "Maaf, buku dengan topik tersebut belum tersedia."
            self._update_history(user_msg, speech)
            return {"speech_text": speech, "books": []}

        titles = ", ".join(b["judul"] for b in books[:3])
        prompt_template = settings.PROMPT_3D_SEARCH
        system_prompt = prompt_template.format(
            user_msg=user_msg,
            context_str=titles,
        )

        speech = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, speech)

        return {
            "speech_text": speech,
            "books": self._format_books(books),
        }

    def _is_greeting(self, text):
        system_prompt = settings.PROMPT_CLASSIFIER
        if "{text}" in system_prompt:
            system_prompt = system_prompt.format(text=text)
            response = self._call_llm(system_prompt, text)
        else:
            response = self._call_llm(system_prompt, text)
        return response.strip().upper() == "YES"

    def _call_llm(self, system_prompt, user_msg):
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.chat_history)
        messages.append({"role": "user", "content": user_msg})

        if self.active_provider == "ollama":
            return self._call_ollama(messages)
        if self.active_provider == "openrouter":
            return self._call_openrouter(messages)

        return self._call_groq(messages)

    def _call_ollama(self, messages):
        try:
            res = requests.post(
                f"{self.ollama_url}/api/chat",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "stream": False,
                    "messages": messages,
                },
                timeout=30,
            )
            return res.json()["message"]["content"]
        except Exception:
            logger.error("Ollama failed")
            return "Sistem sedang tidak tersedia."

    def _call_groq(self, messages):
        try:
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}"
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": messages,
                },
                timeout=30,
            )
            return res.json()["choices"][0]["message"]["content"]
        except Exception:
            logger.error("Groq failed")
            return "Sistem sedang tidak tersedia."

    def _call_openrouter(self, messages):
        try:
            res = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"
                },
                json={
                    "model": settings.OPENROUTER_MODEL,
                    "messages": messages,
                },
                timeout=30,
            )
            return res.json()["choices"][0]["message"]["content"]
        except Exception:
            logger.error("OpenRouter failed")
            return "Sistem sedang tidak tersedia."

    def _update_history(self, user_msg, assistant_msg):
        self.chat_history.extend(
            [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": assistant_msg},
            ]
        )
        self.chat_history = self.chat_history[
            -self.max_history_turns * 2 :
        ]

    def _deduplicate(self, books, limit=5):
        seen = set()
        result = []

        for b in books:
            key = b["judul"].lower().strip()
            if key in seen:
                continue
            seen.add(key)
            result.append(b)
            if len(result) >= limit:
                break

        return result

    def _format_books(self, books):
        return [
            {
                "title": b["judul"],
                "author": b["pengarang"],
                "year": b["tahun"],
                "rak": b["rak"],
                "cover_image": b.get("image_base64", ""),
                "cover_color": int(np.random.randint(0, 360)),
            }
            for b in books
        ]
