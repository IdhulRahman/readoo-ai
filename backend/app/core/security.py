import logging
import bcrypt
from cryptography.fernet import Fernet
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_fernet():
    key_str = settings.ENCRYPTION_KEY
    if not key_str:
        raise RuntimeError(
            "ENCRYPTION_KEY is missing. Set it in your .env file before running the app."
        )
    try:
        key_bytes = key_str.strip().encode("utf-8")
        return Fernet(key_bytes)
    except Exception:
        logger.exception("Invalid ENCRYPTION_KEY provided in .env file!")
        raise RuntimeError(
            "ENCRYPTION_KEY in .env is invalid. Generate a new one with Fernet.generate_key()."
        )


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
    f = get_fernet()
    ciphertext = f.encrypt(api_key.encode("utf-8"))
    return ciphertext.decode("utf-8")


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt an encrypted API key."""
    if not ciphertext:
        return ""
    f = get_fernet()
    plaintext = f.decrypt(ciphertext.encode("utf-8"))
    return plaintext.decode("utf-8")