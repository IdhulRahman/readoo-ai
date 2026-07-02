import os
from dotenv import load_dotenv

# Load .env file from root directory
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(base_dir, ".env"))


class Settings:
    # Server configuration
    PORT: int = int(os.getenv("PYTHON_PORT", 5000))
    HOST: str = os.getenv("PYTHON_HOST", "0.0.0.0")
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

    # LLM configuration
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq").lower()
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama3-8b-8192")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openai/gpt-3.5-turbo")

    # RAG configuration
    USE_RERANKER: bool = os.getenv("USE_RERANKER", "false").lower() == "true"
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
    RERANKER_MODEL: str = os.getenv("RERANKER_MODEL", "jinaai/jina-reranker-v2-base-multilingual")
    RERANK_THRESHOLD: float = float(os.getenv("RERANK_THRESHOLD", 0.45))

    # Voice & Audio configuration
    TTS_PROVIDER: str = os.getenv("TTS_PROVIDER", "edge-tts").lower()
    TTS_VOICE: str = os.getenv("TTS_VOICE", "id-ID-GadisNeural")
    TTS_RATE: str = os.getenv("TTS_RATE", "+0%")
    SUPERTONIC_VOICE: str = os.getenv("SUPERTONIC_VOICE", "W1")
    WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
    GROQ_STT_API_KEY: str = os.getenv("GROQ_STT_API_KEY", "")

    # Prompts configuration
    PROMPT_TEXT_MODE: str = os.getenv(
        "PROMPT_TEXT_MODE",
        "Kamu adalah asisten perpustakaan Telkom University bernama Aiko yang ramah. Bantu pengguna menemukan buku berdasarkan data berikut:\n\n{context_str}\n\nPertanyaan pengguna: {user_msg}\n\nJawablah dengan sopan dan informatif dalam bahasa Indonesia."
    )
    PROMPT_3D_GREETING: str = os.getenv(
        "PROMPT_3D_GREETING",
        "Kamu adalah asisten perpustakaan Telkom University bernama Aiko. Sapa pengguna dengan ramah dan tawarkan bantuan untuk mencari buku. Jawab dengan sangat singkat (maksimal 2 kalimat) karena jawabanmu akan dibacakan oleh avatar."
    )
    PROMPT_3D_SEARCH: str = os.getenv(
        "PROMPT_3D_SEARCH",
        "Kamu adalah asisten perpustakaan Telkom University bernama Aiko. Beritahu pengguna secara singkat (maksimal 2 kalimat) bahwa buku yang relevan telah ditemukan di bawah ini. Buku: {context_str}."
    )
    PROMPT_CLASSIFIER: str = os.getenv(
        "PROMPT_CLASSIFIER",
        "Apakah pesan pengguna berikut adalah salam pembuka (seperti halo, hai, selamat pagi, dll) atau basa-basi awal? Jawab hanya dengan kata YES jika ya, atau NO jika tidak. Teks: {text}"
    )


settings = Settings()
