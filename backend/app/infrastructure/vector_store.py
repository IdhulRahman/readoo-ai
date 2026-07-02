import os
import glob
import pickle
import logging
import re

import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer, CrossEncoder

from app.core.config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self):
        self._init_paths()

        # Initialize embedding model
        self.encoder = SentenceTransformer(settings.EMBEDDING_MODEL)
        self.dimension = self.encoder.get_sentence_embedding_dimension()

        # Initialize CrossEncoder reranker if configured
        if settings.USE_RERANKER:
            self.reranker = CrossEncoder(settings.RERANKER_MODEL, trust_remote_code=True)
        else:
            self.reranker = None

        # Build or load vector index
        if self._store_exists():
            self._load_store()
        else:
            self._build_store_from_csv()

    def _init_paths(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.data_dir = os.path.join(base_dir, "data")
        self.store_dir = os.path.join(self.data_dir, "vector_store")

        self.index_path = os.path.join(self.store_dir, "knowledge.index")
        self.meta_path = os.path.join(self.store_dir, "metadata.pkl")

        os.makedirs(self.store_dir, exist_ok=True)

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
            logger.warning("No CSV files found in data directory: %s", self.data_dir)
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

                # Text for generating embeddings
                text = (
                    f"{row.get('klasifikasi','')} "
                    f"{row.get('jenis_buku','')} "
                    f"{title} "
                    f"{row.get('subjek','')} "
                    f"{row.get('pengarang','')} "
                    f"{abstraksi}"
                )

                vector = self.encoder.encode([text], show_progress_bar=False)[0]
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
                        "image_base64": str(row.get("image_base64", "")).strip(),
                    }
                )

        if vectors:
            self.index = faiss.IndexFlatL2(self.dimension)
            self.index.add(np.asarray(vectors, dtype=np.float32))

            faiss.write_index(self.index, self.index_path)
            with open(self.meta_path, "wb") as f:
                pickle.dump(self.metadata, f)

            logger.info("Vector store built (%d items)", len(self.metadata))

    def search(self, query, top_k=20):
        if not hasattr(self, "index") or self.index.ntotal == 0:
            return []

        query_vec = self.encoder.encode([query], show_progress_bar=False)

        _, indices = self.index.search(
            np.asarray(query_vec, dtype=np.float32),
            top_k,
        )

        return [
            self.metadata[i]
            for i in indices[0]
            if 0 <= i < len(self.metadata)
        ]

    def rerank(self, query, docs, top_k=5):
        if not docs:
            return []

        # Bypass reranking if disabled
        if not settings.USE_RERANKER or self.reranker is None:
            ranked = []
            for d in docs:
                d_copy = d.copy()
                d_copy["rerank_score"] = 1.0

                raw_view = str(d_copy.get("dilihat", "0"))
                match = re.search(r"\d+", raw_view)
                popularity = float(match.group()) if match else 0.0
                d_copy["rerank_score"] += 0.01 * np.log1p(popularity)

                ranked.append(d_copy)

            ranked.sort(key=lambda x: x["rerank_score"], reverse=True)
            return ranked[:top_k]

        pairs = [
            (query, f"{d['judul']} {d.get('subjek','')} {d.get('pengarang','')}")
            for d in docs
        ]
        scores = self.reranker.predict(pairs)

        ranked = []
        for doc, score in zip(docs, scores):
            d = doc.copy()
            d["rerank_score"] = float(score)

            raw_view = str(d.get("dilihat", "0"))
            match = re.search(r"\d+", raw_view)
            popularity = float(match.group()) if match else 0.0
            d["rerank_score"] += 0.01 * np.log1p(popularity)

            ranked.append(d)

        ranked.sort(key=lambda x: x["rerank_score"], reverse=True)
        filtered = [
            d for d in ranked
            if d["rerank_score"] >= settings.RERANK_THRESHOLD
        ]

        if len(filtered) < 5:
            filtered = ranked[:top_k]

        return filtered[:top_k]

    def get_all_books(self):
        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        if not csv_files:
            return []
        
        books = []
        for path in csv_files:
            try:
                df = pd.read_csv(path)
                df.columns = [c.strip().lower() for c in df.columns]
                for _, row in df.iterrows():
                    books.append({
                        "id": str(row.get("id", "-")),
                        "judul": str(row.get("judul", "")),
                        "pengarang": str(row.get("pengarang", "")),
                        "kode": str(row.get("kode", "")),
                        "klasifikasi": str(row.get("klasifikasi", "")),
                        "jenis_buku": str(row.get("jenis_buku", "")),
                        "subjek": str(row.get("subjek", "")),
                        "rak": str(row.get("no_rak", "-")),
                        "penerbit": str(row.get("penerbit", "-")),
                        "kota_penerbit": str(row.get("kota_penerbit", "-")),
                        "tahun": str(row.get("tahun_terbit", "-")),
                        "dilihat": int(row.get("dilihat", 0)) if pd.notna(row.get("dilihat")) and str(row.get("dilihat")).isdigit() else 0,
                        "image_base64": str(row.get("image_base64", "")).strip(),
                        "abstraksi": str(row.get("abstraksi", ""))
                    })
            except Exception as e:
                logger.error("Failed to read CSV %s: %s", path, e)
        return books

    def _save_all_to_csv(self, books):
        csv_files = glob.glob(os.path.join(self.data_dir, "*.csv"))
        csv_path = csv_files[0] if csv_files else os.path.join(self.data_dir, "koleksi_buku.csv")
        
        data = []
        for b in books:
            data.append({
                "id": b.get("id"),
                "judul": b.get("judul"),
                "pengarang": b.get("pengarang"),
                "kode": b.get("kode", ""),
                "klasifikasi": b.get("klasifikasi", ""),
                "jenis_buku": b.get("jenis_buku", ""),
                "subjek": b.get("subjek", ""),
                "no_rak": b.get("rak"),
                "penerbit": b.get("penerbit"),
                "kota_penerbit": b.get("kota_penerbit"),
                "tahun_terbit": b.get("tahun"),
                "dilihat": b.get("dilihat", 0),
                "abstraksi": b.get("abstraksi", ""),
                "image_base64": b.get("image_base64", "")
            })
        
        try:
            df = pd.DataFrame(data)
            df.to_csv(csv_path, index=False)
            logger.info("Successfully saved %d books to %s", len(books), csv_path)
            return True
        except Exception as e:
            logger.exception("Failed to write books to CSV: %s", e)
            return False

    def add_book(self, book_data):
        books = self.get_all_books()
        
        # Auto generate simple integer ID
        ids = []
        for b in books:
            try:
                ids.append(int(b["id"]))
            except ValueError:
                pass
        new_id = str(max(ids) + 1) if ids else "1"
        book_data["id"] = new_id
        
        books.append(book_data)
        if self._save_all_to_csv(books):
            self._build_store_from_csv()
            return new_id
        return None

    def update_book(self, book_id, book_data):
        books = self.get_all_books()
        updated = False
        
        for i, b in enumerate(books):
            if b["id"] == str(book_id):
                book_data["id"] = str(book_id)
                if "dilihat" not in book_data or book_data["dilihat"] is None:
                    book_data["dilihat"] = b.get("dilihat", 0)
                books[i] = book_data
                updated = True
                break
                
        if updated and self._save_all_to_csv(books):
            self._build_store_from_csv()
            return True
        return False

    def delete_book(self, book_id):
        books = self.get_all_books()
        initial_len = len(books)
        books = [b for b in books if b["id"] != str(book_id)]
        
        if len(books) < initial_len and self._save_all_to_csv(books):
            self._build_store_from_csv()
            return True
        return False

