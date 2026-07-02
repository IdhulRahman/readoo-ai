import os
import json
import logging
import sqlite3
from datetime import datetime

import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer, CrossEncoder

from app.core.config import settings
from app.infrastructure.database import get_db_connection

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.data_dir = os.path.join(base_dir, "data")
        self.store_dir = os.path.join(self.data_dir, "vector_store")
        os.makedirs(self.store_dir, exist_ok=True)

        # Initialize embedding model
        self.encoder = SentenceTransformer(settings.EMBEDDING_MODEL)
        self.dimension = self.encoder.get_sentence_embedding_dimension()

        # Initialize CrossEncoder reranker if configured
        if settings.USE_RERANKER:
            self.reranker = CrossEncoder(settings.RERANKER_MODEL, trust_remote_code=True)
        else:
            self.reranker = None

        self.index = None
        self.active_collection_id = None
        self.load_active_collection()

    def load_active_collection(self):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM collections WHERE active = 1 LIMIT 1")
        row = cursor.fetchone()
        conn.close()

        if row:
            col_id = row["id"]
            self.active_collection_id = col_id
            index_path = os.path.join(self.store_dir, f"collection_{col_id}.index")
            if os.path.exists(index_path):
                try:
                    self.index = faiss.read_index(index_path)
                    logger.info("Loaded FAISS index for active collection '%s' (ID %d)", row["name"], col_id)
                    return
                except Exception as e:
                    logger.error("Failed to load FAISS index at %s: %s", index_path, e)
            
            # Rebuild index if file is missing
            self.rebuild_index(col_id)
        else:
            logger.warning("No active RAG collection found in database.")
            self.index = None
            self.active_collection_id = None

    def rebuild_index(self, collection_id):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, content FROM documents WHERE collection_id = ?", (collection_id,))
        rows = cursor.fetchall()
        conn.close()

        if not rows:
            logger.warning("No documents found for collection %d. Clearing index.", collection_id)
            self.index = None
            return

        logger.info("Rebuilding FAISS index for collection %d with %d documents...", collection_id, len(rows))
        
        doc_ids = []
        texts = []
        for r in rows:
            doc_ids.append(r["id"])
            texts.append(r["content"])

        # Embed all texts
        embeddings = self.encoder.encode(texts, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype=np.float32)

        # Create IndexIDMap to preserve SQLite Primary Key IDs inside FAISS
        sub_index = faiss.IndexFlatL2(self.dimension)
        index = faiss.IndexIDMap(sub_index)
        
        ids_arr = np.array(doc_ids, dtype=np.int64)
        index.add_with_ids(embeddings, ids_arr)

        # Save to disk
        index_path = os.path.join(self.store_dir, f"collection_{collection_id}.index")
        faiss.write_index(index, index_path)
        
        # Reload if active
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT active FROM collections WHERE id = ?", (collection_id,))
        active_row = cursor.fetchone()
        conn.close()

        if active_row and active_row["active"] == 1:
            self.index = index
            self.active_collection_id = collection_id
            logger.info("Loaded rebuilt FAISS index for active collection %d into memory", collection_id)
        else:
            logger.info("FAISS index rebuilt on disk for collection %d", collection_id)

    def search(self, query_text, top_k=5):
        if self.index is None:
            logger.warning("Search failed: No active FAISS index loaded.")
            return []

        # Embed query
        query_vec = self.encoder.encode([query_text], show_progress_bar=False)
        query_vec = np.array(query_vec, dtype=np.float32)

        # Search FAISS
        distances, ids = self.index.search(query_vec, top_k)
        
        # Filter padding IDs (-1)
        matched_ids = [int(i) for i in ids[0] if i != -1]
        if not matched_ids:
            return []

        # Fetch matching documents from SQLite
        conn = get_db_connection()
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in matched_ids)
        cursor.execute(
            f"SELECT id, metadata, content FROM documents WHERE id IN ({placeholders})",
            matched_ids
        )
        rows = cursor.fetchall()
        conn.close()

        # Sort documents to match FAISS ranking order
        doc_map = {r["id"]: r for r in rows}
        ordered_docs = []
        for doc_id in matched_ids:
            if doc_id in doc_map:
                row = doc_map[doc_id]
                meta = json.loads(row["metadata"])
                meta["id"] = row["id"]
                meta["_content"] = row["content"]
                ordered_docs.append(meta)

        return ordered_docs

    def rerank(self, query_text, documents, top_k=5):
        if not self.reranker or not documents:
            return documents[:top_k]

        pairs = [[query_text, doc.get("_content", "")] for doc in documents]
        scores = self.reranker.compute_score(pairs)

        if isinstance(scores, float):
            scores = [scores]

        ranked = []
        for d, score in zip(documents, scores):
            d["rerank_score"] = float(score)
            
            # Metric popular scaling if views or popularity is present in metadata
            views = 0
            for key in ["views", "dilihat", "popularity"]:
                if key in d:
                    try:
                        views = float(d[key])
                        break
                    except (ValueError, TypeError):
                        pass
            d["rerank_score"] += 0.01 * np.log1p(views)
            ranked.append(d)

        ranked.sort(key=lambda x: x["rerank_score"], reverse=True)
        return ranked[:top_k]

    def add_collection_from_csv(self, name, embedding_cols, display_cols, df):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Deactivate any previous collections since we set this one active
        cursor.execute("UPDATE collections SET active = 0")
        
        now = datetime.now().isoformat()
        try:
            cursor.execute(
                "INSERT INTO collections (name, embedding_cols, display_cols, active, created_at) VALUES (?, ?, ?, ?, ?)",
                (name, json.dumps(embedding_cols), json.dumps(display_cols), 1, now)
            )
            col_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            conn.rollback()
            conn.close()
            raise ValueError(f"Collection with name '{name}' already exists.")

        df.columns = [c.strip() for c in df.columns]

        # Insert documents
        for _, row in df.iterrows():
            content_parts = []
            for col in embedding_cols:
                if col in row:
                    content_parts.append(str(row[col]))
            content = " ".join(content_parts).strip()
            
            if not content:
                continue

            meta = {}
            for col in df.columns:
                val = row[col]
                if pd.isna(val):
                    val = ""
                meta[col] = val

            cursor.execute(
                "INSERT INTO documents (collection_id, content, metadata) VALUES (?, ?, ?)",
                (col_id, content, json.dumps(meta))
            )

        conn.commit()
        conn.close()

        # Rebuild FAISS index
        self.rebuild_index(col_id)
        
        # Load in memory
        self.active_collection_id = col_id
        index_path = os.path.join(self.store_dir, f"collection_{col_id}.index")
        self.index = faiss.read_index(index_path)
        
        return col_id

    def delete_collection(self, collection_id):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT active FROM collections WHERE id = ?", (collection_id,))
        row = cursor.fetchone()
        was_active = row and row["active"] == 1
        
        cursor.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
        conn.commit()
        conn.close()

        # Clean index file
        index_path = os.path.join(self.store_dir, f"collection_{collection_id}.index")
        if os.path.exists(index_path):
            try:
                os.remove(index_path)
            except Exception:
                logger.error("Failed to delete index file %s", index_path)

        if was_active:
            self.index = None
            self.active_collection_id = None
            
            # Activate another collection if exists
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM collections LIMIT 1")
            other = cursor.fetchone()
            if other:
                cursor.execute("UPDATE collections SET active = 1 WHERE id = ?", (other["id"],))
                conn.commit()
            conn.close()
            self.load_active_collection()
