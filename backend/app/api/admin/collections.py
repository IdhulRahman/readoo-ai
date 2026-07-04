import json
import logging
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.services.chat_service import ChatService
from app.repositories.collection_repository import CollectionRepository

logger = logging.getLogger(__name__)

chat_service = ChatService()


@api_bp.route("/admin/collections", methods=["GET"])
@require_auth(role="admin")
def admin_get_collections():
    rows = CollectionRepository.get_all_collections()

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
    success = CollectionRepository.set_active_collection(col_id)
    if not success:
        return jsonify({"error": "Collection not found"}), 404
        
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
    rows = CollectionRepository.get_documents_by_collection(col_id)
    
    documents = []
    for r in rows:
        doc = json.loads(r["metadata"])
        doc["id"] = r["id"]
        documents.append(doc)
    
    return jsonify(documents)


@api_bp.route("/admin/documents/<int:doc_id>", methods=["DELETE"])
@require_auth(role="admin")
def admin_delete_document(doc_id):
    """Delete a single document from a collection incrementally."""
    row = CollectionRepository.get_document(doc_id)
    if not row:
        return jsonify({"error": "Document not found"}), 404
    
    collection_id = row["collection_id"]
    CollectionRepository.delete_document(doc_id)
    
    # Remove from FAISS index incrementally
    chat_service.vector_store.delete_document_from_index(collection_id, doc_id)
    
    return jsonify({"success": True})


@api_bp.route("/admin/collections/<int:col_id>/documents", methods=["POST"])
@require_auth(role="admin")
def admin_add_document(col_id):
    """Add a single document to a collection incrementally."""
    payload = request.get_json(silent=True) or {}
    
    col = CollectionRepository.get_collection(col_id)
    if not col:
        return jsonify({"error": "Collection not found"}), 404
        
    embedding_cols = json.loads(col["embedding_cols"])
    
    # Extract content based on embedding_cols
    content_parts = []
    for col_name in embedding_cols:
        if col_name in payload:
            content_parts.append(str(payload[col_name]))
    content = " ".join(content_parts).strip()
    
    if not content:
        return jsonify({"error": "Konten untuk kolom embedding tidak boleh kosong."}), 400
        
    # Insert to database
    doc_id = CollectionRepository.create_document(col_id, content, json.dumps(payload))
    if not doc_id:
        return jsonify({"error": "Gagal menambahkan dokumen ke database"}), 500
        
    # Add incrementally to FAISS index
    chat_service.vector_store.add_document_to_index(col_id, doc_id, content)
    
    return jsonify({"success": True, "id": doc_id})