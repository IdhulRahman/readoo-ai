import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LogIn, BookOpen, Moon, Sun } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const toggleDark = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await login(email, password);
      navigate(data.role === 'admin' ? '/admin' : '/chat');
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <button
        onClick={toggleDark}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all"
      >
        {darkMode ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
      </button>

      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Readoo AI</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Asisten AI cerdas untuk Anda</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Masuk</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin atau user"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="admin atau user"
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2 text-sm">
            <p className="text-gray-500 dark:text-gray-400">
              Demo: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">admin</code> / <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">admin</code>
            </p>
            <div className="flex justify-center gap-4">
              <Link to="/register" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                Daftar
              </Link>
              <Link to="/forgot-password" className="text-primary-600 hover:text-primary-700 dark:text-primary-400">
                Lupa Password
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}