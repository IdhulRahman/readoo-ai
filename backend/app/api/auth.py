import secrets
import datetime
import logging
import sqlite3
from flask import request, jsonify

from app.api import api_bp
from app.infrastructure.database import get_db_connection
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

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (nama_lengkap, email, password_hash, role) VALUES (?, ?, ?, 'user')",
            (data.nama_lengkap, data.email, hashed)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Email sudah terdaftar"}), 400

    conn.close()
    return jsonify({"success": True, "message": "Pendaftaran berhasil"}), 201


@api_bp.route("/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    
    try:
        data = LoginRequest(**payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nama_lengkap, password_hash, role FROM users WHERE email = ?",
        (data.email,)
    )
    user = cursor.fetchone()

    if not user or not check_password(data.password, user["password_hash"]):
        conn.close()
        return jsonify({"error": "Email atau password salah"}), 401

    token = secrets.token_hex(32)
    now = datetime.datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, role, created_at) VALUES (?, ?, ?, ?)",
        (token, user["id"], user["role"], now)
    )
    conn.commit()
    conn.close()

    return jsonify({
        "token": token,
        "role": user["role"],
        "nama_lengkap": user["nama_lengkap"]
    })


@api_bp.route("/auth/logout", methods=["POST"])
def auth_logout():
    from app.api.middleware import require_auth
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ")[1]
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})


@api_bp.route("/auth/forgot-password", methods=["POST"])
def auth_forgot_password():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email", "").strip()

    if not email:
        return jsonify({"error": "Email wajib diisi"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()

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