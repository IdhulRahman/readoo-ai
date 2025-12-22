import os
import glob
import pickle
import logging

import faiss
import numpy as np
import pandas as pd
import requests
import re
from sentence_transformers import SentenceTransformer, CrossEncoder

logger = logging.getLogger(__name__)


class RAGEngine:
    def __init__(self):
        self._init_paths()
        self._init_llm_provider()

        # Chat Memory
        self.chat_history = []
        self.max_history_turns = 2

        # Embedding Model
        self.encoder = SentenceTransformer(
            "paraphrase-multilingual-mpnet-base-v2"
        )
        self.dimension = 768

        # Reranker Model
        self.reranker = CrossEncoder(
            os.getenv(
                "RERANKER_MODEL",
                "jinaai/jina-reranker-v2-base-multilingual"
            ),
            trust_remote_code=True
        )
        self.rerank_threshold = float(
            os.getenv("RERANK_THRESHOLD", 0.45)
        )

        # Vector Store
        if self._store_exists():
            self._load_store()
        else:
            self._build_store_from_csv()

    # INIT & PATH
    def _init_paths(self):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.data_dir = os.path.join(base_dir, "data")
        self.store_dir = os.path.join(self.data_dir, "vector_store")

        self.index_path = os.path.join(self.store_dir, "knowledge.index")
        self.meta_path = os.path.join(self.store_dir, "metadata.pkl")

        os.makedirs(self.store_dir, exist_ok=True)

    def _init_llm_provider(self):
        self.ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

        if self._ollama_available():
            self.active_provider = "ollama"
        else:
            self.active_provider = os.getenv("LLM_PROVIDER", "groq")

        logger.info("Active LLM provider: %s", self.active_provider)

    # VECTOR STORE
    def _store_exists(self):
        return (
            os.path.exists(self.index_path)
            and os.path.exists(self.meta_path)
        )

    def _load_store(self):
        self.index = faiss.read_index(self.index_path)
        with open(self.meta_path, "rb") as f:
            self.metadata = pickle.load(f)

        logger.info("Vector store loaded (%d items)", len(self.metadata))

    def _build_store_from_csv(self):
        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        if not csv_files:
            logger.warning("No CSV files found")
            return

        vectors = []
        self.metadata = []

        for path in csv_files:
            df = pd.read_csv(path)
            df.columns = [c.strip().lower() for c in df.columns]

            for _, row in df.iterrows():
                title = str(row.get("judul", "")).strip()
                if not title:
                    continue

                abstraksi = str(row.get("abstraksi", ""))[:300]

                # TEXT FOR EMBEDDING (NO IMAGE)
                text = (
                    f"{row.get('klasifikasi','')} "
                    f"{row.get('jenis_buku','')} "
                    f"{title} "
                    f"{row.get('subjek','')} "
                    f"{row.get('pengarang','')} "
                    f"{abstraksi}"
                )

                vector = self.encoder.encode(
                    [text], show_progress_bar=True
                )[0]

                vectors.append(vector)

                self.metadata.append(
                    {
                        "id": row.get("id", "-"),
                        "judul": title,
                        "pengarang": row.get("pengarang", ""),
                        "kode": row.get("kode", ""),
                        "klasifikasi": row.get("klasifikasi", ""),
                        "jenis_buku": row.get("jenis_buku", ""),
                        "subjek": row.get("subjek", ""),
                        "rak": row.get("no_rak", "-"),
                        "penerbit": row.get("penerbit", "-"),
                        "kota_penerbit": row.get("kota_penerbit", "-"),
                        "tahun": row.get("tahun_terbit", "-"),
                        "dilihat": row.get("dilihat", 0),
                        "image_base64": str(
                            row.get("image_base64", "")
                        ).strip(),
                    }
                )

        if vectors:
            self.index = faiss.IndexFlatL2(self.dimension)
            self.index.add(np.asarray(vectors, dtype=np.float32))

            faiss.write_index(self.index, self.index_path)
            with open(self.meta_path, "wb") as f:
                pickle.dump(self.metadata, f)

            logger.info(
                "Vector store built (%d items)", len(self.metadata)
            )

    # SEARCH (EMBEDDING)
    def search(self, query, top_k=20):
        if not hasattr(self, "index") or self.index.ntotal == 0:
            return []

        query_vec = self.encoder.encode(
            [query], show_progress_bar=False
        )

        _, indices = self.index.search(
            np.asarray(query_vec, dtype=np.float32),
            top_k,
        )

        return [
            self.metadata[i]
            for i in indices[0]
            if 0 <= i < len(self.metadata)
        ]

    # RERANKING (CROSS-ENCODER)
    def _rerank(self, query, docs, top_k=5):
        if not docs:
            return []

        pairs = [
            (
                query,
                f"{d['judul']} {d.get('subjek','')} {d.get('pengarang','')}"
            )
            for d in docs
        ]

        scores = self.reranker.predict(pairs)

        ranked = []
        for doc, score in zip(docs, scores):
            d = doc.copy()
            d["rerank_score"] = float(score)

            # SAFE popularity parsing
            raw_view = str(d.get("dilihat", "0"))
            match = re.search(r"\d+", raw_view)
            popularity = float(match.group()) if match else 0.0

            d["rerank_score"] += 0.01 * np.log1p(popularity)

            ranked.append(d)

        ranked.sort(key=lambda x: x["rerank_score"], reverse=True)

        filtered = [
            d for d in ranked
            if d["rerank_score"] >= self.rerank_threshold
        ]

        MIN_RESULTS = 5

        if len(filtered) < MIN_RESULTS:
            filtered = ranked[:top_k]

        return filtered[:top_k]

    # TEXT CHAT MODE
    def generate_text_response(self, user_msg):
        logger.debug("[TEXT MODE] %s", user_msg)

        if self._is_greeting(user_msg):
            reply = "Halo! Ada buku yang ingin kamu cari hari ini?"
            self._update_history(user_msg, reply)
            return {"reply": reply, "books": []}

        retrieved = self.search(user_msg, top_k=20)
        reranked = self._rerank(user_msg, retrieved, top_k=5)
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

        system_prompt = os.getenv("PROMPT_TEXT_MODE").format(
            context_str=context_str,
            user_msg=user_msg,
        )

        reply = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, reply)

        return {
            "reply": reply,
            "books": self._format_books(books),
        }

    # 3D / AVATAR MODE
    def generate_3d_response(self, user_msg):
        if self._is_greeting(user_msg):
            system_prompt = os.getenv("PROMPT_3D_GREETING")
            speech = self._call_llm(system_prompt, user_msg)
            self._update_history(user_msg, speech)
            return {"speech_text": speech, "books": []}

        retrieved = self.search(user_msg, top_k=20)
        books = self._rerank(user_msg, retrieved, top_k=5)

        if not books:
            speech = "Maaf, buku dengan topik tersebut belum tersedia."
            self._update_history(user_msg, speech)
            return {"speech_text": speech, "books": []}

        titles = ", ".join(b["judul"] for b in books[:3])
        system_prompt = os.getenv("PROMPT_3D_SEARCH").format(
            user_msg=user_msg,
            context_str=titles,
        )

        speech = self._call_llm(system_prompt, user_msg)
        self._update_history(user_msg, speech)

        return {
            "speech_text": speech,
            "books": self._format_books(books),
        }

    # UTILITIES
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

    # GREETING CLASSIFIER
    def _is_greeting(self, text):
        system_prompt = os.getenv("PROMPT_CLASSIFIER")
        response = self._call_llm(system_prompt, text)
        return response.strip().upper() == "YES"

    # LLM CALLS
    def _call_llm(self, system_prompt, user_msg):
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self.chat_history)
        messages.append({"role": "user", "content": user_msg})

        if self.active_provider == "ollama":
            return self._call_ollama(messages)
        if self.active_provider == "openrouter":
            return self._call_openrouter(messages)

        return self._call_groq(messages)

    def _ollama_available(self):
        try:
            requests.get(self.ollama_url, timeout=1)
            return True
        except requests.RequestException:
            return False

    def _call_ollama(self, messages):
        try:
            res = requests.post(
                f"{self.ollama_url}/api/chat",
                json={
                    "model": os.getenv("OLLAMA_MODEL", "llama3"),
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
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}"
                },
                json={
                    "model": os.getenv(
                        "GROQ_MODEL", "llama3-8b-8192"
                    ),
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
                    "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}"
                },
                json={
                    "model": os.getenv(
                        "OPENROUTER_MODEL",
                        "openai/gpt-3.5-turbo",
                    ),
                    "messages": messages,
                },
                timeout=30,
            )
            return res.json()["choices"][0]["message"]["content"]
        except Exception:
            logger.error("OpenRouter failed")
            return "Sistem sedang tidak tersedia."

