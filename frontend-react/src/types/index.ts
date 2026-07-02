export interface User {
  id: number;
  nama_lengkap: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AuthResponse {
  token: string;
  role: string;
  nama_lengkap: string;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  reply: string;
  items: ChatItem[];
  session_id: string;
}

export interface ChatItem {
  id?: number;
  cover_image?: string;
  cover_color?: number;
  [key: string]: unknown;
}

export interface Collection {
  id: number;
  name: string;
  embedding_cols: string[];
  display_cols: string[];
  active: boolean;
  created_at: string;
  doc_count: number;
}

export interface AdminStats {
  total_users: number;
  total_collections: number;
  total_documents: number;
  active_sessions: number;
  collections: { name: string; document_count: number }[];
}

export interface HealthCheck {
  status: string;
  timestamp: number;
  checks: Record<string, { status: string; [key: string]: unknown }>;
}

export interface Settings {
  [key: string]: string;
}