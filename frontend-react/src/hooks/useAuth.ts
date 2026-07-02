import { useState, useEffect, useCallback } from 'react';
import { auth } from '../services/api';
import type { AuthResponse } from '../types';

export function useAuth() {
  const [user, setUser] = useState<{ token: string; role: string; nama_lengkap: string } | null>(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const nama = localStorage.getItem('nama_lengkap');
    if (token && role) return { token, role, nama_lengkap: nama || '' };
    return null;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auth.login({ email, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('nama_lengkap', data.nama_lengkap);
      setUser(data);
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Login gagal';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (nama_lengkap: string, email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await auth.register({ nama_lengkap, email, password });
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registrasi gagal';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {
      // Ignore logout errors
    }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('nama_lengkap');
    setUser(null);
  }, []);

  const isAdmin = user?.role === 'admin';

  return { user, loading, error, login, register, logout, isAdmin };
}