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
from app.repositories.collection_repository import CollectionRepository

logger = logging.getLogger(__name__)


class VectorStore:
    def __init__(self):
        import torch
        try:
            torch.set_num_threads(2)
            logger.info("PyTorch CPU threads successfully limited to 2")
        except Exception as e:
            logger.warning("Failed to set PyTorch thread limit: %s", e)

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
        row = CollectionRepository.get_active_collection()

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
        rows = CollectionRepository.get_documents_by_collection(collection_id)

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
        active_row = CollectionRepository.get_collection(collection_id)

        if active_row and active_row["active"] == 1:
            self.index = index
            self.active_collection_id = collection_id
            logger.info("Loaded rebuilt FAISS index for active collection %d into memory", collection_id)
        else:
            logger.info("FAISS index rebuilt on disk for collection %d", collection_id)

    def _rank_bm25(self, query, documents, k1=1.5, b=0.75):
        import math
        from collections import Counter
        
        # Tokenize query
        query_tokens = query.lower().split()
        if not query_tokens or not documents:
            return []
            
        corpus_size = len(documents)
        doc_lengths = []
        doc_term_freqs = []
        df = Counter()
        
        for doc in documents:
            content = doc.get("_content", "")
            tokens = content.lower().split()
            doc_lengths.append(len(tokens))
            tf = Counter(tokens)
            doc_term_freqs.append(tf)
            for term in set(tokens):
                df[term] += 1
                
        avg_dl = sum(doc_lengths) / corpus_size if corpus_size > 0 else 1
        
        scored_docs = []
        for idx, doc in enumerate(documents):
            score = 0.0
            dl = doc_lengths[idx]
            tf = doc_term_freqs[idx]
            for term in query_tokens:
                if term in tf:
                    doc_freq = df[term]
                    # Log-based IDF with smoothing
                    idf = math.log((corpus_size - doc_freq + 0.5) / (doc_freq + 0.5) + 1.0)
                    term_tf = tf[term]
                    numerator = term_tf * (k1 + 1)
                    denominator = term_tf + k1 * (1 - b + b * (dl / avg_dl))
                    score += idf * (numerator / denominator)
            if score > 0:
                scored_docs.append((score, doc))
                
        scored_docs.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored_docs]

    def _reciprocal_rank_fusion(self, semantic_results, keyword_results, k=60):
        rrf_scores = {}
        
        # Add semantic rank scores
        for rank, doc in enumerate(semantic_results):
            doc_id = doc["id"]
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {"doc": doc, "score": 0.0}
            rrf_scores[doc_id]["score"] += 1.0 / (k + (rank + 1))
            
        # Add keyword rank scores
        for rank, doc in enumerate(keyword_results):
            doc_id = doc["id"]
            if doc_id not in rrf_scores:
                rrf_scores[doc_id] = {"doc": doc, "score": 0.0}
            rrf_scores[doc_id]["score"] += 1.0 / (k + (rank + 1))
            
        # Sort docs by score descending
        sorted_items = sorted(rrf_scores.values(), key=lambda x: x["score"], reverse=True)
        return [item["doc"] for item in sorted_items]

    def search(self, query_text, top_k=5):
        if not self.active_collection_id:
            logger.warning("Search failed: No active RAG collection loaded.")
            return []

        # 1. Semantic search (FAISS)
        semantic_results = []
        if self.index is not None:
            # Embed query
            query_vec = self.encoder.encode([query_text], show_progress_bar=False)
            query_vec = np.array(query_vec, dtype=np.float32)

            # Search FAISS
            distances, ids = self.index.search(query_vec, 20) # get top 20 candidates for fusion
            
            # Filter padding IDs (-1)
            matched_ids = [int(i) for i in ids[0] if i != -1]
            if matched_ids:
                # Fetch matching documents from SQLite
                rows = CollectionRepository.get_documents_by_ids(matched_ids)

                # Sort documents to match FAISS ranking order
                doc_map = {r["id"]: r for r in rows}
                for doc_id in matched_ids:
                    if doc_id in doc_map:
                        row = doc_map[doc_id]
                        meta = json.loads(row["metadata"])
                        meta["id"] = row["id"]
                        meta["_content"] = row["content"]
                        semantic_results.append(meta)

        # 2. Keyword search (BM25)
        rows = CollectionRepository.get_documents_by_collection(self.active_collection_id)

        candidates = []
        for r in rows:
            meta = json.loads(r["metadata"])
            meta["id"] = r["id"]
            meta["_content"] = r["content"]
            candidates.append(meta)

        keyword_results = self._rank_bm25(query_text, candidates)
        keyword_results = keyword_results[:20] # get top 20 candidates for fusion

        # 3. Reciprocal Rank Fusion (RRF)
        fused_results = self._reciprocal_rank_fusion(semantic_results, keyword_results, k=60)

        # 4. Limit to top_k before returning
        return fused_results[:top_k]

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
        import sqlite3
        CollectionRepository.deactivate_all_collections()
        
        now = datetime.now().isoformat()
        try:
            col_id = CollectionRepository.create_collection(
                name, json.dumps(embedding_cols), json.dumps(display_cols), 1, now
            )
        except sqlite3.IntegrityError:
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

            CollectionRepository.create_document(col_id, content, json.dumps(meta))

        self.rebuild_index(col_id)
        
        # Load in memory
        self.active_collection_id = col_id
        index_path = os.path.join(self.store_dir, f"collection_{col_id}.index")
        self.index = faiss.read_index(index_path)
        
        return col_id

    def add_collection_from_unstructured(self, name, chunks, original_filename):
        import sqlite3
        CollectionRepository.deactivate_all_collections()
        
        now = datetime.now().isoformat()
        embedding_cols = ["text"]
        display_cols = ["text"]
        
        try:
            col_id = CollectionRepository.create_collection(
                name, json.dumps(embedding_cols), json.dumps(display_cols), 1, now
            )
        except sqlite3.IntegrityError:
            raise ValueError(f"Collection with name '{name}' already exists.")
            
        for chunk in chunks:
            content = chunk["content"]
            meta = chunk["metadata"]
            meta["source"] = original_filename
            CollectionRepository.create_document(col_id, content, json.dumps(meta))
            
        # Rebuild FAISS index
        self.rebuild_index(col_id)
        
        # Load in memory
        self.active_collection_id = col_id
        index_path = os.path.join(self.store_dir, f"collection_{col_id}.index")
        self.index = faiss.read_index(index_path)
        
        return col_id

    def delete_collection(self, collection_id):
        CollectionRepository.delete_collection(collection_id)

        # Clean index file
        index_path = os.path.join(self.store_dir, f"collection_{collection_id}.index")
        if os.path.exists(index_path):
            try:
                os.remove(index_path)
            except Exception:
                logger.error("Failed to delete index file %s", index_path)

        self.load_active_collection()

    def delete_document_from_index(self, collection_id, doc_id):
        index_path = os.path.join(self.store_dir, f"collection_{collection_id}.index")
        if os.path.exists(index_path):
            try:
                index = faiss.read_index(index_path)
                index.remove_ids(np.array([doc_id], dtype=np.int64))
                faiss.write_index(index, index_path)
                if self.active_collection_id == collection_id:
                    self.index = index
                logger.info("Successfully removed document ID %d from FAISS index %d incrementally", doc_id, collection_id)
            except Exception as e:
                logger.error("Failed to incrementally remove doc ID %d from FAISS index: %s", doc_id, e)
                self.rebuild_index(collection_id)

    def add_document_to_index(self, collection_id, doc_id, content):
        index_path = os.path.join(self.store_dir, f"collection_{collection_id}.index")
        if os.path.exists(index_path):
            try:
                index = faiss.read_index(index_path)
                embedding = self.encoder.encode([content], show_progress_bar=False)
                embedding = np.array(embedding, dtype=np.float32)
                index.add_with_ids(embedding, np.array([doc_id], dtype=np.int64))
                faiss.write_index(index, index_path)
                if self.active_collection_id == collection_id:
                    self.index = index
                logger.info("Successfully added document ID %d to FAISS index %d incrementally", doc_id, collection_id)
            except Exception as e:
                logger.error("Failed to incrementally add doc ID %d to FAISS index: %s", doc_id, e)
                self.rebuild_index(collection_id)
