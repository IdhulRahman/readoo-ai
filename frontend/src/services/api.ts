const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth
export const auth = {
  register: (data: { nama_lengkap: string; email: string; password: string }) =>
    request<{ success: boolean; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ token: string; role: string; nama_lengkap: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    request<{ success: boolean; message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  changePassword: (data: { old_password: string; new_password: string }) =>
    request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Chat
export const chat = {
  sendMessage: (message: string, sessionId?: string) =>
    request<{ reply: string; items: unknown[]; session_id: string }>('/chat/text', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId }),
    }),

  streamMessage: (message: string, sessionId?: string) => {
    const token = localStorage.getItem('token');
    const url = `${API_BASE}/chat/stream`;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, session_id: sessionId }),
    });
  },

  sendAvatarMessage: (message: string, sessionId?: string) =>
    request<{ speech_text: string; items: unknown[]; session_id: string }>('/chat/avatar', {
      method: 'POST',
      body: JSON.stringify({ message, session_id: sessionId }),
    }),

  getSessions: () =>
    request<{ id: string; title: string; created_at: string; updated_at: string }[]>('/chat/sessions'),

  getSessionMessages: (sessionId: string) =>
    request<{ role: string; content: string; created_at: string }[]>(`/chat/sessions/${sessionId}/messages`),

  deleteSession: (sessionId: string) =>
    request<{ success: boolean }>(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
};

// Voice
export const voice = {
  transcribe: (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio_data', audioBlob, 'recording.webm');
    return request<{ text: string }>('/transcribe', {
      method: 'POST',
      body: formData,
    });
  },

  textToSpeech: (text: string) =>
    request<{ audio_url: string }>('/tts', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};

// Admin
export const admin = {
  getCollections: () =>
    request<{
      id: number;
      name: string;
      embedding_cols: string[];
      display_cols: string[];
      active: boolean;
      created_at: string;
      doc_count: number;
    }[]>('/admin/collections'),

  setActiveCollection: (colId: number) =>
    request<{ success: boolean }>(`/admin/collections/active/${colId}`, { method: 'POST' }),

  deleteCollection: (colId: number) =>
    request<{ success: boolean }>(`/admin/collections/${colId}`, { method: 'DELETE' }),

  rebuildIndex: (colId: number) =>
    request<{ success: boolean }>(`/admin/collections/rebuild/${colId}`, { method: 'POST' }),

  getCollectionDocuments: (colId: number) =>
    request<Record<string, unknown>[]>(`/admin/collections/${colId}/documents`),

  addDocument: (colId: number, data: Record<string, unknown>) =>
    request<{ success: boolean; id: number }>(`/admin/collections/${colId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteDocument: (docId: number) =>
    request<{ success: boolean }>(`/admin/documents/${docId}`, { method: 'DELETE' }),

  uploadDataset: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<any>(
      '/admin/dataset/upload',
      { method: 'POST', body: formData }
    );
  },

  importDataset: (data: any) =>
    request<{ success: boolean; collection_id: number; document_count: number }>('/admin/dataset/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  exportDataset: (colId: number) =>
    request<{ collection_name: string; documents: Record<string, unknown>[]; total: number }>(
      `/admin/dataset/export/${colId}`
    ),

  getSettings: () =>
    request<Record<string, string>>('/admin/settings'),

  saveSettings: (settings: Record<string, string>) =>
    request<{ success: boolean }>('/admin/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  getStats: () =>
    request<{
      total_users: number;
      total_collections: number;
      total_documents: number;
      active_sessions: number;
      collections: { name: string; document_count: number }[];
    }>('/admin/stats'),

  healthCheck: () =>
    request<{ status: string; timestamp: number; checks: Record<string, unknown> }>('/admin/health'),

  getUsers: () =>
    request<{ id: number; nama_lengkap: string; email: string; role: string }[]>('/admin/user-management'),

  deleteUser: (userId: number) =>
    request<{ success: boolean }>(`/admin/user-management/${userId}`, { method: 'DELETE' }),

  updateUserRole: (userId: number, role: string) =>
    request<{ success: boolean }>(`/admin/user-management/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  testLLMConnection: (data: { llm_provider: string; llm_model: string; llm_api_key?: string }) =>
    request<{ success: boolean; response?: string; error?: string }>('/admin/llm/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  detectModels: (data: { llm_provider: string; llm_api_key?: string }) =>
    request<{ success: boolean; models: string[]; error_msg?: string }>('/admin/llm/detect-models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  testTTS: (data: { text: string; provider?: string; language?: string; voice?: string }) =>
    request<{ audio_url: string }>('/admin/tts/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Public settings (accessible by all logged-in users, not just admin)
export const publicSettings = {
  getAssistantInfo: () =>
    request<{ assistant_name: string; assistant_job: string; greeting_message: string }>(
      '/settings/public'
    ),
};