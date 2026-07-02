import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/chat" replace />;
  
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/chat" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/chat" replace /> : <RegisterPage />} />
        <Route path="/forgot-password" element={user ? <Navigate to="/chat" replace /> : <ForgotPasswordPage />} />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? "/chat" : "/login"} replace />} />
      </Routes>
    </div>
  );
}