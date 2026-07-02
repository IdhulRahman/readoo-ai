# Changelog

All notable changes to Readoo AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-03

### Added
- **Modular Backend Architecture** — routes.py (651 baris) dipecah menjadi 8 file terpisah
  - `auth.py`, `chat.py`, `voice.py`, `middleware.py`
  - `admin/collections.py`, `admin/dataset.py`, `admin/settings.py`, `admin/llm.py`
- **Pydantic Validation** — validasi request/response dengan tipe data yang ketat
- **Persistent Chat History** — tabel `chat_history` dan `chat_sessions` di SQLite
- **Server-Sent Events (SSE)** — streaming response real-time untuk chat
- **React Frontend** — migrasi dari HTML statis ke React + Vite + TypeScript + Tailwind CSS
  - Login, Register, Forgot Password, Chat, Admin pages
  - Dark/Light mode toggle
  - Responsive mobile-first design
  - Sidebar riwayat chat
  - Voice recording dari browser
  - Streaming chat UI
- **Admin Dashboard** — 7 tab panel
  - Dashboard statistik (users, collections, documents, sessions)
  - Manajemen koleksi data
  - Upload & import dataset CSV dengan preview
  - Pengaturan sistem (nama asisten, prompt, LLM, TTS)
  - Manajemen user (CRUD, role assignment)
  - Test koneksi LLM dengan auto-detect models
  - Test suara TTS
- **Cache Layer** — Redis dengan fallback in-memory
  - Rate limiting berbasis cache
  - Session caching untuk auth
  - Auto-detect Redis availability
- **Testing** — Pytest test suite (21 tests: 9 auth + 12 validators)
- **Docker Optimization** — multi-stage build untuk frontend
- **Nginx Configuration** — production-ready dengan gzip, security headers, SPA routing
- **Professional Documentation** — README lengkap, CHANGELOG, struktur arsitektur

### Changed
- `routes.py` → dihapus, diganti modul modular
- `frontend/` (HTML statis) → diganti `frontend-react/` (React SPA)
- `docker-compose.yml` — tambah service Redis
- `app/__init__.py` — tambah global error handlers (404, 405, 500)

### Fixed
- Test register menggunakan unique email untuk mencegah konflik
- Voice recording import path diperbaiki
- Global `g.user_id` usage di chat service

### Security
- API key terenkripsi dengan Fernet di database
- Password di-hash dengan bcrypt
- Session token dengan secrets.token_hex(32)
- Authorization middleware dengan role checking