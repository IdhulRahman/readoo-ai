import React, { useState } from 'react';
import { Upload, Check, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { admin } from '../../services/api';

interface DatasetUploadTabProps {
  onSuccess: () => void;
}

interface UploadResponse {
  file_type: 'structured' | 'unstructured';
  temp_file: string;
  // structured only:
  headers?: string[];
  preview?: Record<string, unknown>[];
  total_rows?: number;
  // unstructured only:
  preview_text?: string;
  total_pages?: number;
  total_chars?: number;
}

export const DatasetUploadTab: React.FC<DatasetUploadTabProps> = ({ onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadResponse | null>(null);
  const [embeddingCols, setEmbeddingCols] = useState<string[]>([]);
  const [displayCols, setDisplayCols] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const data = await admin.uploadDataset(file);
      setPreview(data);
      if (data.file_type === 'structured' && data.headers) {
        setEmbeddingCols(data.headers);
        setDisplayCols(data.headers);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const payload: any = {
        name,
        temp_file: preview.temp_file,
        file_type: preview.file_type,
      };

      if (preview.file_type === 'structured') {
        payload.embedding_cols = embeddingCols;
        payload.display_cols = displayCols;
      }

      await admin.importDataset(payload);
      setPreview(null);
      setFile(null);
      setName('');
      onSuccess();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Import gagal');
    } finally {
      setLoading(false);
    }
  };

  const toggleCol = (col: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(col)) setList(list.filter((c) => c !== col));
    else setList([...list, col]);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Upload Dataset Dokumen RAG</h2>
      {!preview ? (
        <Card>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Pilih Berkas Dataset (Dukungan: CSV, XLSX, XLS, PDF, TXT)
          </label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mb-4 block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-gray-700 dark:file:text-gray-200"
          />
          <Button
            onClick={handleUpload}
            disabled={!file || loading}
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> {loading ? 'Memproses berkas...' : 'Upload'}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <Input
              label="Nama Koleksi RAG Baru"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan nama koleksi, contoh: buku_panduan_kbbi"
            />
          </Card>

          {preview.file_type === 'structured' ? (
            /* Structured columns view (CSV, Excel) */
            <>
              <Card>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Kolom untuk Embedding (pencarian semantik)
                </label>
                <div className="flex flex-wrap gap-2">
                  {preview.headers?.map((h) => (
                    <button
                      key={h}
                      onClick={() => toggleCol(h, embeddingCols, setEmbeddingCols)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        embeddingCols.includes(h)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Kolom Tampilan (untuk UI)
                </label>
                <div className="flex flex-wrap gap-2">
                  {preview.headers?.map((h) => (
                    <button
                      key={h}
                      onClick={() => toggleCol(h, displayCols, setDisplayCols)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        displayCols.includes(h)
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="font-medium mb-2 text-gray-900 dark:text-white">
                  Preview Data Tabel ({preview.total_rows} baris)
                </h3>
                <div className="overflow-x-auto max-h-60 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        {preview.headers?.map((h) => (
                          <th
                            key={h}
                            className="text-left p-2 border-b border-gray-200 dark:border-gray-600 font-medium text-gray-700 dark:text-gray-300"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                      {preview.preview?.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {preview.headers?.map((h) => (
                            <td
                              key={h}
                              className="p-2 border-b border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 whitespace-nowrap overflow-hidden max-w-xs truncate"
                            >
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : (
            /* Unstructured view (PDF, TXT) */
            <Card>
              <h3 className="font-medium mb-1 text-gray-900 dark:text-white">
                Preview Dokumen Teks
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Total Halaman: {preview.total_pages} | Estimasi Karakter: {preview.total_chars}
              </p>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">
                {preview.preview_text}...
              </div>
              <p className="text-xs text-blue-500 mt-2">
                * Sistem akan secara otomatis membagi dokumen menjadi paragraf berukuran 800 karakter untuk diindeks ke FAISS RAG.
              </p>
            </Card>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={!name || loading}
              className="flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Import Dataset
            </Button>
            <Button
              onClick={() => setPreview(null)}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
