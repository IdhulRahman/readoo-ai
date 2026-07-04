import re
import json
import logging
import uuid
from datetime import datetime
from typing import Optional, Generator

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
        """Search vector store and rerank results."""
        retrieved = self.vector_store.search(query, top_k=20)
        reranked = self.vector_store.rerank(query, retrieved, top_k=5)

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
            import litellm
            litellm.telemetry = False
            
            full_messages = [{"role": "system", "content": system_prompt}] + messages
            
            if provider == "ollama":
                res = litellm.completion(
                    model=model_string,
                    messages=full_messages,
                    api_base=settings.OLLAMA_BASE_URL,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30
                )
            else:
                res = litellm.completion(
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
            import litellm
            litellm.telemetry = False
            
            full_messages = [{"role": "system", "content": system_prompt}] + messages
            
            if provider == "ollama":
                response = litellm.completion(
                    model=model_string,
                    messages=full_messages,
                    api_base=settings.OLLAMA_BASE_URL,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    timeout=30,
                    stream=True
                )
            else:
                response = litellm.completion(
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