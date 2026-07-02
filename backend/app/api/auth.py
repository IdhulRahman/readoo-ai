import secrets
import datetime
import logging
from flask import request, jsonify

from app.api import api_bp
from app.repositories.user_repository import UserRepository
from app.repositories.session_repository import SessionRepository
from app.core.security import hash_password, check_password
from app.core.validators import RegisterRequest, LoginRequest

logger = logging.getLogger(__name__)


@api_bp.route("/auth/register", methods=["POST"])
def auth_register():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = RegisterRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    hashed = hash_password(data.password)

    success = UserRepository.create_user(data.nama_lengkap, data.email, hashed, "user")
    if not success:
        return jsonify({"error": "Email sudah terdaftar"}), 400

    return jsonify({"success": True, "message": "Pendaftaran berhasil"}), 201


@api_bp.route("/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = LoginRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    user = UserRepository.get_user_by_email(data.email)

    if not user or not check_password(data.password, user["password_hash"]):
        return jsonify({"error": "Email atau password salah"}), 401

    token = secrets.token_hex(32)
    now = datetime.datetime.now().isoformat()
    SessionRepository.create_session(token, user["id"], user["role"], now)

    return jsonify({
        "token": token,
        "role": user["role"],
        "nama_lengkap": user["nama_lengkap"]
    })


@api_bp.route("/auth/logout", methods=["POST"])
def auth_logout():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Token otorisasi diperlukan"}), 401
    token = auth_header.split(" ")[1]
    
    SessionRepository.delete_session(token)
    
    return jsonify({"success": True})


@api_bp.route("/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip()

    if not email:
        return jsonify({"error": "Email wajib diisi"}), 400

    user = UserRepository.get_user_by_email(email)

    if user:
        reset_token = secrets.token_hex(16)
        logger.info(
            "\n======================================================\n"
            "MOCK PASSWORD RESET SENT:\n"
            "Email: %s\n"
            "Link: http://localhost:3000/login?reset_token=%s\n"
            "======================================================\n",
            email, reset_token
        )

    return jsonify({
        "success": True,
        "message": "Link pemulihan password telah dikirim ke email Anda (Silakan cek log terminal/console)."
    })


from app.api.middleware import require_auth
from flask import g

@api_bp.route("/auth/change-password", methods=["POST"])
@require_auth()
def auth_change_password():
    payload = request.get_json(silent=True) or {}
    old_password = payload.get("old_password", "").strip()
    new_password = payload.get("new_password", "").strip()

    if not old_password or not new_password:
        return jsonify({"error": "Password lama dan baru wajib diisi"}), 400

    user = UserRepository.get_user_by_id(g.user_id)
    if not user or not check_password(old_password, user["password_hash"]):
        return jsonify({"error": "Password lama salah"}), 400

    hashed = hash_password(new_password)
    UserRepository.update_user_password(g.user_id, hashed)

    return jsonify({"success": True, "message": "Password berhasil diubah"})