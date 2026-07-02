import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { UserPlus, BookOpen } from 'lucide-react';

export default function RegisterPage() {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState('');
  const { register, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess('');
    try {
      await register(nama, email, password);
      setSuccess('Pendaftaran berhasil! Silakan masuk.');
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Daftar Akun</h1>
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">{success}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Lengkap</label>
              <input type="text" value={nama} onChange={(e) => setNama(e.target.value)} className="input-field" placeholder="Nama Anda" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="email@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="Min. 8 karakter, huruf kapital, angka, simbol" required />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Min. 8 karakter, 1 huruf kapital, 1 angka, 1 simbol</p>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {loading ? 'Memproses...' : 'Daftar'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Sudah punya akun? <Link to="/login" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">Masuk</Link>
          </p>
        </div>
      </div>
    </div>
  );
}