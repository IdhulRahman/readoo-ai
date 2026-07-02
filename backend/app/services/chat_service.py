import re
import json
import logging

from app.core.config import settings
from app.infrastructure.database import get_db_connection
from app.infrastructure.vector_store import VectorStore

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self):
        self.vector_store = VectorStore()
        self.chat_history = []
        self.max_history_turns = 2

    def generate_text_response(self, user_msg):
        logger.debug("[TEXT MODE] %s", user_msg)

        # Get settings from DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT key, value FROM settings WHERE key IN ('assistant_name', 'greeting_message', 'system_prompt')"
        )
        rows = cursor.fetchall()
        conn.close()

        cfg = {r["key"]: r["value"] for r in rows}
        assistant_name = cfg.get("assistant_name", "Aiko")
        greeting_message = cfg.get("greeting_message", "Halo! Ada yang bisa saya bantu?")
        system_prompt_template = cfg.get("system_prompt", "")

        if self._is_greeting(user_msg):
            self._update_history(user_msg, greeting_message)
            return {"reply": greeting_message, "items": []}

        # Search database
        retrieved = self.vector_store.search(user_msg, top_k=20)
        reranked = self.vector_store.rerank(user_msg, retrieved, top_k=5)

        # Get active collection display columns
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT display_cols FROM collections WHERE id = ?",
            (self.vector_store.active_collection_id,)
        )
        col_row = cursor.fetchone()
        conn.close()

        display_cols = json.loads(col_row["display_cols"]) if col_row else []

        if reranked:
            context_str = ""
            for idx, doc in enumerate(reranked, 1):
                context_str += f"Item #{idx}:\n"
                for col in display_cols:
                    if col in doc:
                        context_str += f"{col.capitalize()}: {doc[col]}\n"
                context_str += "\n"
        else:
            context_str = "Tidak ada dokumen atau data relevan ditemukan."

        # Format system prompt
        system_prompt = system_prompt_template.format(
            name=assistant_name,
            context=context_str,
            query=user_msg
        )

        reply = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, reply)

        return {
            "reply": reply,
            "items": self._format_items(reranked, display_cols),
        }

    def generate_3d_response(self, user_msg):
        logger.debug("[3D MODE] %s", user_msg)

        # Get settings from DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT key, value FROM settings WHERE key IN ('assistant_name', 'greeting_message', 'system_prompt')"
        )
        rows = cursor.fetchall()
        conn.close()

        cfg = {r["key"]: r["value"] for r in rows}
        assistant_name = cfg.get("assistant_name", "Aiko")
        greeting_message = cfg.get("greeting_message", "Halo! Ada yang bisa saya bantu?")
        system_prompt_template = cfg.get("system_prompt", "")

        if self._is_greeting(user_msg):
            self._update_history(user_msg, greeting_message)
            return {"speech_text": greeting_message, "items": []}

        # Search database
        retrieved = self.vector_store.search(user_msg, top_k=20)
        reranked = self.vector_store.rerank(user_msg, retrieved, top_k=5)

        # Get display columns
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT display_cols FROM collections WHERE id = ?",
            (self.vector_store.active_collection_id,)
        )
        col_row = cursor.fetchone()
        conn.close()

        display_cols = json.loads(col_row["display_cols"]) if col_row else []

        if not reranked:
            speech = "Maaf, data dengan topik tersebut belum tersedia."
            self._update_history(user_msg, speech)
            return {"speech_text": speech, "items": []}

        context_str = ""
        for idx, doc in enumerate(reranked, 1):
            context_str += f"Item #{idx}:\n"
            for col in display_cols:
                if col in doc:
                    context_str += f"{col.capitalize()}: {doc[col]}\n"
            context_str += "\n"

        system_prompt = system_prompt_template.format(
            name=assistant_name,
            context=context_str,
            query=user_msg
        )

        reply = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, reply)

        return {
            "speech_text": reply,
            "items": self._format_items(reranked, display_cols),
        }

    def _is_greeting(self, text):
        greetings = [
            "halo", "hai", "selamat pagi", "selamat siang", "selamat sore",
            "selamat malam", "hi", "hello", "pagi", "siang", "sore", "malam",
            "assalamualaikum", "hei"
        ]
        cleaned = re.sub(r"[^\w\s]", "", text.lower().strip())
        words = cleaned.split()
        return any(w in greetings for w in words)

    def _call_llm(self, system_prompt, user_msg):
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.chat_history)
        messages.append({"role": "user", "content": user_msg})

        # Load LLM settings dynamically from database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT key, value FROM settings WHERE key IN ('llm_provider', 'llm_model', 'llm_api_key')"
        )
        rows = cursor.fetchall()
        conn.close()

        cfg = {r["key"]: r["value"] for r in rows}
        provider = cfg.get("llm_provider", "groq").lower()
        model_name = cfg.get("llm_model", "llama3-8b-8192")
        encrypted_key = cfg.get("llm_api_key", "")
        
        # Decrypt API Key
        from app.core.security import decrypt_api_key
        api_key = decrypt_api_key(encrypted_key)

        model_string = f"{provider}/{model_name}" if "/" not in model_name else model_name

        try:
            import litellm
            litellm.telemetry = False  # Disable external logging for speed and privacy
            
            if provider == "ollama":
                api_base = settings.OLLAMA_BASE_URL
                res = litellm.completion(
                    model=model_string,
                    messages=messages,
                    api_base=api_base,
                    timeout=30
                )
            else:
                res = litellm.completion(
                    model=model_string,
                    messages=messages,
                    api_key=api_key if api_key else None,
                    timeout=30
                )
            return res.choices[0].message.content
        except Exception as e:
            logger.exception("LiteLLM completion call failed")
            return f"Error: Gagal memanggil model AI ({e}). Silakan periksa konfigurasi LLM Anda di dashboard Admin."

    def _update_history(self, user_msg, assistant_msg):
        self.chat_history.extend(
            [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": assistant_msg},
            ]
        )
        self.chat_history = self.chat_history[-self.max_history_turns * 2 :]

    def _format_items(self, documents, display_cols):
        import numpy as np
        formatted = []
        for doc in documents:
            item_info = {}
            for col in display_cols:
                item_info[col] = doc.get(col, "")
            
            item_info["id"] = doc.get("id")
            
            # Map cover image / metadata colors dynamically for UI rendering
            item_info["cover_image"] = doc.get("cover_image", doc.get("image_base64", ""))
            item_info["cover_color"] = int(np.random.randint(0, 360))
            formatted.append(item_info)
        return formatted
