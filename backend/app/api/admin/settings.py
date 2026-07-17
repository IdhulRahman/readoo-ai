import logging
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.repositories.user_repository import UserRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.settings_repository import SettingsRepository
from app.repositories.collection_repository import CollectionRepository
from app.core.security import encrypt_api_key

logger = logging.getLogger(__name__)


@api_bp.route("/admin/settings", methods=["GET"])
@require_auth(role="admin")
def admin_get_settings():
    sett = SettingsRepository.get_all_settings()
    
    # Mask API key for security
    api_key = sett.get("llm_api_key", "")
    if api_key:
        sett["llm_api_key"] = "********"
    
    return jsonify(sett)


@api_bp.route("/admin/settings", methods=["POST"])
@require_auth(role="admin")
def admin_save_settings():
    payload = request.get_json(silent=True) or {}
    
    updates = {}
    for key, value in payload.items():
        if key == "llm_api_key":
            if value == "********":
                continue  # Skip overwriting masked key
            else:
                value = encrypt_api_key(value)
        updates[key] = str(value)
                
    if updates:
        SettingsRepository.save_settings(updates)
        
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
        settings_dict = SettingsRepository.get_all_settings()
        health["checks"]["database"] = {"status": "ok", "settings_count": len(settings_dict)}
    except Exception as e:
        health["checks"]["database"] = {"status": "error", "error": str(e)}
        health["status"] = "degraded"
    
    # Vector store check
    try:
        from app.services.chat_service import get_chat_service
        vs = get_chat_service().vector_store
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
    rows = UserRepository.get_all_users()
    
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
    success = UserRepository.delete_user(user_id)
    if not success:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({"success": True})


@api_bp.route("/admin/user-management/<int:user_id>/role", methods=["POST"])
@require_auth(role="admin")
def admin_update_user_role(user_id):
    """Update user role."""
    payload = request.get_json(silent=True) or {}
    new_role = payload.get("role", "").strip()
    
    if new_role not in ("user", "admin"):
        return jsonify({"error": "Role must be 'user' or 'admin'"}), 400
    
    success = UserRepository.update_user_role(user_id, new_role)
    if not success:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({"success": True})


@api_bp.route("/admin/stats", methods=["GET"])
@require_auth(role="admin")
def admin_get_stats():
    """Get system statistics for admin dashboard."""
    try:
        users = UserRepository.get_all_users()
        total_users = len(users)
        
        col_stats = CollectionRepository.get_stats()
        active_sessions = SessionRepository.get_active_session_count()
        
        return jsonify({
            "total_users": total_users,
            "total_collections": col_stats["total_collections"],
            "total_documents": col_stats["total_documents"],
            "active_sessions": active_sessions,
            "collections": col_stats["collections"]
        })
    except Exception as e:
        logger.exception("Failed to get stats")
        return jsonify({"error": str(e)}), 500

@api_bp.route("/settings/public", methods=["GET"])
@require_auth()
def get_public_settings():
    """Endpoint publik (semua user login) untuk info identitas asisten saja."""
    keys = ["assistant_name", "assistant_job", "greeting_message", "avatar_gender"]
    sett = SettingsRepository.get_settings_by_keys(keys)
    return jsonify({
        "assistant_name": sett.get("assistant_name") or "Aiko",
        "assistant_job": sett.get("assistant_job") or "",
        "greeting_message": sett.get("greeting_message") or "",
        "avatar_gender": sett.get("avatar_gender") or "female",
    })