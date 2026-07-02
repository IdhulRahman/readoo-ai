import logging
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.infrastructure.database import get_db_connection
from app.core.security import encrypt_api_key

logger = logging.getLogger(__name__)


@api_bp.route("/admin/settings", methods=["GET"])
@require_auth(role="admin")
def admin_get_settings():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()

    sett = {r["key"]: r["value"] for r in rows}
    
    # Mask API key for security
    api_key = sett.get("llm_api_key", "")
    if api_key:
        sett["llm_api_key"] = "********"
    
    return jsonify(sett)


@api_bp.route("/admin/settings", methods=["POST"])
@require_auth(role="admin")
def admin_save_settings():
    payload = request.get_json(silent=True) or {}
    
    conn = get_db_connection()
    cursor = conn.cursor()

    for key, value in payload.items():
        if key == "llm_api_key":
            if value == "********":
                continue  # Skip overwriting masked key
            else:
                value = encrypt_api_key(value)
                
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
        
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@api_bp.route("/admin/health", methods=["GET"])
@require_auth(role="admin")
def admin_health_check():
    """System health check endpoint."""
    import time
    
    health = {
        "status": "healthy",
        "timestamp": time.time(),
        "checks": {}
    }
    
    # Database check
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM settings")
        health["checks"]["database"] = {"status": "ok", "settings_count": cursor.fetchone()["cnt"]}
        conn.close()
    except Exception as e:
        health["checks"]["database"] = {"status": "error", "error": str(e)}
        health["status"] = "degraded"
    
    # Vector store check
    try:
        from app.services.chat_service import ChatService
        vs = ChatService().vector_store
        health["checks"]["vector_store"] = {
            "status": "ok",
            "active_collection": vs.active_collection_id,
            "index_loaded": vs.index is not None
        }
    except Exception as e:
        health["checks"]["vector_store"] = {"status": "error", "error": str(e)}
        health["status"] = "degraded"
    
    return jsonify(health)


@api_bp.route("/admin/user-management", methods=["GET"])
@require_auth(role="admin")
def admin_get_users():
    """Get all users for management."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nama_lengkap, email, role FROM users ORDER BY id ASC"
    )
    rows = cursor.fetchall()
    conn.close()
    
    users = []
    for r in rows:
        users.append({
            "id": r["id"],
            "nama_lengkap": r["nama_lengkap"],
            "email": r["email"],
            "role": r["role"]
        })
    
    return jsonify(users)


@api_bp.route("/admin/user-management/<int:user_id>", methods=["DELETE"])
@require_auth(role="admin")
def admin_delete_user(user_id):
    """Delete a user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "User not found"}), 404
    
    cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})


@api_bp.route("/admin/user-management/<int:user_id>/role", methods=["POST"])
@require_auth(role="admin")
def admin_update_user_role(user_id):
    """Update user role."""
    payload = request.get_json(silent=True) or {}
    new_role = payload.get("role", "").strip()
    
    if new_role not in ("user", "admin"):
        return jsonify({"error": "Role must be 'user' or 'admin'"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "User not found"}), 404
    
    cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})


@api_bp.route("/admin/stats", methods=["GET"])
@require_auth(role="admin")
def admin_get_stats():
    """Get system statistics for admin dashboard."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    total_users = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM collections")
    total_collections = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM documents")
    total_documents = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT COUNT(*) as cnt FROM sessions")
    active_sessions = cursor.fetchone()["cnt"]
    
    cursor.execute("SELECT name, doc_count FROM (SELECT c.name, COUNT(d.id) as doc_count FROM collections c LEFT JOIN documents d ON c.id = d.collection_id GROUP BY c.id) ORDER BY doc_count DESC")
    collection_stats = cursor.fetchall()
    
    conn.close()
    
    return jsonify({
        "total_users": total_users,
        "total_collections": total_collections,
        "total_documents": total_documents,
        "active_sessions": active_sessions,
        "collections": [{"name": r["name"], "document_count": r["doc_count"]} for r in collection_stats]
    })