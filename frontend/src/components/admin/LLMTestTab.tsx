import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, Save } from 'lucide-react';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { admin } from '../../services/api';

export const LLMTestTab: React.FC = () => {
  const [provider, setProvider] = useState('groq');
  const [model, setModel] = useState('llama3-8b-8192');
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  // Fetch current LLM settings on mount
  useEffect(() => {
    const loadLlmSettings = async () => {
      try {
        const sett = await admin.getSettings();
        if (sett.llm_provider) setProvider(sett.llm_provider);
        if (sett.llm_model) setModel(sett.llm_model);
        if (sett.llm_api_key) setApiKey(sett.llm_api_key);
      } catch (err) {
        console.error('Failed to load LLM settings', err);
      }
    };
    loadLlmSettings();
  }, []);

  const testConnection = async () => {
    setLoading(true);
    setResult('');
    setModels([]);
    try {
      const data = await admin.testLLMConnection({
        llm_provider: provider,
        llm_model: model,
        llm_api_key: apiKey === '********' ? undefined : apiKey || undefined,
      });

      if (data.success) {
        setResult('✅ Koneksi Berhasil! Mencoba deteksi daftar model...');
        // Auto-detect models
        const detectData = await admin.detectModels({
          llm_provider: provider,
          llm_api_key: apiKey === '********' ? undefined : apiKey || undefined,
        });
        if (detectData.models && detectData.models.length > 0) {
          setModels(detectData.models);
          setResult('✅ Koneksi Berhasil! Daftar model terdeteksi.');
        } else {
          setResult('✅ Koneksi Berhasil! Namun tidak dapat mendeteksi model otomatis.');
        }
      } else {
        setResult(`❌ Gagal Koneksi: ${data.error}`);
      }
    } catch (e) {
      setResult(`❌ Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  const detectModels = async () => {
    setLoading(true);
    try {
      const data = await admin.detectModels({
        llm_provider: provider,
        llm_api_key: apiKey === '********' ? undefined : apiKey || undefined,
      });
      setModels(data.models);
    } catch {
      setResult('❌ Gagal mendeteksi model.');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');
    try {
      const payload: Record<string, string> = {
        llm_provider: provider,
        llm_model: model,
      };
      if (apiKey && apiKey !== '********') {
        payload.llm_api_key = apiKey;
      }
      await admin.saveSettings(payload);
      setMessage('✅ Pengaturan LLM berhasil disimpan!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage(`❌ Gagal menyimpan: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Pengaturan Koneksi LLM</h2>
      
      {message && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-lg font-medium">
          {message}
        </div>
      )}

      <Card className="space-y-4">
        <Select
          label="Provider LLM"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModels([]);
          }}
          options={[
            { value: 'groq', label: 'Groq' },
            { value: 'openai', label: 'OpenAI' },
            { value: 'gemini', label: 'Gemini' },
            { value: 'deepseek', label: 'DeepSeek' },
            { value: 'ollama', label: 'Ollama' },
          ]}
        />

        <Input
          label="API Key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Masukkan API Key Anda"
        />

        <div className="flex gap-2">
          <Button onClick={testConnection} disabled={loading} className="flex-1 sm:flex-none">
            <Activity className="w-4 h-4 inline mr-1" /> {loading ? 'Memeriksa...' : 'Cek Koneksi'}
          </Button>
          <Button
            onClick={detectModels}
            disabled={loading}
            variant="secondary"
            className="flex-1 sm:flex-none"
          >
            <RefreshCw className="w-4 h-4 inline mr-1" /> Deteksi Model
          </Button>
        </div>

        {result && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap border border-gray-100 dark:border-gray-600">
            {result}
          </div>
        )}

        {models.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Pilih Model (Terdeteksi)
            </label>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-800/50">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    model === m
                      ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-650 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Input
            label="Model yang Dipakai (Manual/Terpilih)"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Nama model"
          />
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button onClick={saveSettings} disabled={saving || loading} className="w-full sm:w-auto">
            <Save className="w-4 h-4 inline mr-1" /> Simpan Konfigurasi LLM
          </Button>
        </div>
      </Card>
    </div>
  );
};
