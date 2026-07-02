import React, { useState, useEffect } from 'react';
import { Volume2, Save } from 'lucide-react';
import { Card } from '../ui/Card';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { admin } from '../../services/api';

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

export const TTSTestTab: React.FC = () => {
  const [text, setText] = useState('Halo, saya adalah asisten AI Anda.');
  const [provider, setProvider] = useState('edge-tts');
  const [language, setLanguage] = useState('id-ID');
  const [voice, setVoice] = useState('id-ID-GadisNeural');
  const [audioUrl, setAudioUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch current TTS settings on mount
  useEffect(() => {
    const loadTtsSettings = async () => {
      try {
        const sett = await admin.getSettings();
        if (sett.tts_provider) setProvider(sett.tts_provider);
        if (sett.tts_language) setLanguage(sett.tts_language);
        if (sett.tts_voice) setVoice(sett.tts_voice);
      } catch (err) {
        console.error('Failed to load TTS settings', err);
      }
    };
    loadTtsSettings();
  }, []);

  // Update voice list automatically when provider or language changes
  const availableVoices = voiceMap[provider]?.[language] || [];

  useEffect(() => {
    if (availableVoices.length > 0) {
      const isVoiceAvailable = availableVoices.some((v) => v.value === voice);
      if (!isVoiceAvailable) {
        setVoice(availableVoices[0].value);
      }
    }
  }, [provider, language, availableVoices, voice]);

  const testTTS = async () => {
    setLoading(true);
    setAudioUrl('');
    try {
      const data = await admin.testTTS({
        text,
        provider,
        voice,
        language,
      });
      setAudioUrl(data.audio_url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'TTS test gagal');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage('');
    try {
      await admin.saveSettings({
        tts_provider: provider,
        tts_voice: voice,
        tts_language: language,
      });
      setMessage('✅ Pengaturan TTS berhasil disimpan!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage(`❌ Gagal menyimpan: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Pengaturan & Uji Suara TTS</h2>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-lg font-medium">
          {message}
        </div>
      )}

      <Card className="space-y-4">
        <Select
          label="Provider TTS"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          options={[
            { value: 'edge-tts', label: 'Edge-TTS (Sintesis Cloud Microsoft)' },
            { value: 'supertonic', label: 'Supertonic (Model Lokal ONNX)' },
          ]}
        />

        <Select
          label="Bahasa"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          options={[
            { value: 'id-ID', label: 'Indonesian (ina)' },
            { value: 'en-US', label: 'English (eng)' },
          ]}
        />

        {availableVoices.length > 0 ? (
          <Select
            label="Model Suara (Terdeteksi Otomatis)"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            options={availableVoices}
          />
        ) : (
          <div className="text-sm text-red-500 font-medium">
            Tidak ada suara yang tersedia untuk provider & bahasa ini.
          </div>
        )}

        <Textarea
          label="Teks Uji Coba Suara"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-20"
        />

        <div className="flex gap-2 pt-2">
          <Button onClick={testTTS} disabled={loading || availableVoices.length === 0}>
            <Volume2 className="w-4 h-4 inline mr-1" /> {loading ? 'Memproses...' : 'Test & Putar Suara'}
          </Button>
        </div>

        {audioUrl && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600">
            <p className="text-xs text-gray-500 mb-2 font-medium">Pemutar Audio:</p>
            <audio controls src={audioUrl} className="w-full animate-fade-in" autoPlay />
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button onClick={saveSettings} disabled={saving || loading} className="w-full sm:w-auto">
            <Save className="w-4 h-4 inline mr-1" /> Simpan Konfigurasi TTS
          </Button>
        </div>
      </Card>
    </div>
  );
};
