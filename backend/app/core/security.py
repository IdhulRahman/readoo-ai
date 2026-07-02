import logging
import bcrypt
from cryptography.fernet import Fernet
from app.core.config import settings

logger = logging.getLogger(__name__)

# Fallback default key generated for smooth out-of-the-box local demo
DEFAULT_KEY = b"TrGBorFNd00aBjsMIfu6IK31Kyfi8blz9Q_HHaHivu8="


def get_fernet():
    key_str = settings.ENCRYPTION_KEY
    if not key_str:
        logger.warning(
            "ENCRYPTION_KEY is not set in environment! Falling back to default key. DO NOT USE IN PRODUCTION."
        )
        return Fernet(DEFAULT_KEY)

    try:
        key_bytes = key_str.strip().encode("utf-8")
        return Fernet(key_bytes)
    except Exception:
        logger.exception("Invalid ENCRYPTION_KEY provided! Falling back to default key.")
        return Fernet(DEFAULT_KEY)


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    pw_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def check_password(password: str, hashed: str) -> bool:
    """Verify password using bcrypt."""
    try:
        pw_bytes = password.encode("utf-8")
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hashed_bytes)
    except Exception:
        logger.exception("Password verification failed")
        return False


def encrypt_api_key(api_key: str) -> str:
    """Encrypt a plain text API key."""
    if not api_key:
        return ""
    try:
        f = get_fernet()
        ciphertext = f.encrypt(api_key.encode("utf-8"))
        return ciphertext.decode("utf-8")
    except Exception:
        logger.exception("Failed to encrypt API key")
        return ""


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt an encrypted API key."""
    if not ciphertext:
        return ""
    try:
        f = get_fernet()
        plaintext = f.decrypt(ciphertext.encode("utf-8"))
        return plaintext.decode("utf-8")
    except Exception:
        logger.exception("Failed to decrypt API key")
        return ""
