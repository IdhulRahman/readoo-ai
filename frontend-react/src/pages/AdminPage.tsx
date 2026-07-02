import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { admin } from '../services/api';
import type { Collection, AdminStats, Settings } from '../types';
import { LayoutDashboard, Database, Settings2, Users, BarChart3, Activity, ArrowLeft, RefreshCw, Trash2, Plus, Upload, Check, X, Volume2, Brain } from 'lucide-react';

type Tab = 'dashboard' | 'collections' | 'dataset' | 'settings' | 'users' | 'llm' | 'tts';

export default function AdminPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [users, setUsers] = useState<{ id: number; nama_lengkap: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Dashboard
  useEffect(() => {
    if (activeTab === 'dashboard') {
      admin.getStats().then(setStats).catch(() => {});
    }
  }, [activeTab]);

  const loadCollections = () => {
    admin.getCollections().then(setCollections).catch(() => {});
  };

  const loadSettings = () => {
    admin.getSettings().then(setSettings).catch(() => {});
  };

  const loadUsers = () => {
    admin.getUsers().then(setUsers).catch(() => {});
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'collections', label: 'Koleksi', icon: <Database className="w-4 h-4" /> },
    { id: 'dataset', label: 'Dataset', icon: <Upload className="w-4 h-4" /> },
    { id: 'settings', label: 'Pengaturan', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'users', label: 'Pengguna', icon: <Users className="w-4 h-4" /> },
    { id: 'llm', label: 'LLM', icon: <Brain className="w-4 h-4" /> },
    { id: 'tts', label: 'TTS', icon: <Volume2 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/chat')} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </div>
          <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">Keluar</button>
        </div>
      </header>

      {message && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {message}
        </div>
      )}

      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar */}
        <nav className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 min-h-[calc(100vh-4rem)] p-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (tab.id === 'collections') loadCollections(); if (tab.id === 'settings') loadSettings(); if (tab.id === 'users') loadUsers(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${activeTab === tab.id ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 p-6">
          {activeTab === 'dashboard' && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Dashboard</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card"><p className="text-sm text-gray-500 dark:text-gray-400">Total Pengguna</p><p className="text-2xl font-bold mt-1">{stats?.total_users ?? '-'}</p></div>
                <div className="card"><p className="text-sm text-gray-500 dark:text-gray-400">Koleksi</p><p className="text-2xl font-bold mt-1">{stats?.total_collections ?? '-'}</p></div>
                <div className="card"><p className="text-sm text-gray-500 dark:text-gray-400">Dokumen</p><p className="text-2xl font-bold mt-1">{stats?.total_documents ?? '-'}</p></div>
                <div className="card"><p className="text-sm text-gray-500 dark:text-gray-400">Sesi Aktif</p><p className="text-2xl font-bold mt-1">{stats?.active_sessions ?? '-'}</p></div>
              </div>
              {stats?.collections && stats.collections.length > 0 && (
                <div className="card mt-6">
                  <h3 className="font-semibold mb-3">Koleksi & Dokumen</h3>
                  <div className="space-y-2">
                    {stats.collections.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="text-gray-500">{c.document_count} dokumen</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'collections' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Koleksi Data</h2>
                <button onClick={loadCollections} className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Refresh</button>
              </div>
              {collections.length === 0 ? (
                <div className="card text-center text-gray-500 py-12">Belum ada koleksi. Upload dataset untuk memulai.</div>
              ) : (
                <div className="space-y-3">
                  {collections.map(col => (
                    <div key={col.id} className={`card flex items-center justify-between ${col.active ? 'ring-2 ring-primary-500' : ''}`}>
                      <div>
                        <p className="font-medium">{col.name} {col.active && <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">Aktif</span>}</p>
                        <p className="text-sm text-gray-500">{col.doc_count} dokumen</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!col.active && (
                          <button onClick={async () => { await admin.setActiveCollection(col.id); loadCollections(); showMessage('Koleksi aktif diperbarui'); }} className="btn-primary text-xs py-1 px-2">Aktifkan</button>
                        )}
                        <button onClick={async () => { await admin.rebuildIndex(col.id); showMessage('Index dibangun ulang'); }} className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Rebuild</button>
                        <button onClick={async () => { await admin.deleteCollection(col.id); loadCollections(); }} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'dataset' && <DatasetUpload onSuccess={() => { loadCollections(); showMessage('Dataset berhasil diimpor'); }} />}

          {activeTab === 'settings' && <SettingsPanel settings={settings} onSave={async (s) => { await admin.saveSettings(s); loadSettings(); showMessage('Pengaturan disimpan'); }} />}

          {activeTab === 'users' && (
            <div>
              <h2 className="text-xl font-semibold mb-6">Manajemen Pengguna</h2>
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.id} className="card flex items-center justify-between">
                    <div>
                      <p className="font-medium">{u.nama_lengkap}</p>
                      <p className="text-sm text-gray-500">{u.email} · {u.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={async (e) => { await admin.updateUserRole(u.id, e.target.value); loadUsers(); }}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button onClick={async () => { await admin.deleteUser(u.id); loadUsers(); }} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'llm' && <LLMTestPanel />}
          {activeTab === 'tts' && <TTSTestPanel />}
        </div>
      </div>
    </div>
  );
}

function DatasetUpload({ onSuccess }: { onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ temp_file: string; headers: string[]; preview: Record<string, unknown>[]; total_rows: number } | null>(null);
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
      setEmbeddingCols(data.headers);
      setDisplayCols(data.headers);
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
      await admin.importDataset({ name, embedding_cols: embeddingCols, display_cols: displayCols, temp_file: preview.temp_file });
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
    if (list.includes(col)) setList(list.filter(c => c !== col));
    else setList([...list, col]);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Upload Dataset CSV</h2>
      {!preview ? (
        <div className="card">
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mb-4" />
          <button onClick={handleUpload} disabled={!file || loading} className="btn-primary flex items-center gap-2"><Upload className="w-4 h-4" /> {loading ? 'Memproses...' : 'Upload'}</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card">
            <label className="block text-sm font-medium mb-1">Nama Koleksi</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Nama koleksi" />
          </div>
          <div className="card">
            <label className="block text-sm font-medium mb-2">Kolom untuk Embedding (pencarian semantik)</label>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map(h => (
                <button key={h} onClick={() => toggleCol(h, embeddingCols, setEmbeddingCols)} className={`text-xs px-2 py-1 rounded-full border ${embeddingCols.includes(h) ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 dark:border-gray-600'}`}>{h}</button>
              ))}
            </div>
          </div>
          <div className="card">
            <label className="block text-sm font-medium mb-2">Kolom Tampilan (untuk UI)</label>
            <div className="flex flex-wrap gap-2">
              {preview.headers.map(h => (
                <button key={h} onClick={() => toggleCol(h, displayCols, setDisplayCols)} className={`text-xs px-2 py-1 rounded-full border ${displayCols.includes(h) ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-300 dark:border-gray-600'}`}>{h}</button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="font-medium mb-2">Preview Data ({preview.total_rows} baris)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>{preview.headers.map(h => <th key={h} className="text-left p-1 border-b font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i}>{preview.headers.map(h => <td key={h} className="p-1 border-b text-gray-600 dark:text-gray-400">{String(row[h] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={!name || loading} className="btn-primary flex items-center gap-2"><Check className="w-4 h-4" /> Import Dataset</button>
            <button onClick={() => setPreview(null)} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onSave }: { settings: Settings; onSave: (s: Record<string, string>) => void }) {
  const [form, setForm] = useState<Record<string, string>>({ ...settings });
  const [loading, setLoading] = useState(false);

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(form);
    } finally {
      setLoading(false);
    }
  };

  const fields: { key: string; label: string; type: string }[] = [
    { key: 'assistant_name', label: 'Nama Asisten', type: 'text' },
    { key: 'greeting_message', label: 'Pesan Sambutan', type: 'text' },
    { key: 'system_prompt', label: 'System Prompt', type: 'textarea' },
    { key: 'llm_provider', label: 'Provider LLM', type: 'text' },
    { key: 'llm_model', label: 'Model LLM', type: 'text' },
    { key: 'llm_api_key', label: 'API Key LLM', type: 'password' },
    { key: 'llm_max_tokens', label: 'Max Tokens', type: 'number' },
    { key: 'llm_temperature', label: 'Temperature', type: 'number' },
    { key: 'tts_provider', label: 'Provider TTS', type: 'text' },
    { key: 'tts_voice', label: 'Suara TTS', type: 'text' },
    { key: 'tts_language', label: 'Bahasa TTS', type: 'text' },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Pengaturan Sistem</h2>
      <div className="card space-y-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium mb-1">{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={form[f.key] || ''} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="input-field h-24" />
            ) : (
              <input type={f.type} value={form[f.key] || ''} onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="input-field" />
            )}
          </div>
        ))}
        <button onClick={handleSave} disabled={loading} className="btn-primary"><Settings2 className="w-4 h-4 inline mr-1" /> Simpan Pengaturan</button>
      </div>
    </div>
  );
}

function LLMTestPanel() {
  const [provider, setProvider] = useState('groq');
  const [model, setModel] = useState('llama3-8b-8192');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);

  const testConnection = async () => {
    setLoading(true);
    setResult('');
    try {
      const data = await admin.testLLMConnection({ llm_provider: provider, llm_model: model, llm_api_key: apiKey || undefined });
      setResult(data.success ? `✅ Berhasil: ${data.response}` : `❌ Gagal: ${data.error}`);
    } catch (e) {
      setResult(`❌ Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  const detectModels = async () => {
    setLoading(true);
    try {
      const data = await admin.detectModels({ llm_provider: provider, llm_api_key: apiKey || undefined });
      setModels(data.models);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Test Koneksi LLM</h2>
      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input-field">
            {['groq', 'openai', 'gemini', 'deepseek', 'ollama'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Model</label>
          <div className="flex gap-2">
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="input-field" placeholder="Nama model" />
            <button onClick={detectModels} disabled={loading} className="btn-secondary text-sm flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Deteksi</button>
          </div>
          {models.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {models.map(m => (
                <button key={m} onClick={() => setModel(m)} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/30">{m}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">API Key (opsional, jika belum disimpan)</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-field" placeholder="********" />
        </div>
        <button onClick={testConnection} disabled={loading} className="btn-primary"><Activity className="w-4 h-4 inline mr-1" /> Test Koneksi</button>
        {result && <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">{result}</div>}
      </div>
    </div>
  );
}

function TTSTestPanel() {
  const [text, setText] = useState('Halo, saya adalah asisten AI Anda.');
  const [provider, setProvider] = useState('edge-tts');
  const [voice, setVoice] = useState('id-ID-GadisNeural');
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const testTTS = async () => {
    setLoading(true);
    try {
      const data = await admin.testTTS({ text, provider, voice });
      setAudioUrl(data.audio_url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'TTS test gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Test Suara TTS</h2>
      <div className="card space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Teks</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} className="input-field h-20" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input-field">
            <option value="edge-tts">Edge-TTS</option>
            <option value="supertonic">Supertonic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Suara</label>
          <input type="text" value={voice} onChange={(e) => setVoice(e.target.value)} className="input-field" placeholder="id-ID-GadisNeural" />
        </div>
        <button onClick={testTTS} disabled={loading} className="btn-primary"><Volume2 className="w-4 h-4 inline mr-1" /> Test Suara</button>
        {audioUrl && (
          <audio controls src={audioUrl} className="w-full mt-2" autoPlay />
        )}
      </div>
    </div>
  );
}