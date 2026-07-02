# Readoo AI

[![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)](https://python.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![Flask](https://img.shields.io/badge/Flask-3.0-black?logo=flask)](https://flask.palletsprojects.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Readoo AI** adalah platform asisten AI cerdas berbasis **Retrieval-Augmented Generation (RAG)** dengan dukungan multi-modal — teks, suara, dan avatar 3D. Mendukung berbagai LLM provider (Groq, OpenAI, Gemini, DeepSeek, Ollama) melalui LiteLLM, serta STT/TTS untuk interaksi suara.

---

## ✨ Fitur Unggulan

| Fitur | Deskripsi |
|---|---|
| **🤖 RAG Pipeline** | FAISS semantic search + BM25 keyword search + Reciprocal Rank Fusion + CrossEncoder reranker |
| **🎤 Speech-to-Text** | OpenAI Whisper (lokal) atau Groq Cloud API |
| **🔊 Text-to-Speech** | Edge-TTS (online gratis) atau Supertonic (lokal ONNX) |
| **💬 Streaming Chat** | Server-Sent Events (SSE) — respons real-time seperti ChatGPT |
| **📚 Dataset Kustom** | Upload CSV → embedding otomatis → siap ditanyakan |
| **🌐 Multi-Provider LLM** | Groq, OpenAI, Gemini, DeepSeek, Ollama — konfigurasi via Admin UI |
| **👥 Manajemen User** | Role-based (admin/user), CRUD via Admin Panel |
| **🌙 Dark/Light Mode** | Toggle di seluruh halaman |
| **📱 Responsive** | Mobile-first design dengan sidebar navigasi |
| **⚡ Redis Cache** | Rate limiting, session store, dan caching terdistribusi |

---

## 🏗️ Arsitektur

```
readoo/
├── backend/                    # Python Flask API
│   ├── app/
│   │   ├── api/                # REST API endpoints (modular)
│   │   │   ├── auth.py         # Authentication (register, login, logout)
│   │   │   ├── chat.py         # Chat + streaming SSE + sessions
│   │   │   ├── voice.py        # STT (transcribe) + TTS endpoints
│   │   │   ├── middleware.py   # Auth decorators + rate limiter
│   │   │   └── admin/          # Admin panel endpoints
│   │   ├── core/               # Config, security, logging, validators
│   │   ├── infrastructure/     # Database, vector store, STT, TTS, cache
│   │   └── services/           # Business logic (chat, speech)
│   ├── data/                   # SQLite DB, uploads, voice files, FAISS indices
│   └── main.py                 # Entry point (Waitress WSGI)
├── frontend-react/             # React SPA (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Page-level components
│   │   ├── services/           # API client
│   │   ├── hooks/              # Custom React hooks
│   │   └── types/              # TypeScript type definitions
│   └── vite.config.ts          # Dev server + API proxy
├── tests/                      # Pytest test suite
├── docker-compose.yml          # Orchestration (backend + frontend + redis)
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Redis (opsional, untuk cache terdistribusi)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

cp ../.env.example ../.env
# Edit .env — set GROQ_API_KEY atau provider lain

pip install -r requirements.txt
python main.py
```

Server berjalan di `http://localhost:5000`

### Frontend Setup (Development)

```bash
cd frontend-react
npm install
npm run dev
```

Akses di `http://localhost:3000`

### Docker Deployment

```bash
docker-compose up -d
```

---

## 🔑 Akun Demo

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin` | `admin` |
| **User** | `user` | `user` |

---

## 📋 API Reference

### Authentication
| Method | Endpoint | Deskripsi | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Registrasi user baru | - |
| POST | `/api/auth/login` | Login | - |
| POST | `/api/auth/logout` | Logout | User |
| POST | `/api/auth/forgot-password` | Reset password | - |

### Chat
| Method | Endpoint | Deskripsi | Auth |
|---|---|---|---|
| POST | `/api/chat/text` | Chat dengan RAG | User |
| POST | `/api/chat/stream` | Streaming chat (SSE) | User |
| POST | `/api/chat/avatar` | Chat dengan output speech | User |
| GET | `/api/chat/sessions` | Daftar session | User |
| GET | `/api/chat/sessions/:id/messages` | Pesan dalam session | User |
| DELETE | `/api/chat/sessions/:id` | Hapus session | User |

### Voice
| Method | Endpoint | Deskripsi | Auth |
|---|---|---|---|
| POST | `/api/transcribe` | STT (upload audio) | User |
| POST | `/api/tts` | TTS (text to speech) | User |
| GET | `/api/audio/:file` | Serve file audio | - |

### Admin
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/admin/stats` | Statistik sistem |
| GET | `/api/admin/health` | Health check |
| GET | `/api/admin/collections` | Daftar koleksi |
| POST | `/api/admin/collections/active/:id` | Aktifkan koleksi |
| DELETE | `/api/admin/collections/:id` | Hapus koleksi |
| POST | `/api/admin/dataset/upload` | Upload CSV |
| POST | `/api/admin/dataset/import` | Import dataset |
| GET | `/api/admin/settings` | Lihat pengaturan |
| POST | `/api/admin/settings` | Simpan pengaturan |
| GET | `/api/admin/user-management` | Daftar user |
| POST | `/api/admin/llm/test-connection` | Test koneksi LLM |
| POST | `/api/admin/llm/detect-models` | Deteksi model |

---

## 🧪 Testing

```bash
# Backend tests
cd backend
python -m pytest ../tests/ -v

# Dengan coverage
python -m pytest ../tests/ --cov=app -v
```

---

## ⚙️ Konfigurasi Lingkungan

Buat file `.env` dari template `.env.example`:

```env
# Server
PORT=3000
PYTHON_HOST=127.0.0.1
PYTHON_PORT=5000

# Keamanan
ENCRYPTION_KEY=your_fernet_key_here

# LLM Provider (groq | openai | gemini | deepseek | ollama)
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama3-8b-8192

# RAG
EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
USE_RERANKER=false

# TTS
TTS_PROVIDER=edge-tts
TTS_VOICE=id-ID-GadisNeural

# Redis (opsional)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 🛠️ Tech Stack

### Backend
- **Framework**: Flask 3.0
- **WSGI**: Waitress (production)
- **Vector Search**: FAISS + SentenceTransformers
- **LLM**: LiteLLM (multi-provider)
- **STT**: OpenAI Whisper / Groq API
- **TTS**: Edge-TTS / Supertonic
- **Database**: SQLite (dev) — siap migrasi ke PostgreSQL
- **Cache**: Redis (dengan fallback in-memory)
- **Validasi**: Pydantic

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite 6
- **Bahasa**: TypeScript 5.6
- **Styling**: Tailwind CSS 3.4
- **Icons**: Lucide React
- **Routing**: React Router 6

---

## 📊 RAG Pipeline

```
User Query
    │
    ├── FAISS Semantic Search (top-20)
    ├── BM25 Keyword Search (top-20)
    │
    └── Reciprocal Rank Fusion (RRF)
            │
            └── CrossEncoder Reranker (top-5) [opsional]
                    │
                    └── Context Formatting
                            │
                            └── LLM Completion (LiteLLM)
                                    │
                                    └── Response + Items
```

---

## 🤝 Kontribusi

1. Fork repository
2. Buat branch fitur (`git checkout -b feature/fitur-keren`)
3. Commit perubahan (`git commit -m 'feat: tambah fitur keren'`)
4. Push ke branch (`git push origin feature/fitur-keren`)
5. Buka Pull Request

---

## 📄 Lisensi

MIT License — lihat file [LICENSE](LICENSE) untuk detail.

---

## 👨‍💻 Author

**Idhul Rahman** — [GitHub](https://github.com/IdhulRahman)