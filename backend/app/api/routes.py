import os
import uuid
import datetime
import logging
import secrets
import sqlite3
import json
import time
import functools
import pandas as pd
from flask import Blueprint, request, jsonify, g, send_from_directory

from app.services.chat_service import ChatService
from app.services.speech_service import SpeechService
from app.infrastructure.database import get_db_connection
from app.core.security import hash_password, check_password, encrypt_api_key, decrypt_api_key

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)

# Initialize services
chat_service = ChatService()
speech_service = SpeechService()

# Setup paths
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STT_DIR = os.path.join(base_dir, "data", "voice", "stt")
TTS_DIR = os.path.join(base_dir, "data", "voice", "tts")
UPLOAD_DIR = os.path.join(base_dir, "data", "uploads")

os.makedirs(STT_DIR, exist_ok=True)
os.makedirs(TTS_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Rate limiter store: rate_limit_store[key] = [timestamp1, timestamp2, ...]
rate_limit_store = {}


def is_rate_limited(key, limit=10, period=60):
    now = time.time()
    if key not in rate_limit_store:
        rate_limit_store[key] = []
    rate_limit_store[key] = [t for t in rate_limit_store[key] if now - t < period]
    if len(rate_limit_store[key]) >= limit:
        return True
    rate_limit_store[key].append(now)
    return False


# ==========================================
# AUTHENTICATION MIDDLEWARE DECORATORS
# ==========================================

def require_auth(role=None):
    def decorator(f):
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Token otorisasi diperlukan"}), 401

            token = auth_header.split(" ")[1]
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute(
                "SELECT user_id, role FROM sessions WHERE token = ?",
                (token,)
            )
            session = cursor.fetchone()
            conn.close()

            if not session:
                return jsonify({"error": "Sesi tidak valid atau telah kedaluwarsa"}), 401

            # Store inside global context
            g.user_id = session["user_id"]
            g.user_role = session["role"]

            if role and g.user_role != role:
                return jsonify({"error": "Akses ditolak: hak akses tidak mencukupi"}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ==========================================
# AUTH API ENDPOINTS
# ==========================================

@api_bp.route("/auth/register", methods=["POST"])
def auth_register():
    payload = request.get_json(silent=True) or {}
    nama_lengkap = payload.get("nama_lengkap", "").strip()
    email = payload.get("email", "").strip()
    password = payload.get("password", "")

    if not nama_lengkap or not email or not password:
        return jsonify({"error": "Nama lengkap, email, dan password wajib diisi"}), 400

    # Password complexity rule validation
    # Min 8 chars, 1 capital letter, 1 number, 1 symbol
    if len(password) < 8:
        return jsonify({"error": "Password minimal harus 8 karakter"}), 400
    if not any(c.isupper() for c in password):
        return jsonify({"error": "Password wajib mengandung huruf kapital"}), 400
    if not any(c.isdigit() for c in password):
        return jsonify({"error": "Password wajib mengandung angka"}), 400
    
    symbols = "~`!@#$%^&*()_-+={[}]|\\:;\"'<,>.?/"
    if not any(c in symbols for c in password):
        return jsonify({"error": "Password wajib mengandung karakter simbol (!@#$...)"}), 400

    hashed = hash_password(password)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (nama_lengkap, email, password_hash, role) VALUES (?, ?, ?, 'user')",
            (nama_lengkap, email, hashed)
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
    email = payload.get("email", "").strip()
    password = payload.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email dan password wajib diisi"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nama_lengkap, password_hash, role FROM users WHERE email = ?",
        (email,)
    )
    user = cursor.fetchone()

    if not user or not check_password(password, user["password_hash"]):
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
@require_auth()
def auth_logout():
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
        # Mocking email reset link output inside console
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


# ==========================================
# USER CHAT & STT API ENDPOINTS (RATE LIMITED)
# ==========================================

@api_bp.route("/chat/text", methods=["POST"])
@require_auth()
def chat_text():
    # Rate limit check (10 req/min/user)
    user_key = f"user_{g.user_id}"
    if is_rate_limited(user_key, limit=10, period=60):
        return jsonify({"error": "Batas request terlampaui. Maksimal 10 request per menit."}), 429

    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Text chat request received from User ID %d", g.user_id)
    return jsonify(chat_service.generate_text_response(message))


@api_bp.route("/chat/avatar", methods=["POST"])
@require_auth()
def chat_avatar():
    # Rate limit check (10 req/min/user)
    user_key = f"user_{g.user_id}"
    if is_rate_limited(user_key, limit=10, period=60):
        return jsonify({"error": "Batas request terlampaui. Maksimal 10 request per menit."}), 429

    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()

    if not message:
        return jsonify({"error": "Message is required"}), 400

    logger.info("Avatar chat request received from User ID %d", g.user_id)
    return jsonify(chat_service.generate_3d_response(message))


@api_bp.route("/transcribe", methods=["POST"])
@require_auth()
def transcribe():
    # Rate limit check (10 req/min/user)
    user_key = f"user_{g.user_id}"
    if is_rate_limited(user_key, limit=10, period=60):
        return jsonify({"error": "Batas request terlampaui. Maksimal 10 request per menit."}), 429

    if "audio_data" not in request.files:
        return jsonify({"error": "Audio file is required"}), 400

    audio_file = request.files["audio_data"]
    filename = f"user_{datetime.datetime.utcnow():%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:4]}.webm"
    file_path = os.path.join(STT_DIR, filename)

    audio_file.save(file_path)

    text = speech_service.transcribe(file_path)
    if not text:
        logger.warning("Empty transcription result")
        return jsonify({"error": "Transcription failed"}), 400

    logger.info("STT completed successfully")
    return jsonify({"text": text})


@api_bp.route("/tts", methods=["POST"])
@require_auth()
def tts_endpoint():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text is required"}), 400

    filename = speech_service.speak(text)
    if not filename:
        logger.error("TTS generation failed")
        return jsonify({"error": "TTS failed"}), 500

    return jsonify({"audio_url": f"/api/audio/{filename}"})


@api_bp.route("/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(TTS_DIR, filename, as_attachment=False)


# ==========================================
# ADMIN SETTINGS & DATASET API ENDPOINTS
# ==========================================

@api_bp.route("/admin/collections", methods=["GET"])
@require_auth(role="admin")
def admin_get_collections():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Query collections and document counts
    cursor.execute("""
        SELECT c.id, c.name, c.embedding_cols, c.display_cols, c.active, c.created_at, COUNT(d.id) as doc_count 
        FROM collections c
        LEFT JOIN documents d ON c.id = d.collection_id
        GROUP BY c.id
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
            "active": r["active"],
            "created_at": r["created_at"],
            "doc_count": r["doc_count"]
        })
    return jsonify(collections)


@api_bp.route("/admin/collections/active/<int:col_id>", methods=["POST"])
@require_auth(role="admin")
def admin_set_active_collection(col_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if exists
    cursor.execute("SELECT id FROM collections WHERE id = ?", (col_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Collection not found"}), 404
        
    cursor.execute("UPDATE collections SET active = 0")
    cursor.execute("UPDATE collections SET active = 1 WHERE id = ?", (col_id,))
    conn.commit()
    conn.close()
    
    # Reload active FAISS index in memory
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


@api_bp.route("/admin/dataset/upload", methods=["POST"])
@require_auth(role="admin")
def admin_upload_dataset():
    if "file" not in request.files:
        return jsonify({"error": "File CSV wajib diunggah"}), 400

    csv_file = request.files["file"]
    if not csv_file.filename.endswith(".csv"):
        return jsonify({"error": "Hanya mendukung file format CSV"}), 400

    temp_filename = f"temp_{uuid.uuid4().hex[:8]}.csv"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    csv_file.save(temp_path)

    # Validate file size (max 5 MB)
    if os.path.getsize(temp_path) > 5 * 1024 * 1024:
        os.remove(temp_path)
        return jsonify({"error": "Ukuran file CSV maksimal adalah 5 MB"}), 400

    try:
        df = pd.read_csv(temp_path)
        headers = list(df.columns)
        
        # Limit preview to 5 rows
        preview_data = df.head(5).fillna("").to_dict(orient="records")
        
        return jsonify({
            "temp_file": temp_filename,
            "headers": headers,
            "preview": preview_data
        })
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"error": f"Gagal membaca file CSV: {e}"}), 400


@api_bp.route("/admin/dataset/import", methods=["POST"])
@require_auth(role="admin")
def admin_import_dataset():
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    embedding_cols = payload.get("embedding_cols", [])
    display_cols = payload.get("display_cols", [])
    temp_file = payload.get("temp_file", "")

    if not name or not embedding_cols or not display_cols or not temp_file:
        return jsonify({"error": "Parameter name, embedding_cols, display_cols, dan temp_file wajib diisi"}), 400

    temp_path = os.path.join(UPLOAD_DIR, temp_file)
    if not os.path.exists(temp_path):
        return jsonify({"error": "Berkas CSV sementara tidak ditemukan di server"}), 400

    try:
        df = pd.read_csv(temp_path)
        
        # Save into SQLite and build FAISS index
        col_id = chat_service.vector_store.add_collection_from_csv(name, embedding_cols, display_cols, df)
        
        # Clean temp file
        os.remove(temp_path)
        
        return jsonify({"success": True, "collection_id": col_id})
    except Exception as e:
        logger.exception("Import dataset failed")
        return jsonify({"error": f"Impor dataset gagal: {e}"}), 500


@api_bp.route("/admin/collections/rebuild/<int:col_id>", methods=["POST"])
@require_auth(role="admin")
def admin_rebuild_faiss(col_id):
    try:
        chat_service.vector_store.rebuild_index(col_id)
        return jsonify({"success": True})
    except Exception as e:
        logger.exception("Failed to rebuild FAISS index")
        return jsonify({"error": str(e)}), 500


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
        sett["llm_api_key"] = "********"  # Send mask
    
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
                continue # Skip overwriting masked key
            else:
                value = encrypt_api_key(value)
                
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
        
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@api_bp.route("/admin/llm/test-connection", methods=["POST"])
@require_auth(role="admin")
def admin_test_llm_connection():
    payload = request.get_json(silent=True) or {}
    provider = payload.get("llm_provider", "").strip().lower()
    model_name = payload.get("llm_model", "").strip()
    api_key = payload.get("llm_api_key", "").strip()

    # Get existing encrypted API key if sent masked
    if api_key == "********":
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = 'llm_api_key'")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            api_key = decrypt_api_key(row["value"])

    model_string = f"{provider}/{model_name}" if "/" not in model_name else model_name

    try:
        import litellm
        litellm.telemetry = False
        
        test_msg = [{"role": "user", "content": "Hello. Return only the single word 'OK'."}]
        
        if provider == "ollama":
            res = litellm.completion(
                model=model_string,
                messages=test_msg,
                api_base=settings.OLLAMA_BASE_URL,
                timeout=10
            )
        else:
            res = litellm.completion(
                model=model_string,
                messages=test_msg,
                api_key=api_key if api_key else None,
                timeout=10
            )
            
        content = res.choices[0].message.content.strip()
        return jsonify({"success": True, "response": content})
    except Exception as e:
        logger.exception("LiteLLM test connection failed")
        return jsonify({"success": False, "error": str(e)}), 500
