import re
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Optional, Generator

import litellm  # FIX: dipindah ke top-level supaya cuma di-import SEKALI pas server startup,
                 # bukan setiap kali fungsi _call_llm/_call_llm_stream dipanggil.
                 # Sebelumnya ini nyebabin gap ~14 detik di request PERTAMA saja,
                 # karena litellm meng-import banyak provider SDK sekaligus di baliknya.
litellm.telemetry = False

from app.core.config import settings
from app.repositories import ChatRepository, SettingsRepository, CollectionRepository
from app.infrastructure.vector_store import VectorStore

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self):
        self.vector_store = VectorStore()

    def _get_settings(self) -> dict:
        """Get dynamic settings from database."""
        return SettingsRepository.get_settings_by_keys(["assistant_name", "greeting_message", "assistant_job"])

    def _get_llm_settings(self) -> dict:
        """Get LLM settings from database."""
        return SettingsRepository.get_settings_by_keys(["llm_provider", "llm_model", "llm_api_key", "llm_max_tokens", "llm_temperature"])

    def _get_chat_history(self, session_id: str, user_id: int, max_turns: int = 2) -> list[dict]:
        """Get chat history from database."""
        rows = ChatRepository.get_chat_messages(session_id, user_id)
        # Only return last N turns
        history = [{"role": r["role"], "content": r["content"]} for r in rows]
        return history[-(max_turns * 2):]

    def _save_chat_message(self, user_id: int, role: str, content: str, session_id: str) -> None:
        """Save chat message to database."""
        now = datetime.now().isoformat()
        ChatRepository.create_chat_message(user_id, role, content, session_id, now)

    def _create_or_get_session(self, user_id: int, session_id: Optional[str] = None) -> str:
        """Create a new session or return existing one."""
        now = datetime.now().isoformat()

        if session_id:
            row = ChatRepository.get_chat_session(session_id, user_id)
            if row:
                ChatRepository.update_chat_session_timestamp(session_id, now)
                return session_id

        # Create new session
        new_id = uuid.uuid4().hex[:12]
        ChatRepository.create_chat_session(new_id, user_id, "Chat Baru", now, now)
        return new_id

    def _search_and_rerank(self, query: str) -> tuple[list[dict], list[str]]:
        """Search vector store, rerank results, and filter out irrelevant matches."""
        FINAL_TOP_K = 10

        retrieved = self.vector_store.search(query, top_k=20)

        # FIX (bug: "item muncul walau harusnya kosong"):
        # Rerank SEMUA kandidat, bukan langsung dipotong ke FINAL_TOP_K di
        # sini, supaya threshold relevansi di bawah bisa dicek terhadap
        # seluruh himpunan kandidat, bukan cuma yang kebetulan lolos duluan
        # gara-gara boost popularitas di VectorStore.rerank().
        reranked = self.vector_store.rerank(query, retrieved)

        # Filter 2 lapis: (1) buang query yang secara keseluruhan nggak nyambung
        # sama sekali ke dataset (skor terbaiknya sendiri rendah), (2) di antara
        # yang lolos, buang item yang jauh lebih lemah dibanding skor terbaik
        # query itu sendiri (threshold relatif, bukan angka absolut tetap).
        # Menggunakan rerank_score_raw (skor semantik murni, tanpa boost
        # popularitas) supaya buku populer tidak "memaksa" lolos threshold
        # walau topiknya tidak relevan dengan query.
        if reranked and "rerank_score_raw" in reranked[0]:
            top_score = max(d["rerank_score_raw"] for d in reranked)
            if top_score < settings.RERANK_THRESHOLD:
                reranked = []
            else:
                relative_cutoff = top_score * 0.15
                reranked = [d for d in reranked if d["rerank_score_raw"] >= relative_cutoff]

        # Baru potong ke jumlah final yang ditampilkan ke user, SETELAH
        # difilter relevansinya -- bukan sebelumnya.
        reranked = reranked[:FINAL_TOP_K]

        # Get display columns
        col_row = CollectionRepository.get_collection(self.vector_store.active_collection_id)
        display_cols = json.loads(col_row["display_cols"]) if col_row else []
        return reranked, display_cols

    def _build_context(self, documents: list[dict], display_cols: list[str]) -> str:
        """Build context string from documents."""
        if not documents:
            return "Tidak ada dokumen atau data relevan ditemukan."

        context_str = ""
        for idx, doc in enumerate(documents, 1):
            context_str += f"Item #{idx}:\n"
            for col in display_cols:
                if col in doc:
                    context_str += f"{col.capitalize()}: {doc[col]}\n"
            context_str += "\n"
        return context_str

    def _is_greeting(self, text: str) -> bool:
        greetings = [
            "halo", "hai", "selamat pagi", "selamat siang", "selamat sore",
            "selamat malam", "hi", "hello", "pagi", "siang", "sore", "malam",
            "assalamualaikum", "hei"
        ]
        cleaned = re.sub(r"[^\w\s]", "", text.lower().strip())
        words = cleaned.split()
        return any(w in greetings for w in words)

    def _completion_with_retry(self, max_retries: int = 3, base_delay: float = 1.5, **kwargs):
        """
        Wrapper litellm.completion() dengan retry otomatis kalau kena rate limit
        dari provider (mis. Groq TPM limit). Pakai exponential backoff:
        percobaan ke-1 tunggu ~1.5s, ke-2 ~3s, ke-3 ~6s, sebelum akhirnya raise.
        """
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                return litellm.completion(**kwargs)
            except litellm.RateLimitError as e:
                last_error = e
                if attempt == max_retries:
                    break
                wait_time = base_delay * (2 ** attempt)
                logger.warning(
                    "Rate limit dari LLM provider (percobaan %d/%d), tunggu %.1fs sebelum retry: %s",
                    attempt + 1, max_retries, wait_time, e
                )
                time.sleep(wait_time)
        raise last_error

    def _call_llm(self, system_prompt: str, messages: list[dict]) -> str:
        """Call LLM with system prompt and messages."""
        llm_cfg = self._get_llm_settings()
        provider = llm_cfg.get("llm_provider", "groq").lower()
        model_name = llm_cfg.get("llm_model", "llama-3.1-8b-instant")
        encrypted_key = llm_cfg.get("llm_api_key", "")

        try:
            max_tokens = int(llm_cfg.get("llm_max_tokens", 200))
        except ValueError:
            max_tokens = 200

        try:
            temperature = float(llm_cfg.get("llm_temperature", 0.7))
        except ValueError:
            temperature = 0.7

        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(encrypted_key)

        model_string = f"{provider}/{model_name}" if "/" not in model_name else model_name

        try:
            # NOTE: litellm sudah di-import di top-level file ini (lihat atas).
            full_messages = [{"role": "system", "content": system_prompt}] + messages

            if provider == "ollama":
                res = self._completion_with_retry(
                    model=model_string,
                    messages=full_messages,
                    api_base=settings.OLLAMA_BASE_URL,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30
                )
            else:
                res = self._completion_with_retry(
                    model=model_string,
                    messages=full_messages,
                    api_key=api_key if api_key else None,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30
                )
            return res.choices[0].message.content
        except Exception as e:
            logger.exception("LiteLLM completion call failed")
            return f"Error: Gagal memanggil model AI ({e}). Silakan periksa konfigurasi LLM Anda di dashboard Admin."

    def _call_llm_stream(self, system_prompt: str, messages: list[dict]) -> Generator[str, None, None]:
        """Call LLM with streaming response."""
        llm_cfg = self._get_llm_settings()
        provider = llm_cfg.get("llm_provider", "groq").lower()
        model_name = llm_cfg.get("llm_model", "llama-3.1-8b-instant")
        encrypted_key = llm_cfg.get("llm_api_key", "")

        try:
            max_tokens = int(llm_cfg.get("llm_max_tokens", 200))
        except ValueError:
            max_tokens = 200

        try:
            temperature = float(llm_cfg.get("llm_temperature", 0.7))
        except ValueError:
            temperature = 0.7

        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(encrypted_key)

        model_string = f"{provider}/{model_name}" if "/" not in model_name else model_name

        try:
            # NOTE: litellm sudah di-import di top-level file ini (lihat atas).
            full_messages = [{"role": "system", "content": system_prompt}] + messages

            if provider == "ollama":
                response = self._completion_with_retry(
                    model=model_string,
                    messages=full_messages,
                    api_base=settings.OLLAMA_BASE_URL,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30,
                    stream=True
                )
            else:
                response = self._completion_with_retry(
                    model=model_string,
                    messages=full_messages,
                    api_key=api_key if api_key else None,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30,
                    stream=True
                )

            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.exception("LiteLLM streaming call failed")
            yield f"Error: Gagal memanggil model AI ({e})."

    def _format_items(self, documents: list[dict], display_cols: list[str]) -> list[dict]:
        """Format documents for UI display."""
        import numpy as np
        formatted = []
        for doc in documents:
            item_info = {}
            for col in display_cols:
                item_info[col] = doc.get(col, "")

            item_info["id"] = doc.get("id")
            item_info["cover_image"] = doc.get("cover_image", doc.get("image_base64", ""))
            item_info["cover_color"] = int(np.random.randint(0, 360))
            formatted.append(item_info)
        return formatted

    def generate_text_response(self, user_msg: str, session_id: Optional[str] = None, user_id: int = 1) -> dict:
        """Generate text response with RAG context."""
        cfg = self._get_settings()
        assistant_name = cfg.get("assistant_name", "Aiko")
        greeting_message = cfg.get("greeting_message", "Halo! Ada yang bisa saya bantu?")
        assistant_job = cfg.get("assistant_job", "Customer Service Toko Elektronik")

        # Create/get session
        session_id = self._create_or_get_session(user_id, session_id)

        if self._is_greeting(user_msg):
            self._save_chat_message(user_id, "user", user_msg, session_id)
            self._save_chat_message(user_id, "assistant", greeting_message, session_id)
            return {"reply": greeting_message, "items": [], "session_id": session_id}

        # Search and rerank
        reranked, display_cols = self._search_and_rerank(user_msg)
        context_str = self._build_context(reranked, display_cols)

        # Build system prompt
        system_prompt = (
            f"Kamu adalah {assistant_name}, seorang {assistant_job} yang ramah dan profesional.\n"
            "Jawablah pertanyaan pengguna dengan jujur, ringkas, dan jelas berdasarkan konteks berikut.\n"
            "Jika informasi tidak terdapat pada konteks, jawablah dengan sopan bahwa kamu tidak tahu, dan jangan membuat-buat informasi.\n\n"
            f"Konteks:\n{context_str}\n\n"
            f"Pertanyaan Pengguna: {user_msg}\n"
            "Jawaban:"
        )

        # Get chat history
        history = self._get_chat_history(session_id, user_id)
        messages = history + [{"role": "user", "content": user_msg}]

        # Call LLM
        reply = self._call_llm(system_prompt, messages)

        # Save to history
        self._save_chat_message(user_id, "user", user_msg, session_id)
        self._save_chat_message(user_id, "assistant", reply, session_id)

        return {
            "reply": reply,
            "items": self._format_items(reranked, display_cols),
            "session_id": session_id,
        }

    def generate_streaming_response(self, user_msg: str, session_id: Optional[str] = None, user_id: int = 1) -> Generator[str, None, None]:
        """Generate streaming response with RAG context."""
        cfg = self._get_settings()
        assistant_name = cfg.get("assistant_name", "Aiko")
        greeting_message = cfg.get("greeting_message", "Halo! Ada yang bisa saya bantu?")
        assistant_job = cfg.get("assistant_job", "Customer Service Toko Elektronik")

        # Create/get session
        session_id = self._create_or_get_session(user_id, session_id)

        if self._is_greeting(user_msg):
            self._save_chat_message(user_id, "user", user_msg, session_id)
            self._save_chat_message(user_id, "assistant", greeting_message, session_id)
            yield json.dumps({"type": "reply", "text": greeting_message, "session_id": session_id})
            return

        # Search and rerank
        reranked, display_cols = self._search_and_rerank(user_msg)
        context_str = self._build_context(reranked, display_cols)

        # Build system prompt
        system_prompt = (
            f"Kamu adalah {assistant_name}, seorang {assistant_job} yang ramah dan profesional.\n"
            "Jawablah pertanyaan pengguna dengan jujur, ringkas, dan jelas berdasarkan konteks berikut.\n"
            "Jika informasi tidak terdapat pada konteks, jawablah dengan sopan bahwa kamu tidak tahu, dan jangan membuat-buat informasi.\n\n"
            f"Konteks:\n{context_str}\n\n"
            f"Pertanyaan Pengguna: {user_msg}\n"
            "Jawaban:"
        )

        # Get chat history
        history = self._get_chat_history(session_id, user_id)
        messages = history + [{"role": "user", "content": user_msg}]

        # Save user message
        self._save_chat_message(user_id, "user", user_msg, session_id)

        # Stream response
        full_reply = ""
        for chunk in self._call_llm_stream(system_prompt, messages):
            full_reply += chunk
            yield json.dumps({"type": "chunk", "text": chunk, "session_id": session_id})

        # Save assistant message
        self._save_chat_message(user_id, "assistant", full_reply, session_id)

        # Send items
        yield json.dumps({
            "type": "items",
            "items": self._format_items(reranked, display_cols),
            "session_id": session_id,
        })

    def generate_3d_response(self, user_msg: str, session_id: Optional[str] = None, user_id: int = 1) -> dict:
        """Generate 3D avatar response with RAG context."""
        cfg = self._get_settings()
        assistant_name = cfg.get("assistant_name", "Aiko")
        greeting_message = cfg.get("greeting_message", "Halo! Ada yang bisa saya bantu?")
        assistant_job = cfg.get("assistant_job", "Customer Service Toko Elektronik")

        session_id = self._create_or_get_session(user_id, session_id)

        if self._is_greeting(user_msg):
            self._save_chat_message(user_id, "user", user_msg, session_id)
            self._save_chat_message(user_id, "assistant", greeting_message, session_id)
            return {"speech_text": greeting_message, "items": [], "session_id": session_id}

        reranked, display_cols = self._search_and_rerank(user_msg)

        if not reranked:
            speech = "Maaf, data dengan topik tersebut belum tersedia."
            self._save_chat_message(user_id, "user", user_msg, session_id)
            self._save_chat_message(user_id, "assistant", speech, session_id)
            return {"speech_text": speech, "items": [], "session_id": session_id}

        context_str = self._build_context(reranked, display_cols)

        system_prompt = (
            f"Kamu adalah {assistant_name}, seorang {assistant_job} yang ramah dan profesional.\n"
            "Jawablah pertanyaan pengguna dengan jujur, ringkas, dan jelas berdasarkan konteks berikut.\n"
            "Jika informasi tidak terdapat pada konteks, jawablah dengan sopan bahwa kamu tidak tahu, dan jangan membuat-buat informasi.\n\n"
            f"Konteks:\n{context_str}\n\n"
            f"Pertanyaan Pengguna: {user_msg}\n"
            "Jawaban:"
        )

        history = self._get_chat_history(session_id, user_id)
        messages = history + [{"role": "user", "content": user_msg}]

        reply = self._call_llm(system_prompt, messages)

        self._save_chat_message(user_id, "user", user_msg, session_id)
        self._save_chat_message(user_id, "assistant", reply, session_id)

        return {
            "speech_text": reply,
            "items": self._format_items(reranked, display_cols),
            "session_id": session_id,
        }

    def get_user_sessions(self, user_id: int) -> list[dict]:
        """Get all chat sessions for a user."""
        rows = ChatRepository.get_chat_sessions_by_user(user_id)
        return [dict(r) for r in rows]

    def get_session_messages(self, session_id: str, user_id: int) -> list[dict]:
        """Get all messages in a session."""
        rows = ChatRepository.get_chat_messages(session_id, user_id)
        return [dict(r) for r in rows]

    def delete_session(self, session_id: str, user_id: int) -> None:
        """Delete a chat session and its messages."""
        ChatRepository.delete_chat_session(session_id, user_id)


# Singleton instance — hindari re-load model berkali-kali
_chat_service_instance: Optional["ChatService"] = None


def get_chat_service() -> "ChatService":
    """Get or create the shared ChatService singleton."""
    global _chat_service_instance
    if _chat_service_instance is None:
        _chat_service_instance = ChatService()
    return _chat_service_instance