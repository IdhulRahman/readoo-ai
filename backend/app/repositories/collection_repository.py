import sqlite3
from typing import Optional, List
from app.infrastructure.database import get_db_connection

class CollectionRepository:
    @staticmethod
    def get_all_collections() -> List[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.id, c.name, c.embedding_cols, c.display_cols, c.active, c.created_at, COUNT(d.id) as doc_count 
            FROM collections c
            LEFT JOIN documents d ON c.id = d.collection_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        """)
        rows = cursor.fetchall()
        conn.close()
        return rows

    @staticmethod
    def get_collection(col_id: int) -> Optional[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, embedding_cols, display_cols, active, created_at FROM collections WHERE id = ?", (col_id,))
        row = cursor.fetchone()
        conn.close()
        return row

    @staticmethod
    def get_active_collection() -> Optional[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, display_cols FROM collections WHERE active = 1 LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return row

    @staticmethod
    def deactivate_all_collections() -> None:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE collections SET active = 0")
        conn.commit()
        conn.close()

    @staticmethod
    def set_active_collection(col_id: int) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM collections WHERE id = ?", (col_id,))
        if not cursor.fetchone():
            conn.close()
            return False
        cursor.execute("UPDATE collections SET active = 0")
        cursor.execute("UPDATE collections SET active = 1 WHERE id = ?", (col_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def create_collection(name: str, embedding_cols: str, display_cols: str, active: int, created_at: str) -> int:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO collections (name, embedding_cols, display_cols, active, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, embedding_cols, display_cols, active, created_at)
        )
        col_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return col_id

    @staticmethod
    def delete_collection(col_id: int) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT active FROM collections WHERE id = ?", (col_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
        was_active = row["active"] == 1
        cursor.execute("DELETE FROM collections WHERE id = ?", (col_id,))
        conn.commit()
        conn.close()

        # FIX: Kalau collection yang dihapus tadi berstatus aktif, sistem perlu
        # otomatis mengaktifkan collection lain. SEBELUMNYA query ini tidak
        # punya ORDER BY, sehingga SQLite bisa mengembalikan collection MANA
        # SAJA (dalam praktiknya cenderung yang PALING LAMA dibuat) - bukan
        # yang paling relevan/terbaru. Ini menyebabkan collection lama yang
        # sudah "usang" bisa tiba-tiba aktif lagi tanpa sepengetahuan user.
        # Sekarang eksplisit diurutkan berdasarkan created_at TERBARU dulu.
        if was_active:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM collections ORDER BY created_at DESC LIMIT 1")
            other = cursor.fetchone()
            if other:
                cursor.execute("UPDATE collections SET active = 1 WHERE id = ?", (other["id"],))
                conn.commit()
            conn.close()
        return True

    @staticmethod
    def create_document(collection_id: int, content: str, metadata: str) -> int:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO documents (collection_id, content, metadata) VALUES (?, ?, ?)",
            (collection_id, content, metadata)
        )
        doc_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return doc_id

    @staticmethod
    def get_documents_by_collection(collection_id: int) -> List[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, content, metadata FROM documents WHERE collection_id = ?", (collection_id,))
        rows = cursor.fetchall()
        conn.close()
        return rows

    @staticmethod
    def get_document(doc_id: int) -> Optional[sqlite3.Row]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, collection_id, content, metadata FROM documents WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        conn.close()
        return row

    @staticmethod
    def delete_document(doc_id: int) -> bool:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
        conn.close()
        return True

    @staticmethod
    def get_documents_by_ids(doc_ids: List[int]) -> List[sqlite3.Row]:
        if not doc_ids:
            return []
        conn = get_db_connection()
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in doc_ids)
        cursor.execute(
            f"SELECT id, metadata, content FROM documents WHERE id IN ({placeholders})",
            doc_ids
        )
        rows = cursor.fetchall()
        conn.close()
        return rows

    @staticmethod
    def get_stats() -> dict:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM collections")
        total_collections = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM documents")
        total_documents = cursor.fetchone()["cnt"]

        cursor.execute(
            "SELECT name, doc_count FROM (SELECT c.name, COUNT(d.id) as doc_count FROM collections c LEFT JOIN documents d ON c.id = d.collection_id GROUP BY c.id) ORDER BY doc_count DESC"
        )
        collection_stats = cursor.fetchall()
        conn.close()

        return {
            "total_collections": total_collections,
            "total_documents": total_documents,
            "collections": [{"name": r["name"], "document_count": r["doc_count"]} for r in collection_stats]
        }