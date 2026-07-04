import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2, Eye, ArrowLeft, Plus, Upload, Check, X, Search } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { admin } from '../../services/api';
import type { Collection } from '../../types';

interface CollectionsTabProps {
  collections: Collection[];
  onRefresh: () => void;
  onSetActive: (colId: number) => void;
  onRebuildIndex: (colId: number) => void;
  onDelete: (colId: number) => void;
}

export const CollectionsTab: React.FC<CollectionsTabProps> = ({
  collections,
  onRefresh,
  onSetActive,
  onRebuildIndex,
  onDelete,
}) => {
  // Document viewing state
  const [selectedCol, setSelectedCol] = useState<Collection | null>(null);
  const [documents, setDocuments] = useState<Record<string, any>[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Add document modal state
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [newDocFields, setNewDocFields] = useState<Record<string, string>>({});
  const [savingDoc, setSavingDoc] = useState(false);

  // Upload dataset state
  const [file, setFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<any | null>(null);
  const [embeddingCols, setEmbeddingCols] = useState<string[]>([]);
  const [displayCols, setDisplayCols] = useState<string[]>([]);
  const [newColName, setNewColName] = useState('');
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [rebuildingId, setRebuildingId] = useState<number | null>(null);

  const handleLocalRebuild = async (colId: number) => {
    setRebuildingId(colId);
    try {
      await onRebuildIndex(colId);
    } catch {
      // parent handler takes care of alerting
    } finally {
      setRebuildingId(null);
    }
  };

  // Fetch documents for the selected collection
  const fetchDocuments = async (col: Collection) => {
    setLoadingDocs(true);
    try {
      const docs = await admin.getCollectionDocuments(col.id);
      setDocuments(docs);
      setSelectedCol(col);
      
      // Initialize add doc fields based on display/embedding columns
      const fields: Record<string, string> = {};
      const allCols = Array.from(new Set([...col.embedding_cols, ...col.display_cols]));
      allCols.forEach((c) => {
        fields[c] = '';
      });
      setNewDocFields(fields);
    } catch (e) {
      alert('Gagal memuat dokumen: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCol) return;

    setSavingDoc(true);
    try {
      await admin.addDocument(selectedCol.id, newDocFields);
      // Re-fetch documents
      await fetchDocuments(selectedCol);
      setShowAddDocModal(false);
      
      // Reset fields
      const resetFields: Record<string, string> = {};
      Object.keys(newDocFields).forEach((k) => {
        resetFields[k] = '';
      });
      setNewDocFields(resetFields);
      onRefresh(); // Refresh total count in collection list
    } catch (e) {
      alert('Gagal menambah dokumen: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus baris data ini? Baris ini akan segera hilang dari Database & Index RAG.')) return;
    if (!selectedCol) return;

    try {
      await admin.deleteDocument(docId);
      // Update local state incrementally
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      onRefresh(); // Refresh total count in collection list
    } catch (e) {
      alert('Gagal menghapus data: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Upload and parse dataset file (CSV/Excel)
  const handleUploadFile = async () => {
    if (!file) return;
    setLoadingUpload(true);
    try {
      const data = await admin.uploadDataset(file);
      setUploadPreview(data);
      if (data.headers) {
        setEmbeddingCols(data.headers);
        setDisplayCols(data.headers);
      }
      // Set default collection name from file name without extension
      const defaultName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setNewColName(defaultName);
    } catch (e) {
      alert('Gagal membaca dataset: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingUpload(false);
    }
  };

  // Import dataset and create faiss index
  const handleImportDataset = async () => {
    if (!uploadPreview || !newColName.trim()) return;
    setLoadingImport(true);
    try {
      await admin.importDataset({
        name: newColName.trim(),
        temp_file: uploadPreview.temp_file,
        embedding_cols: embeddingCols,
        display_cols: displayCols,
      });

      setUploadPreview(null);
      setFile(null);
      setNewColName('');
      onRefresh(); // Reload collections list
      alert('Dataset berhasil diimpor dan index RAG berhasil dibangun!');
    } catch (e) {
      alert('Gagal mengimpor dataset: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoadingImport(false);
    }
  };

  const toggleCol = (col: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(col)) {
      setList(list.filter((c) => c !== col));
    } else {
      setList([...list, col]);
    }
  };

  // Filter documents in local state
  const filteredDocs = documents.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return Object.values(doc).some((val) => 
      String(val).toLowerCase().includes(q)
    );
  });

  // Get table column headers dynamically based on first document metadata keys
  const getDocHeaders = () => {
    if (documents.length === 0) return [];
    // Filter out internal properties like 'id' or '_content'
    return Object.keys(documents[0]).filter(
      (key) => key !== 'id' && key !== '_content' && key !== 'collection_id'
    );
  };

  // VIEW 1: Document rows manager
  if (selectedCol) {
    const headers = getDocHeaders();
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedCol(null);
                setSearchQuery('');
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
              title="Kembali ke Daftar Koleksi"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Dokumen: <span className="text-primary-600 dark:text-primary-400">{selectedCol.name}</span>
              </h2>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-0.5">
                Total {documents.length} baris data · Menggunakan FAISS IDMap Incremental
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAddDocModal(true)}
              className="text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Tambah Baris Data
            </Button>
          </div>
        </div>

        {/* Search bar inside collection */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Cari dalam dokumen ini..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
          {loadingDocs ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary-500" />
              Memuat data dokumen...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Tidak ada baris data cocok atau koleksi kosong.
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 z-10">
                  {headers.map((h) => (
                    <th key={h} className="px-5 py-3 bg-gray-50 dark:bg-gray-750">
                      {h}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-center bg-gray-50 dark:bg-gray-750 w-24">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm text-gray-700 dark:text-gray-300">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {headers.map((h) => (
                      <td key={h} className="px-5 py-3 max-w-xs truncate" title={String(doc[h] || '')}>
                        {String(doc[h] ?? '')}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/45 rounded-lg text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Hapus Data (Tanpa Rebuild vector db)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal: Add Document Row */}
        {showAddDocModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl border border-gray-150 dark:border-gray-700 overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary-500" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Tambah Baris Data Baru</h3>
                </div>
                <button
                  onClick={() => setShowAddDocModal(false)}
                  className="p-1 hover:bg-gray-150 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddDocument} className="p-6 space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin">
                <p className="text-xs text-gray-500 mb-2">
                  Masukkan nilai kolom di bawah ini. Data baru ini akan langsung di-embedding secara asinkron tanpa mengganggu koleksi FAISS RAG lainnya.
                </p>
                {Object.keys(newDocFields).map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {key} {selectedCol.embedding_cols.includes(key) && <span className="text-primary-500" title="Digunakan untuk semantic embedding RAG">*</span>}
                    </label>
                    <textarea
                      value={newDocFields[key]}
                      onChange={(e) => setNewDocFields({ ...newDocFields, [key]: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm h-16 resize-none"
                      placeholder={`Nilai untuk kolom ${key}`}
                      required={selectedCol.embedding_cols.includes(key)}
                    />
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 mt-6 sticky bottom-0 bg-white dark:bg-gray-800 py-2">
                  <button
                    type="button"
                    onClick={() => setShowAddDocModal(false)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-650 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                    disabled={savingDoc}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium text-sm"
                    disabled={savingDoc}
                  >
                    {savingDoc ? 'Menyimpan...' : 'Tambah & Embed'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // VIEW 2: Default List View + Uploader
  return (
    <div className="space-y-8">
      {/* 1. Integrated Uploader Section */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Upload Dataset Baru</h2>
        {!uploadPreview ? (
          <Card className="border-dashed border-2 border-gray-300 dark:border-gray-650 p-6 flex flex-col items-center justify-center bg-gray-50/50 dark:bg-gray-800/50">
            <Upload className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-1">
              Pilih berkas terstruktur Anda
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Format yang didukung: CSV, XLSX, XLS (Maksimal 10 MB)
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mb-4 text-xs block w-full text-center max-w-xs text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-gray-700 dark:file:text-gray-200 cursor-pointer"
            />
            <Button
              onClick={handleUploadFile}
              disabled={!file || loadingUpload}
              className="text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {loadingUpload ? 'Membaca File...' : 'Mulai Proses & Petakan Kolom'}
            </Button>
          </Card>
        ) : (
          <Card className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" /> Pemetaan Kolom Dataset: {file?.name}
              </h3>
              <button
                onClick={() => {
                  setUploadPreview(null);
                  setFile(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-750 rounded text-gray-450 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nama Koleksi RAG Baru"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Masukkan nama unik koleksi"
                required
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-405 uppercase tracking-wider mb-2">
                  Pilih Kolom Pencarian / Embedding (Wajib minimal 1)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {uploadPreview.headers?.map((h: string) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleCol(h, embeddingCols, setEmbeddingCols)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                        embeddingCols.includes(h)
                          ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold'
                          : 'border-gray-250 dark:border-gray-650 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-405 uppercase tracking-wider mb-2">
                  Pilih Kolom Informasi Hasil Pencarian (Wajib minimal 1)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {uploadPreview.headers?.map((h: string) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleCol(h, displayCols, setDisplayCols)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                        displayCols.includes(h)
                          ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold'
                          : 'border-gray-250 dark:border-gray-650 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setUploadPreview(null);
                  setFile(null);
                }}
                disabled={loadingImport}
                className="text-xs py-1.5 px-3"
              >
                Batal
              </Button>
              <Button
                onClick={handleImportDataset}
                disabled={loadingImport || embeddingCols.length === 0 || displayCols.length === 0 || !newColName.trim()}
                className="text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                {loadingImport ? 'Sedang Memproses RAG...' : 'Impor & Bangun DB Vector'}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* 2. Collections List Section with scroll boundary limit */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Daftar Koleksi RAG</h2>
          <Button
            onClick={onRefresh}
            variant="secondary"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Segarkan
          </Button>
        </div>

        <div className="max-h-[350px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 scrollbar-thin space-y-0.5">
          {collections.length === 0 ? (
            <div className="text-center text-gray-550 dark:text-gray-400 py-12 text-sm bg-gray-50 dark:bg-gray-800">
              Belum ada RAG koleksi terdaftar. Silakan import berkas di atas untuk memulai.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {collections.map((col) => (
                <div
                  key={col.id}
                  className={`flex items-center justify-between p-4 bg-white dark:bg-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-750/30 transition-colors ${
                    col.active ? 'border-l-4 border-l-primary-500 pl-3' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">
                        {col.name}
                      </span>
                      {col.active && (
                        <span className="text-[10px] bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold px-2 py-0.5 rounded-full">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-450 dark:text-gray-400 mt-1">
                      {col.doc_count} baris data · Dibuat {new Date(col.created_at).toLocaleDateString('id-ID')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!col.active && (
                      <Button
                        onClick={() => onSetActive(col.id)}
                        className="text-[11px] py-1 px-2.5"
                      >
                        Aktifkan
                      </Button>
                    )}
                    <Button
                      onClick={() => fetchDocuments(col)}
                      variant="secondary"
                      className="text-[11px] py-1 px-2.5 flex items-center gap-1"
                      title="Lihat & Edit Isi Dokumen"
                    >
                      <Eye className="w-3.5 h-3.5" /> Lihat Isi
                    </Button>
                    <Button
                      onClick={() => handleLocalRebuild(col.id)}
                      variant="secondary"
                      className="text-[11px] py-1 px-2.5 flex items-center gap-1"
                      title="Membangun kembali Index FAISS"
                      disabled={rebuildingId !== null}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${rebuildingId === col.id ? 'animate-spin' : ''}`} />
                      {rebuildingId === col.id ? 'Rebuilding...' : 'Rebuild'}
                    </Button>
                    <button
                      onClick={() => onDelete(col.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-950/45 rounded-lg text-red-500 hover:text-red-650 transition-colors"
                      title="Hapus Koleksi"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
