import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { chat, admin } from '../services/api';
import type { ChatMessage, ChatSession, ChatItem } from '../types';
import { Send, LogOut, MessageSquare, Trash2, Menu, X, Moon, Sun, Mic, Square } from 'lucide-react';

export default function ChatPage() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [recording, setRecording] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await chat.getSessions();
      setSessions(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const toggleDark = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setLoading(true);

    const userMessage: ChatMessage = { role: 'user', content: userMsg };
    setMessages(prev => [...prev, userMessage]);

    try {
      const eventSource = await chat.streamMessage(userMsg, currentSession || undefined);
      const reader = eventSource.body?.getReader();
      const decoder = new TextDecoder();
      setStreaming(true);

      let aiMessage = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
          
          for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'chunk') {
                aiMessage += parsed.text;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  const last = newMsgs[newMsgs.length - 1];
                  if (last.role === 'assistant') last.content = aiMessage;
                  return newMsgs;
                });
              } else if (parsed.type === 'items' && parsed.items) {
                setItems(parsed.items);
              } else if (parsed.type === 'reply') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { role: 'assistant', content: parsed.text };
                  return newMsgs;
                });
              }
              if (parsed.session_id) {
                setCurrentSession(parsed.session_id);
                loadSessions();
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Gagal terhubung ke server.' }]);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        
        try {
          const { voice } = await import('../services/api');
          const result = await voice.transcribe(blob);
          setInput(prev => prev + ' ' + result.text);
        } catch {
          // Transcribe error
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      // Permission denied
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const selectSession = async (sessionId: string) => {
    try {
      const msgs = await chat.getSessionMessages(sessionId);
      setMessages(msgs);
      setCurrentSession(sessionId);
      setSidebarOpen(false);
    } catch { /* ignore */ }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await chat.deleteSession(sessionId);
      if (currentSession === sessionId) {
        setMessages([]);
        setCurrentSession(null);
      }
      loadSessions();
    } catch { /* ignore */ }
  };

  const newChat = () => {
    setMessages([]);
    setCurrentSession(null);
    setItems([]);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Riwayat Chat</h2>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          <button onClick={newChat} className="mt-3 w-full btn-secondary text-sm py-2">
            + Chat Baru
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-8rem)]">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 ${currentSession === s.id ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
            >
              <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{s.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-semibold text-gray-900 dark:text-white">Readoo AI</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleDark} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {isAdmin && (
                <button onClick={() => navigate('/admin')} className="btn-secondary text-sm py-1.5 px-3">
                  Admin
                </button>
              )}
              <button onClick={handleLogout} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Messages */}
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
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={msg.role === 'user' ? 'message-bubble-user' : 'message-bubble-ai'}>
                <p className="whitespace-pre-wrap">{msg.content || (streaming && i === messages.length - 1 ? '...' : '')}</p>
              </div>
            </div>
          ))}
          
          {/* Items display */}
          {items.length > 0 && messages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 animate-fade-in">
              {items.map((item, i) => (
                <div key={i} className="card p-3 flex gap-3 items-start">
                  {item.cover_image && (
                    <img src={item.cover_image} alt="" className="w-16 h-20 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {Object.entries(item).filter(([k]) => !['id', 'cover_image', 'cover_color'].includes(k)).slice(0, 3).map(([key, val]) => (
                      <p key={key} className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        <span className="font-medium capitalize">{key}: </span>
                        {String(val)}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading && !streaming && (
            <div className="flex justify-start">
              <div className="message-bubble-ai">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`p-2 rounded-lg transition-colors ${recording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'}`}
            >
              {recording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 input-field resize-none h-10 max-h-32 py-2"
              placeholder="Ketik pesan..."
              rows={1}
            />
            <button onClick={sendMessage} disabled={!input.trim() || loading} className="btn-primary p-2 rounded-lg">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}