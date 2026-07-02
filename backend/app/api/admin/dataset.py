import os
import uuid
import logging
import json
import pandas as pd
from flask import request, jsonify

from app.api import api_bp
from app.api.middleware import require_auth
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)
chat_service = ChatService()

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
UPLOAD_DIR = os.path.join(base_dir, "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def extract_text_from_pdf(file_path):
    import pypdf
    reader = pypdf.PdfReader(file_path)
    pages_text = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages_text.append((i + 1, text))
    return pages_text


def chunk_text(pages_text, chunk_size=800, overlap=150):
    chunks = []
    for page_num, text in pages_text:
        text_len = len(text)
        start = 0
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end].strip()
            if chunk:
                chunks.append({
                    "content": chunk,
                    "metadata": {
                        "page": page_num,
                        "text": chunk
                    }
                })
            start += (chunk_size - overlap)
    return chunks


@api_bp.route("/admin/dataset/upload", methods=["POST"])
@require_auth(role="admin")
def admin_upload_dataset():
    if "file" not in request.files:
        return jsonify({"error": "Berkas wajib diunggah"}), 400

    uploaded_file = request.files["file"]
    filename = uploaded_file.filename
    ext = os.path.splitext(filename)[1].lower()

    allowed_exts = [".csv", ".xlsx", ".xls", ".pdf", ".txt"]
    if ext not in allowed_exts:
        return jsonify({"error": f"Format file tidak didukung. Dukungan: {', '.join(allowed_exts)}"}), 400

    temp_filename = f"temp_{uuid.uuid4().hex[:8]}{ext}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    uploaded_file.save(temp_path)

    # Validate file size (max 10 MB)
    if os.path.getsize(temp_path) > 10 * 1024 * 1024:
        os.remove(temp_path)
        return jsonify({"error": "Ukuran file maksimal adalah 10 MB"}), 400

    try:
        if ext in [".csv", ".xlsx", ".xls"]:
            # Structured data
            if ext == ".csv":
                df = pd.read_csv(temp_path)
            else:
                df = pd.read_excel(temp_path)

            headers = [str(c).strip() for c in df.columns]
            preview_data = df.head(10).fillna("").to_dict(orient="records")

            return jsonify({
                "file_type": "structured",
                "temp_file": temp_filename,
                "headers": headers,
                "preview": preview_data,
                "total_rows": len(df)
            })

        elif ext == ".pdf":
            # PDF file
            pages_text = extract_text_from_pdf(temp_path)
            full_text = " ".join([txt for _, txt in pages_text])
            preview_text = full_text[:1000]

            return jsonify({
                "file_type": "unstructured",
                "temp_file": temp_filename,
                "preview_text": preview_text,
                "total_pages": len(pages_text),
                "total_chars": len(full_text)
            })

        else:
            # TXT file
            with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
                full_text = f.read()
            preview_text = full_text[:1000]

            return jsonify({
                "file_type": "unstructured",
                "temp_file": temp_filename,
                "preview_text": preview_text,
                "total_pages": 1,
                "total_chars": len(full_text)
            })

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.exception("Failed to parse uploaded dataset")
        return jsonify({"error": f"Gagal membaca file: {e}"}), 400


@api_bp.route("/admin/dataset/import", methods=["POST"])
@require_auth(role="admin")
def admin_import_dataset():
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", "").strip()
    temp_file = payload.get("temp_file", "")
    file_type = payload.get("file_type", "structured")

    if not name or not temp_file:
        return jsonify({"error": "Parameter name dan temp_file wajib diisi"}), 400

    temp_path = os.path.join(UPLOAD_DIR, temp_file)
    if not os.path.exists(temp_path):
        return jsonify({"error": "Berkas sementara tidak ditemukan di server"}), 400

    ext = os.path.splitext(temp_file)[1].lower()

    try:
        if file_type == "structured" or ext in [".csv", ".xlsx", ".xls"]:
            embedding_cols = payload.get("embedding_cols", [])
            display_cols = payload.get("display_cols", [])

            if not embedding_cols or not display_cols:
                return jsonify({"error": "Kolom embedding dan display wajib dipilih untuk data terstruktur"}), 400

            if ext == ".csv":
                df = pd.read_csv(temp_path)
            else:
                df = pd.read_excel(temp_path)

            col_id = chat_service.vector_store.add_collection_from_csv(name, embedding_cols, display_cols, df)
            doc_count = len(df)

        else:
            # Unstructured text import (PDF, TXT)
            if ext == ".pdf":
                pages_text = extract_text_from_pdf(temp_path)
            else:
                with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
                    pages_text = [(1, f.read())]

            chunks = chunk_text(pages_text)
            if not chunks:
                return jsonify({"error": "Tidak ada konten teks yang dapat diekstraksi dari dokumen"}), 400

            col_id = chat_service.vector_store.add_collection_from_unstructured(name, chunks, temp_file)
            doc_count = len(chunks)

        # Clean temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

        return jsonify({
            "success": True,
            "collection_id": col_id,
            "document_count": doc_count
        })
    except Exception as e:
        logger.exception("Import dataset failed")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"error": f"Impor dataset gagal: {e}"}), 500


@api_bp.route("/admin/dataset/export/<int:col_id>", methods=["GET"])
@require_auth(role="admin")
def admin_export_dataset(col_id):
    """Export collection documents as JSON."""
    from app.repositories.collection_repository import CollectionRepository
    import json
    
    col = CollectionRepository.get_collection(col_id)
    if not col:
        return jsonify({"error": "Collection not found"}), 404
    
    rows = CollectionRepository.get_documents_by_collection(col_id)
    
    documents = [json.loads(r["metadata"]) for r in rows]
    
    return jsonify({
        "collection_name": col["name"],
        "documents": documents,
        "total": len(documents)
    })