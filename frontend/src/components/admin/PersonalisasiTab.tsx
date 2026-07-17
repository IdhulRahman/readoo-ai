import React, { useState, useEffect, useRef } from 'react';
import { Save, Activity, RefreshCw, Volume2, Sparkles, Brain, MessageSquare } from 'lucide-react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { admin } from '../../services/api';

interface PersonalisasiTabProps {
  onSuccess: (msg: string) => void;
  setHasUnsavedChanges: (v: boolean) => void;
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
      { value: 'F3', label: 'F3 (Perempuan)' },
      { value: 'M3', label: 'M3 (Laki-laki)' },
      { value: 'F4', label: 'F4 (Perempuan)' },
      { value: 'M4', label: 'M4 (Laki-laki)' },
      { value: 'F5', label: 'F5 (Perempuan)' },
      { value: 'M5', label: 'M5 (Laki-laki)' },
    ],
    'en-US': [
      { value: 'F1', label: 'F1 (Female)' },
      { value: 'M1', label: 'M1 (Male)' },
      { value: 'F2', label: 'F2 (Female)' },
      { value: 'M2', label: 'M2 (Male)' },
      { value: 'F3', label: 'F3 (Female)' },
      { value: 'M3', label: 'M3 (Male)' },
      { value: 'F4', label: 'F4 (Female)' },
      { value: 'M4', label: 'M4 (Male)' },
      { value: 'F5', label: 'F5 (Female)' },
      { value: 'M5', label: 'M5 (Male)' },
    ],
  },
};

export const PersonalisasiTab: React.FC<PersonalisasiTabProps> = ({ onSuccess, setHasUnsavedChanges }) => {
  // Identity States
  const [assistantName, setAssistantName] = useState('');
  const [greetingMessage, setGreetingMessage] = useState('');
  const [assistantJob, setAssistantJob] = useState('');
  // NEW: gender avatar 3D, dipakai untuk menentukan model VRM mana yang dimuat
  // di ChatPage (avatar perempuan/laki-laki), supaya konsisten sama Model Suara TTS
  const [avatarGender, setAvatarGender] = useState('female');

  // LLM States
  const [llmProvider, setLlmProvider] = useState('groq');
  const [llmModel, setLlmModel] = useState('llama-3.1-8b-instant');
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
  const [isLoaded, setIsLoaded] = useState(false);
  const initialSettingsRef = useRef<Record<string, string>>({});
  
  // Available models list (detected from LLM provider)
  const [detectedModels, setDetectedModels] = useState<string[]>([]);

  // Fetch all settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const sett = await admin.getSettings();
        
        // Cache original values for dirty-check comparison
        initialSettingsRef.current = {
          assistant_name: sett.assistant_name || '',
          greeting_message: sett.greeting_message || '',
          assistant_job: sett.assistant_job || '',
          avatar_gender: sett.avatar_gender || 'female',
          llm_provider: sett.llm_provider || '',
          llm_model: sett.llm_model || '',
          llm_api_key: sett.llm_api_key || '',
          llm_max_tokens: String(sett.llm_max_tokens || '200'),
          llm_temperature: String(sett.llm_temperature || '0.7'),
          tts_provider: sett.tts_provider || '',
          tts_language: sett.tts_language || '',
          tts_voice: sett.tts_voice || '',
        };

        if (sett.assistant_name) setAssistantName(sett.assistant_name);
        if (sett.greeting_message) setGreetingMessage(sett.greeting_message);
        if (sett.assistant_job) setAssistantJob(sett.assistant_job);
        if (sett.avatar_gender) setAvatarGender(sett.avatar_gender);
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
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Track changes to form inputs by checking if they actually differ from the saved settings
  useEffect(() => {
    if (!isLoaded) return;
    
    const hasDiff =
      assistantName !== (initialSettingsRef.current.assistant_name || '') ||
      greetingMessage !== (initialSettingsRef.current.greeting_message || '') ||
      assistantJob !== (initialSettingsRef.current.assistant_job || '') ||
      avatarGender !== (initialSettingsRef.current.avatar_gender || 'female') ||
      llmProvider !== (initialSettingsRef.current.llm_provider || '') ||
      llmModel !== (initialSettingsRef.current.llm_model || '') ||
      (llmApiKey !== '' && llmApiKey !== '********' && llmApiKey !== (initialSettingsRef.current.llm_api_key || '')) ||
      llmMaxTokens !== (initialSettingsRef.current.llm_max_tokens || '') ||
      llmTemperature !== (initialSettingsRef.current.llm_temperature || '') ||
      ttsProvider !== (initialSettingsRef.current.tts_provider || '') ||
      ttsLanguage !== (initialSettingsRef.current.tts_language || '') ||
      ttsVoice !== (initialSettingsRef.current.tts_voice || '');

    setHasUnsavedChanges(hasDiff);
  }, [
    assistantName,
    greetingMessage,
    assistantJob,
    avatarGender,
    llmProvider,
    llmModel,
    llmApiKey,
    llmMaxTokens,
    llmTemperature,
    ttsProvider,
    ttsLanguage,
    ttsVoice,
    isLoaded,
    setHasUnsavedChanges
  ]);

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

  // Save LLM settings and detect models
  const detectModelsOnly = async () => {
    setLoadingConnection(true);
    setConnectionResult('');
    setDetectedModels([]);
    try {
      setConnectionResult('⏳ Menyimpan API Key & Mendeteksi model dari provider...');
      
      // 1. Save provider and api key
      const payload: Record<string, string> = {
        llm_provider: llmProvider,
      };
      if (llmApiKey && llmApiKey !== '********') {
        payload.llm_api_key = llmApiKey;
      }
      await admin.saveSettings(payload);

      // Update cache ref
      initialSettingsRef.current = {
        ...initialSettingsRef.current,
        llm_provider: llmProvider,
        llm_api_key: llmApiKey,
      };

      // 2. Perform detection
      const detectData = await admin.detectModels({
        llm_provider: llmProvider,
        llm_api_key: llmApiKey === '********' ? undefined : llmApiKey || undefined,
      });

      if (detectData.models && detectData.models.length > 0) {
        const modelsList = detectData.models;
        setDetectedModels(modelsList);
        // If current model is not in detected models list, select the first one and auto-save it
        if (!modelsList.includes(llmModel)) {
          setLlmModel(modelsList[0]);
          await admin.saveSettings({ llm_model: modelsList[0] });
          initialSettingsRef.current.llm_model = modelsList[0];
        }
        setConnectionResult(`✅ Simpan & Deteksi model berhasil! Ditemukan ${modelsList.length} model.`);
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

  // Save identity settings only
  const saveIdentitySettings = async () => {
    setSaving(true);
    try {
      const payload = {
        assistant_name: assistantName,
        greeting_message: greetingMessage,
        assistant_job: assistantJob,
        avatar_gender: avatarGender,
      };
      await admin.saveSettings(payload);
      
      // Update cache ref
      initialSettingsRef.current = {
        ...initialSettingsRef.current,
        assistant_name: assistantName,
        greeting_message: greetingMessage,
        assistant_job: assistantJob,
        avatar_gender: avatarGender,
      };

      setHasUnsavedChanges(false);
      onSuccess('Identitas asisten berhasil disimpan!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan identitas');
    } finally {
      setSaving(false);
    }
  };

  // Save LLM settings only
  const saveLlmSettings = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_max_tokens: llmMaxTokens,
        llm_temperature: llmTemperature,
      };
      if (llmApiKey && llmApiKey !== '********') {
        payload.llm_api_key = llmApiKey;
      }
      await admin.saveSettings(payload);

      // Update cache ref
      initialSettingsRef.current = {
        ...initialSettingsRef.current,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_max_tokens: llmMaxTokens,
        llm_temperature: llmTemperature,
        llm_api_key: llmApiKey,
      };

      onSuccess('Pengaturan Otak AI (LLM) berhasil disimpan!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan LLM');
    } finally {
      setSaving(false);
    }
  };

  // Save TTS settings only
  const saveTtsSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        tts_provider: ttsProvider,
        tts_language: ttsLanguage,
        tts_voice: ttsVoice,
      };
      await admin.saveSettings(payload);

      // Update cache ref
      initialSettingsRef.current = {
        ...initialSettingsRef.current,
        tts_provider: ttsProvider,
        tts_language: ttsLanguage,
        tts_voice: ttsVoice,
      };

      onSuccess('Pengaturan Suara AI (TTS) berhasil disimpan!');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan TTS');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 w-full pb-12">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold">Personalisasi AI</h2>
          <p className="text-sm text-gray-550 mt-1">Konfigurasi identitas asisten, otak LLM, dan suara TTS secara terpusat.</p>
        </div>
      </div>

      {/* 1. Identity Config - Full Width at Top */}
      <Card className="space-y-4 border-l-4 border-l-primary-500">
        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 pb-2">
          <MessageSquare className="w-5 h-5 text-primary-500" />
          <span>Identitas Asisten</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="Nama Asisten"
            value={assistantName}
            onChange={(e) => setAssistantName(e.target.value)}
            placeholder="Contoh: Aiko"
          />
          <Input
            label="Pekerjaan / Peran Asisten"
            value={assistantJob}
            onChange={(e) => setAssistantJob(e.target.value)}
            placeholder="Contoh: Customer Service Toko Elektronik, Sales Mobil, Pustakawan Digital"
          />
          {/* NEW: pilihan avatar 3D (perempuan/laki-laki). Model VRM sebenarnya
              (sample.vrm / samplemale.vrm) ditentukan di frontend berdasarkan
              value ini, supaya tampilan avatar konsisten sama Model Suara TTS
              yang dipilih di kartu "Suara AI" sebelah kanan. */}
          <Select
            label="Avatar 3D"
            value={avatarGender}
            onChange={(e) => setAvatarGender(e.target.value)}
            options={[
              { value: 'female', label: 'Perempuan' },
              { value: 'male', label: 'Laki-laki' },
            ]}
          />
          <Input
            label="Pesan Sambutan"
            value={greetingMessage}
            onChange={(e) => setGreetingMessage(e.target.value)}
            placeholder="Contoh: Halo! Saya Aiko. Ada yang bisa saya bantu?"
          />
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700/50">
          <Button onClick={saveIdentitySettings} disabled={saving} className="text-xs py-2 px-5 flex items-center gap-1.5 shadow-sm">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan...' : 'Simpan Identitas'}
          </Button>
        </div>
      </Card>

      {/* 2-Column Grid for Otak AI & Suara AI (Symmetric layout to avoid dead spaces) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Left Column: Otak LLM */}
        <Card className="space-y-4 border-l-4 border-l-purple-500 h-full flex flex-col justify-between">
          <div className="space-y-4">
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

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                type="button"
                onClick={detectModelsOnly}
                disabled={loadingConnection}
                variant="secondary"
                className="text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingConnection ? 'animate-spin' : ''}`} />
                Simpan &amp; Deteksi Model
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

            {/* Model Selection Dropdown */}
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
          </div>

          <div className="flex justify-end pt-2 mt-4 border-t border-gray-100 dark:border-gray-700/50">
            <Button onClick={saveLlmSettings} disabled={saving} className="text-xs py-2 px-5 flex items-center gap-1.5 shadow-sm">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan...' : 'Simpan Otak AI'}
            </Button>
          </div>
        </Card>

        {/* Right Column: Suara AI */}
        <Card className="space-y-4 border-l-4 border-l-amber-500 h-full flex flex-col justify-between">
          <div className="space-y-4">
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

            <Input
              label="Teks Uji Suara"
              value={ttsTestText}
              onChange={(e) => setTtsTestText(e.target.value)}
              placeholder="Masukkan teks untuk uji suara..."
            />

            <div className="flex gap-2 pt-2">
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

            {/* Fixed-size result/placeholder box to match height of the left card */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-150 dark:border-gray-650 min-h-[72px] flex flex-col justify-center">
              {audioUrl ? (
                <>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">Hasil Sintesis Suara:</p>
                  <audio controls src={audioUrl} className="w-full h-8" autoPlay />
                </>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic">
                  Klik &apos;Test &amp; Putar Suara&apos; untuk mendengar hasil uji suara
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2 mt-4 border-t border-gray-100 dark:border-gray-700/50">
            <Button onClick={saveTtsSettings} disabled={saving} className="text-xs py-2 px-5 flex items-center gap-1.5 shadow-sm">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan...' : 'Simpan Suara AI'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};