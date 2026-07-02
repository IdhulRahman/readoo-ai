import React, { useState, useEffect } from 'react';
import { Save, Activity, RefreshCw, Volume2, Sparkles, Brain, MessageSquare } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { admin } from '../../services/api';

interface PersonalisasiTabProps {
  onSuccess: (msg: string) => void;
}

const voiceMap: Record<string, Record<string, { value: string; label: string }[]>> = {
  'edge-tts': {
    'id-ID': [
      { value: 'id-ID-GadisNeural', label: 'Gadis (Neural - Perempuan)' },
      { value: 'id-ID-ArdiNeural', label: 'Ardi (Neural - Laki-laki)' },
    ],
    'en-US': [
      { value: 'en-US-AvaNeural', label: 'Ava (Neural - Perempuan)' },
      { value: 'en-US-AndrewNeural', label: 'Andrew (Neural - Laki-laki)' },
      { value: 'en-US-EmmaNeural', label: 'Emma (Neural - Perempuan)' },
      { value: 'en-US-BrianNeural', label: 'Brian (Neural - Laki-laki)' },
    ],
  },
  'supertonic': {
    'id-ID': [
      { value: 'F1', label: 'F1 (Perempuan)' },
      { value: 'M1', label: 'M1 (Laki-laki)' },
      { value: 'F2', label: 'F2 (Perempuan)' },
      { value: 'M2', label: 'M2 (Laki-laki)' },
    ],
    'en-US': [
      { value: 'F1', label: 'F1 (Female)' },
      { value: 'M1', label: 'M1 (Male)' },
      { value: 'F2', label: 'F2 (Female)' },
      { value: 'M2', label: 'M2 (Male)' },
    ],
  },
};

export const PersonalisasiTab: React.FC<PersonalisasiTabProps> = ({ onSuccess }) => {
  // Identity States
  const [assistantName, setAssistantName] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [assistantJob, setAssistantJob] = useState('');

  // LLM States
  const [llmProvider, setLlmProvider] = useState('groq');
  const [llmModel, setLlmModel] = useState('llama3-8b-8192');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmMaxTokens, setLlmMaxTokens] = useState('200');
  const [llmTemperature, setLlmTemperature] = useState('0.7');

  // TTS States
  const [ttsProvider, setTtsProvider] = useState('edge-tts');
  const [ttsLanguage, setTtsLanguage] = useState('id-ID');
  const [ttsVoice, setTtsVoice] = useState('id-ID-GadisNeural');
  const [ttsTestText, setTtsTestText] = useState('Halo, saya adalah asisten AI Anda.');

  // UI / Logic States
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [loadingTTS, setLoadingTTS] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connectionResult, setConnectionResult] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  
  // Available models list (detected from LLM provider)
  const [detectedModels, setDetectedModels] = useState<string[]>([]);

  // Fetch all settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const sett = await admin.getSettings();
        if (sett.assistant_name) setAssistantName(sett.assistant_name);
        if (sett.greeting_message) setGreetingMessage(sett.greeting_message);
        if (sett.assistant_job) setAssistantJob(sett.assistant_job);
        if (sett.llm_provider) setLlmProvider(sett.llm_provider);
        if (sett.llm_model) {
          setLlmModel(sett.llm_model);
          // Set initial model as the only item in detected list until check connection runs
          setDetectedModels([sett.llm_model]);
        }
        if (sett.llm_api_key) setLlmApiKey(sett.llm_api_key);
        if (sett.llm_max_tokens) setLlmMaxTokens(sett.llm_max_tokens);
        if (sett.llm_temperature) setLlmTemperature(sett.llm_temperature);
        if (sett.tts_provider) setTtsProvider(sett.tts_provider);
        if (sett.tts_language) setTtsLanguage(sett.tts_language);
        if (sett.tts_voice) setTtsVoice(sett.tts_voice);
      } catch (err) {
        console.error('Failed to load settings', err);
      }
    };
    loadSettings();
  }, []);

  // Update voice list automatically when provider or language changes
  const availableVoices = voiceMap[ttsProvider]?.[ttsLanguage] || [];

  useEffect(() => {
    if (availableVoices.length > 0) {
      const isVoiceAvailable = availableVoices.some((v) => v.value === ttsVoice);
      if (!isVoiceAvailable) {
        setTtsVoice(availableVoices[0].value);
      }
    }
  }, [ttsProvider, ttsLanguage, availableVoices, ttsVoice]);

  // Detect models only (Does not test connection)
  const detectModelsOnly = async () => {
    setLoadingConnection(true);
    setConnectionResult('');
    setDetectedModels([]);
    try {
      setConnectionResult('⏳ Mendeteksi model dari provider...');
      const detectData = await admin.detectModels({
        llm_provider: llmProvider,
        llm_api_key: llmApiKey === '********' ? undefined : llmApiKey || undefined,
      });

      if (detectData.models && detectData.models.length > 0) {
        const modelsList = detectData.models;
        setDetectedModels(modelsList);
        setLlmModel(modelsList[0]);
        setConnectionResult(`✅ Deteksi model berhasil! Ditemukan ${modelsList.length} model.`);
      } else {
        setConnectionResult('❌ Gagal mendeteksi model. Pastikan API Key Anda benar.');
      }
    } catch (e) {
      setConnectionResult(`❌ Error deteksi: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setLoadingConnection(false);
    }
  };

  // Test connection with the currently selected model
  const testLLMConnectionOnly = async () => {
    if (!llmModel) {
      alert('Pilih model terlebih dahulu sebelum melakukan uji koneksi.');
      return;
    }
    setLoadingConnection(true);
    setConnectionResult(`⏳ Menguji koneksi dengan model ${llmModel}...`);
    try {
      const testData = await admin.testLLMConnection({
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key: llmApiKey === '********' ? undefined : llmApiKey || undefined,
      });

      if (testData.success) {
        setConnectionResult(`✅ Koneksi Berhasil menggunakan model: ${llmModel}`);
      } else {
        setConnectionResult(`❌ Uji koneksi gagal: ${testData.error}`);
      }
    } catch (e) {
      setConnectionResult(`❌ Error koneksi: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setLoadingConnection(false);
    }
  };

  // Test TTS audio synthesis
  const testTTS = async () => {
    setLoadingTTS(true);
    setAudioUrl('');
    try {
      const data = await admin.testTTS({
        text: ttsTestText,
        provider: ttsProvider,
        voice: ttsVoice,
        language: ttsLanguage,
      });
      setAudioUrl(data.audio_url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'TTS test gagal');
    } finally {
      setLoadingTTS(false);
    }
  };

  // Save all settings at once
  const saveAllSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        assistant_name: assistantName,
        greeting_message: greetingMessage,
        assistant_job: assistantJob,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_max_tokens: llmMaxTokens,
        llm_temperature: llmTemperature,
        tts_provider: ttsProvider,
        tts_voice: ttsVoice,
        tts_language: ttsLanguage,
      };

      if (llmApiKey && llmApiKey !== '********') {
        payload.llm_api_key = llmApiKey;
      }

      await admin.saveSettings(payload);
      onSuccess('Personalisasi AI berhasil disimpan!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan personalisasi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold">Personalisasi AI</h2>
          <p className="text-sm text-gray-500 mt-1">Konfigurasi identitas asisten, otak LLM, dan suara TTS secara terpusat.</p>
        </div>
      </div>

      {/* 1. Identity Config */}
      <Card className="space-y-4 border-l-4 border-l-primary-500">
        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2">
          <MessageSquare className="w-5 h-5 text-primary-500" />
          <span>Identitas Asisten</span>
        </div>
        <Input
          label="Nama Asisten"
          value={assistantName}
          onChange={(e) => setAssistantName(e.target.value)}
          placeholder="Contoh: Aiko"
        />
        <Input
          label="Pesan Sambutan"
          value={greetingMessage}
          onChange={(e) => setGreetingMessage(e.target.value)}
          placeholder="Contoh: Halo! Saya Aiko. Ada yang bisa saya bantu?"
        />
        <Input
          label="Pekerjaan / Peran Asisten"
          value={assistantJob}
          onChange={(e) => setAssistantJob(e.target.value)}
          placeholder="Contoh: Customer Service Toko Elektronik, Sales Mobil, Pustakawan Digital"
        />
      </Card>

      {/* 2. LLM Config */}
      <Card className="space-y-4 border-l-4 border-l-purple-500">
        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <span>Otak AI (Large Language Model)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Provider LLM"
            value={llmProvider}
            onChange={(e) => {
              setLlmProvider(e.target.value);
              setDetectedModels([]);
            }}
            options={[
              { value: 'groq', label: 'Groq (Sangat Cepat)' },
              { value: 'openai', label: 'OpenAI (Premium)' },
              { value: 'gemini', label: 'Gemini (Google)' },
              { value: 'deepseek', label: 'DeepSeek (Hemat)' },
              { value: 'ollama', label: 'Ollama (Lokal)' },
            ]}
          />
          <Input
            label="API Key"
            type="password"
            value={llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
            placeholder="Masukkan API Key untuk provider terpilih"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={detectModelsOnly}
            disabled={loadingConnection}
            variant="secondary"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5 animate-pulse-once"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingConnection ? 'animate-spin' : ''}`} />
            Deteksi Model
          </Button>

          <Button
            type="button"
            onClick={testLLMConnectionOnly}
            disabled={loadingConnection || !llmModel}
            variant="secondary"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5" />
            Test Koneksi
          </Button>
        </div>

        {connectionResult && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-xs font-mono border border-gray-100 dark:border-gray-600 text-gray-700 dark:text-gray-300">
            {connectionResult}
          </div>
        )}

        {/* Model Selection Dropdown (Only choose, no manual typing) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Model yang Dipakai (Wajib Pilih)
          </label>
          <select
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200"
          >
            {!llmModel && (
              <option value="">
                -- Silakan klik tombol &apos;Cek Koneksi &amp; Deteksi Model&apos; --
              </option>
            )}
            {detectedModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Max Tokens"
            type="number"
            value={llmMaxTokens}
            onChange={(e) => setLlmMaxTokens(e.target.value)}
          />
          <Input
            label="Temperature (Kreativitas)"
            type="text"
            value={llmTemperature}
            onChange={(e) => setLlmTemperature(e.target.value)}
            placeholder="0.7"
          />
        </div>
      </Card>

      {/* 3. TTS Config */}
      <Card className="space-y-4 border-l-4 border-l-amber-500">
        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2">
          <Volume2 className="w-5 h-5 text-amber-500" />
          <span>Suara AI (Text-to-Speech)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Provider TTS"
            value={ttsProvider}
            onChange={(e) => setTtsProvider(e.target.value)}
            options={[
              { value: 'edge-tts', label: 'Edge-TTS (Microsoft Cloud)' },
              { value: 'supertonic', label: 'Supertonic (ONNX Lokal)' },
            ]}
          />
          <Select
            label="Bahasa"
            value={ttsLanguage}
            onChange={(e) => setTtsLanguage(e.target.value)}
            options={[
              { value: 'id-ID', label: 'Indonesian (ina)' },
              { value: 'en-US', label: 'English (eng)' },
            ]}
          />
          {availableVoices.length > 0 ? (
            <Select
              label="Model Suara"
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              options={availableVoices}
            />
          ) : (
            <div className="flex items-end text-sm text-red-500 font-medium pb-2">
              Tidak ada suara yang tersedia.
            </div>
          )}
        </div>

        {/* Supertonic info banner */}
        {ttsProvider === 'supertonic' && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs rounded-lg border border-amber-200/50">
            💡 **Catatan Supertonic**: Pustaka Supertonic lokal menggunakan model suara berkode F1-F5 (Wanita) dan M1-M5 (Pria) untuk membedakan karakter timbre/tone suara.
          </div>
        )}

        <Textarea
          label="Teks Uji Suara"
          value={ttsTestText}
          onChange={(e) => setTtsTestText(e.target.value)}
          className="h-16"
        />

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={testTTS}
            disabled={loadingTTS || availableVoices.length === 0}
            variant="secondary"
            className="text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5" />
            {loadingTTS ? 'Memproses...' : 'Test & Putar Suara'}
          </Button>
        </div>

        {audioUrl && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-150 dark:border-gray-600">
            <p className="text-xs text-gray-500 mb-1.5 font-medium">Hasil Sintesis Suara:</p>
            <audio controls src={audioUrl} className="w-full" autoPlay />
          </div>
        )}
      </Card>

      {/* Save Button Footer */}
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button onClick={saveAllSettings} disabled={saving} className="w-full sm:w-auto flex items-center gap-2 py-2.5 px-6 shadow-md">
          <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan Semua Personalisasi'}
        </Button>
      </div>
    </div>
  );
};
