"""Authentication middleware and rate limiting utilities."""
import functools
import logging
from typing import Optional, Callable
from flask import request, jsonify, g

from app.infrastructure.database import get_db_connection
from app.infrastructure.cache import is_rate_limited, cache_session, get_cached_session, delete_cached_session

logger = logging.getLogger(__name__)


def require_auth(role: Optional[str] = None) -> Callable:
    """Decorator to require authentication and optional role check."""
    def decorator(f: Callable) -> Callable:
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Token otorisasi diperlukan"}), 401

            token = auth_header.split(" ")[1]
            
            # Try cache first
            cached = get_cached_session(token)
            if cached:
                g.user_id = cached["user_id"]
                g.user_role = cached["role"]
                if role and g.user_role != role:
                    return jsonify({"error": "Akses ditolak: hak akses tidak mencukupi"}), 403
                return f(*args, **kwargs)
            
            # Fallback to database
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

            g.user_id = session["user_id"]
            g.user_role = session["role"]
            
            # Cache for future requests
            cache_session(token, g.user_id, g.user_role)

            if role and g.user_role != role:
                return jsonify({"error": "Akses ditolak: hak akses tidak mencukupi"}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def require_rate_limit(limit: int = 10, period: int = 60) -> Callable:
    """Decorator to apply rate limiting using cache backend."""
    def decorator(f: Callable) -> Callable:
        @functools.wraps(f)
        def decorated_function(*args, **kwargs):
            user_key = f"user_{g.get('user_id', 'anonymous')}"
            if is_rate_limited(user_key, limit=limit, period=period):
                return jsonify({"error": f"Batas request terlampaui. Maksimal {limit} request per {period} detik."}), 429
            return f(*args, **kwargs)
        return decorated_function
    return decorator