import json
import logging
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.services.chat_service import ChatService
from app.infrastructure.database import get_db_connection

logger = logging.getLogger(__name__)

chat_service = ChatService()


@api_bp.route("/admin/collections", methods=["GET"])
@require_auth(role="admin")
def admin_get_collections():
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

    collections = []
    for r in rows:
        collections.append({
            "id": r["id"],
            "name": r["name"],
            "embedding_cols": json.loads(r["embedding_cols"]),
            "display_cols": json.loads(r["display_cols"]),
            "active": bool(r["active"]),
            "created_at": r["created_at"],
            "doc_count": r["doc_count"]
        })
    return jsonify(collections)


@api_bp.route("/admin/collections/active/<int:col_id>", methods=["POST"])
@require_auth(role="admin")
def admin_set_active_collection(col_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM collections WHERE id = ?", (col_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Collection not found"}), 404
        
    cursor.execute("UPDATE collections SET active = 0")
    cursor.execute("UPDATE collections SET active = 1 WHERE id = ?", (col_id,))
    conn.commit()
    conn.close()
    
    chat_service.vector_store.load_active_collection()
    
    return jsonify({"success": True})


@api_bp.route("/admin/collections/<int:col_id>", methods=["DELETE"])
@require_auth(role="admin")
def admin_delete_collection(col_id):
    try:
        chat_service.vector_store.delete_collection(col_id)
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Failed to delete collection")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/admin/collections/rebuild/<int:col_id>", methods=["POST"])
@require_auth(role="admin")
def admin_rebuild_faiss(col_id):
    try:
        chat_service.vector_store.rebuild_index(col_id)
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Failed to rebuild FAISS index")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/admin/collections/<int:col_id>/documents", methods=["GET"])
@require_auth(role="admin")
def admin_get_collection_documents(col_id):
    """Get all documents in a collection for preview/edit."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, metadata FROM documents WHERE collection_id = ?",
        (col_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    documents = []
    for r in rows:
        doc = json.loads(r["metadata"])
        doc["id"] = r["id"]
        documents.append(doc)
    
    return jsonify(documents)


@api_bp.route("/admin/documents/<int:doc_id>", methods=["DELETE"])
@require_auth(role="admin")
def admin_delete_document(doc_id):
    """Delete a single document from a collection."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT collection_id FROM documents WHERE id = ?", (doc_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Document not found"}), 404
    
    collection_id = row["collection_id"]
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
    
    # Rebuild index for this collection
    chat_service.vector_store.rebuild_index(collection_id)
    
    return jsonify({"success": True})