import os
import sqlite3
import logging
import bcrypt
from datetime import datetime

logger = logging.getLogger(__name__)

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
DB_PATH = os.path.join(DB_DIR, "readoo.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama_lengkap TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
    )
    """)

    # Create sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Create collections table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        embedding_cols TEXT NOT NULL,  -- JSON string of list
        display_cols TEXT NOT NULL,    -- JSON string of list
        active INTEGER DEFAULT 0,      -- 1 if active, 0 otherwise
        created_at TEXT NOT NULL
    )
    """)

    # Create documents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        content TEXT NOT NULL,          -- Compiled text for embedding
        metadata TEXT NOT NULL,         -- JSON string of row dict
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    )
    """)

    # Create settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    # Insert default settings if not exist
    default_settings = [
        ("assistant_name", "Aiko"),
        ("greeting_message", "Halo! Saya asisten AI Anda. Ada yang bisa saya bantu hari ini?"),
        ("system_prompt", "Kamu adalah asisten AI bernama {name} yang ramah. Jawab pertanyaan pengguna menggunakan konteks berikut:\n\n{context}\n\nPertanyaan pengguna: {query}\n\nJawablah dengan sopan, informatif, dan ringkas dalam bahasa Indonesia."),
        ("llm_provider", "groq"),
        ("llm_model", "llama3-8b-8192"),
        ("llm_api_key", ""),  # Encrypted Fernet key
        ("tts_language", "id-ID"),
        ("tts_voice", "id-ID-GadisNeural"),
        ("tts_provider", "edge-tts")
    ]
    for key, value in default_settings:
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, value))

    # Insert seed users if not exist (using 'admin' and 'user' as emails for direct easy login)
    cursor.execute("SELECT id FROM users WHERE email = 'admin'")
    if not cursor.fetchone():
        admin_pass = bcrypt.hashpw(b"admin", bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (nama_lengkap, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("Administrator", "admin", admin_pass, "admin")
        )
        logger.info("Default admin user seeded")

    cursor.execute("SELECT id FROM users WHERE email = 'user'")
    if not cursor.fetchone():
        user_pass = bcrypt.hashpw(b"user", bcrypt.gensalt()).decode("utf-8")
        cursor.execute(
            "INSERT INTO users (nama_lengkap, email, password_hash, role) VALUES (?, ?, ?, ?)",
            ("User Demo", "user", user_pass, "user")
        )
        logger.info("Default demo user seeded")

    conn.commit()
    conn.close()
    logger.info("Database initialized successfully at %s", DB_PATH)
