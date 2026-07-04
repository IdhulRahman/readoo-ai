import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { chat, voice, auth } from '../services/api';
import type { ChatMessage, ChatSession, ChatItem } from '../types';
import { Send, LogOut, MessageSquare, Menu, Key, X } from 'lucide-react';
import { Sidebar } from '../components/chat/Sidebar';
import { ChatBubble } from '../components/chat/ChatBubble';
import { ItemCard } from '../components/chat/ItemCard';
import { AudioRecorder } from '../components/chat/AudioRecorder';
import { VrmAvatar, clearVrmCache } from '../components/chat/VrmAvatar';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button } from '../components/ui/Button';

type ChatMode = 'chat' | 'avatar';

export default function ChatPage() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ChatMode>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [avatarAnim, setAvatarAnim] = useState<'idle' | 'wave' | 'thinking'>('idle');
  // Change Password Modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (mode === 'chat') {
      scrollToBottom();
    }
  }, [messages, mode]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await chat.getSessions();
      setSessions(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleLogout = async () => {
    clearVrmCache();
    await logout();
    navigate('/login');
  };

  const sendMessageText = async (userMsg: string) => {
    const userMessage: ChatMessage = { role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const eventSource = await chat.streamMessage(userMsg, currentSession || undefined);
      const reader = eventSource.body?.getReader();
      const decoder = new TextDecoder();
      setStreaming(true);

      let aiMessage = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

          for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'chunk') {
                aiMessage += parsed.text;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const last = newMsgs[newMsgs.length - 1];
                  if (last.role === 'assistant') last.content = aiMessage;
                  return newMsgs;
                });
              } else if (parsed.type === 'items' && parsed.items) {
                setItems(parsed.items);
              } else if (parsed.type === 'reply') {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { role: 'assistant', content: parsed.text };
                  return newMsgs;
                });
              }
              if (parsed.session_id) {
                setCurrentSession(parsed.session_id);
                loadSessions();
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Gagal terhubung ke server.' },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const sendMessageAvatar = async (userMsg: string) => {
    const userMessage: ChatMessage = { role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setAvatarAnim('thinking');

    try {
      const res = await chat.sendAvatarMessage(userMsg, currentSession || undefined);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.speech_text }]);
      
      if (res.session_id) {
        setCurrentSession(res.session_id);
        loadSessions();
      }
      if (res.items) {
        setItems(res.items as ChatItem[]);
      }

      setAvatarAnim('wave');
      // Synthesize Speech
      const ttsRes = await voice.textToSpeech(res.speech_text);
      if (ttsRes.audio_url) {
        const audioEl = document.getElementById('tts-audio') as HTMLAudioElement;
        if (audioEl) {
          audioEl.src = ttsRes.audio_url;
          audioEl.load();
          audioEl.play().catch((e) => console.warn('Audio play blocked:', e));
          
          audioEl.onended = () => {
            setAvatarAnim('idle');
          };
        }
      } else {
        setAvatarAnim('idle');
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Gagal memproses pesan avatar.' },
      ]);
      setAvatarAnim('idle');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');

    if (mode === 'chat') {
      await sendMessageText(userMsg);
    } else {
      await sendMessageAvatar(userMsg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectSession = async (sessionId: string) => {
    try {
      const msgs = await chat.getSessionMessages(sessionId);
      setMessages(msgs as ChatMessage[]);
      setCurrentSession(sessionId);
      setSidebarOpen(false);
      setItems([]);
    } catch {
      /* ignore */
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await chat.deleteSession(sessionId);
      if (currentSession === sessionId) {
        setMessages([]);
        setCurrentSession(null);
      }
      loadSessions();
    } catch {
      /* ignore */
    }
  };

  const newChat = () => {
    setMessages([]);
    setCurrentSession(null);
    setItems([]);
    setSidebarOpen(false);
    setAvatarAnim('idle');
  };
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Semua field wajib diisi.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Konfirmasi password baru tidak cocok.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password baru minimal harus 6 karakter.');
      return;
    }

    setPasswordLoading(true);
    try {
      await auth.changePassword({ old_password: oldPassword, new_password: newPassword });
      setPasswordSuccess('Password Anda berhasil diperbarui!');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Gagal mengubah password.');
    } finally {
      setPasswordLoading(false);
    }
  };
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      {mode === 'chat' && (
        <Sidebar
          sessions={sessions}
          currentSession={currentSession}
          onSelectSession={selectSession}
          onDeleteSession={deleteSession}
          onNewChat={newChat}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && mode === 'chat' && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-25 lg:hidden transition-opacity duration-200"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Hidden Audio for VRM Lip sync */}
        <audio id="tts-audio" className="hidden" crossOrigin="anonymous" />

        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900 flex-shrink-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {mode === 'chat' && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <h1 className="font-semibold text-gray-900 dark:text-white">Readoo AI</h1>
            </div>
            
            {/* Mode Switcher */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200/50 dark:border-gray-700/50 shadow-inner">
              <button
                onClick={() => setMode('chat')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  mode === 'chat'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Chatting
              </button>
              <button
                onClick={() => setMode('avatar')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                  mode === 'avatar'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                3D Avatar
              </button>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAdmin && (
                <Button
                  onClick={() => navigate('/admin')}
                  variant="secondary"
                  className="text-sm py-1.5 px-3"
                >
                  Admin
                </Button>
              )}
              <button
                onClick={() => setShowPasswordModal(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400"
                title="Ganti Password"
              >
                <Key className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Chatting View */}
        {mode === 'chat' ? (
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Mulai chat dengan Aiko, asisten AI Anda</p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <ChatBubble
                key={i}
                message={msg}
                isStreaming={streaming && i === messages.length - 1}
              />
            ))}

            {/* Items display */}
            {items.length > 0 && messages.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 animate-fade-in">
                {items.map((item, i) => (
                  <ItemCard key={i} item={item} />
                ))}
              </div>
            )}

            {loading && !streaming && (
              <div className="flex justify-start">
                <div className="message-bubble-ai">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* 3D Avatar View (Constrained to Chat Text Box bounds for perfect horizontal alignment) */
          <div className="flex-1 w-full relative p-4 flex flex-col justify-end">
            <div className="max-w-4xl mx-auto w-full h-full relative flex items-center justify-center">
              <VrmAvatar animation={avatarAnim} />

              {/* Float Speech Bubble Overlay */}
              {messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white/95 dark:bg-gray-850/95 shadow-xl rounded-2xl p-4 max-w-md w-full border border-gray-150 dark:border-gray-700 backdrop-blur z-10 transition-all animate-fade-in">
                  <p className="text-xs font-bold text-primary-600 dark:text-primary-400 mb-1">Aiko</p>
                  <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed max-h-32 overflow-y-auto">
                    {messages[messages.length - 1].content}
                  </p>
                </div>
              )}

              {/* Recommendations horizontally scrollable container */}
              {items.length > 0 && messages.length > 0 && (
                <div className="absolute bottom-6 inset-x-4 overflow-x-auto flex gap-3 p-2 z-10 scrollbar-none snap-x pointer-events-auto">
                  {items.map((item, i) => (
                    <div key={i} className="flex-shrink-0 w-72 snap-center shadow-lg rounded-xl">
                      <ItemCard item={item} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input Form Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900 flex-shrink-0 z-20">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <AudioRecorder
              onTranscribed={(text) => setInput((prev) => prev + ' ' + text)}
              disabled={loading}
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200 resize-none h-10 max-h-32"
              placeholder="Ketik pesan..."
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-150 dark:border-gray-700 overflow-hidden transform transition-all duration-300 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Ganti Password</h3>
              </div>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setPasswordSuccess('');
                  setOldPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
                className="p-1 hover:bg-gray-150 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/45 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/50 font-medium">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="p-3 bg-green-50 dark:bg-green-950/45 text-green-600 dark:text-green-400 text-xs rounded-lg border border-green-100 dark:border-green-900/50 font-medium">
                  {passwordSuccess}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-505 dark:text-gray-400 uppercase tracking-wider">
                  Password Lama
                </label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-755 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
                  placeholder="Masukkan password lama"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-505 dark:text-gray-400 uppercase tracking-wider">
                  Password Baru
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-650 rounded-lg bg-white dark:bg-gray-755 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
                  placeholder="Minimal 6 karakter"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-550 dark:text-gray-400 uppercase tracking-wider">
                  Konfirmasi Password Baru
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-650 rounded-lg bg-white dark:bg-gray-755 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
                  placeholder="Ulangi password baru"
                  required
                />
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError('');
                    setPasswordSuccess('');
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-655 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                  disabled={passwordLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium text-sm flex items-center gap-1.5"
                  disabled={passwordLoading}
                >
                  {passwordLoading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}