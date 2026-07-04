import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { admin, auth } from '../services/api';
import type { Collection, AdminStats } from '../types';
import {
  LayoutDashboard,
  Database,
  Settings2,
  Users,
  ArrowLeft,
  Key,
  X,
} from 'lucide-react';
import { DashboardTab } from '../components/admin/DashboardTab';
import { CollectionsTab } from '../components/admin/CollectionsTab';
import { PersonalisasiTab } from '../components/admin/PersonalisasiTab';
import { UsersTab } from '../components/admin/UsersTab';
import { Button } from '../components/ui/Button';
import { clearVrmCache } from '../components/chat/VrmAvatar';

type Tab = 'dashboard' | 'collections' | 'personalisasi' | 'users';

export default function AdminPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<{ id: number; nama_lengkap: string; email: string; role: string }[]>([]);
  const [message, setMessage] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Confirm Modal state & helper
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isDestructive: false,
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, isDestructive = false) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      isDestructive,
      onConfirm: () => {
        onConfirm();
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Change Password states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

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

  // Fetch dashboard stats
  useEffect(() => {
    if (activeTab === 'dashboard') {
      admin.getStats().then(setStats).catch(() => {});
    }
  }, [activeTab]);

  const loadCollections = () => {
    admin.getCollections().then(setCollections).catch(() => {});
  };

  const loadUsers = () => {
    admin.getUsers().then(setUsers).catch(() => {});
  };

  const handleLogout = async () => {
    clearVrmCache();
    await logout();
    navigate('/login');
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSetActiveCollection = async (colId: number) => {
    try {
      await admin.setActiveCollection(colId);
      loadCollections();
      showMessage('Koleksi aktif diperbarui');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal mengaktifkan koleksi');
    }
  };

  const handleRebuildIndex = async (colId: number) => {
    try {
      await admin.rebuildIndex(colId);
      showMessage('Index FAISS berhasil dibangun ulang');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal membangun ulang index');
    }
  };

  const handleDeleteCollection = (colId: number) => {
    showConfirm(
      'Hapus Koleksi RAG',
      'Apakah Anda yakin ingin menghapus koleksi ini? Semua dokumen terkait akan dihapus secara permanen.',
      async () => {
        try {
          await admin.deleteCollection(colId);
          loadCollections();
          showMessage('Koleksi berhasil dihapus');
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal menghapus koleksi');
        }
      },
      true
    );
  };

  const handleUpdateUserRole = async (userId: number, role: string) => {
    try {
      await admin.updateUserRole(userId, role);
      loadUsers();
      showMessage('Role pengguna berhasil diperbarui');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal memperbarui role');
    }
  };

  const handleDeleteUser = (userId: number) => {
    showConfirm(
      'Hapus Pengguna',
      'Apakah Anda yakin ingin menghapus pengguna ini? Semua data sesi juga akan dihapus secara permanen.',
      async () => {
        try {
          await admin.deleteUser(userId);
          loadUsers();
          showMessage('Pengguna berhasil dihapus');
        } catch (e) {
          alert(e instanceof Error ? e.message : 'Gagal menghapus pengguna');
        }
      },
      true
    );
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'collections', label: 'Koleksi & Dataset', icon: <Database className="w-4 h-4" /> },
    { id: 'personalisasi', label: 'Personalisasi AI', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'users', label: 'Pengguna', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
      {/* Top Bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-3 flex-shrink-0">
        <div className="flex items-center justify-between w-full px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  showConfirm(
                    'Perubahan Belum Disimpan',
                    'Anda memiliki perubahan yang belum disimpan di tab Personalisasi AI. Apakah Anda yakin ingin kembali ke Chat? Perubahan Anda akan hilang.',
                    () => {
                      setHasUnsavedChanges(false);
                      navigate('/chat');
                    }
                  );
                } else {
                  navigate('/chat');
                }
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500"
              title="Kembali ke Chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowPasswordModal(true)} variant="secondary" className="text-sm py-1.5 px-3 flex items-center gap-1.5">
              <Key className="w-4 h-4" /> Ganti Password
            </Button>
            <Button onClick={handleLogout} variant="secondary" className="text-sm py-1.5 px-3">
              Keluar
            </Button>
          </div>
        </div>
      </header>

      {message && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in text-sm font-medium">
          {message}
        </div>
      )}

      <div className="flex flex-col md:flex-row w-full px-4 md:px-8 min-h-[calc(100vh-4rem)]">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-2 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible whitespace-nowrap md:whitespace-normal scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (hasUnsavedChanges) {
                  showConfirm(
                    'Perubahan Belum Disimpan',
                    'Anda memiliki perubahan yang belum disimpan di tab Personalisasi AI. Apakah Anda yakin ingin berpindah tab? Perubahan Anda akan hilang.',
                    () => {
                      setHasUnsavedChanges(false);
                      setActiveTab(tab.id);
                      if (tab.id === 'collections') loadCollections();
                      if (tab.id === 'users') loadUsers();
                    }
                  );
                } else {
                  setActiveTab(tab.id);
                  if (tab.id === 'collections') loadCollections();
                  if (tab.id === 'users') loadUsers();
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0 mr-1 md:mb-1 md:mr-0 transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          {activeTab === 'dashboard' && <DashboardTab stats={stats} />}

          {activeTab === 'collections' && (
            <CollectionsTab
              collections={collections}
              onRefresh={loadCollections}
              onSetActive={handleSetActiveCollection}
              onRebuildIndex={handleRebuildIndex}
              onDelete={handleDeleteCollection}
            />
          )}

          {activeTab === 'personalisasi' && (
            <PersonalisasiTab onSuccess={showMessage} setHasUnsavedChanges={setHasUnsavedChanges} />
          )}

          {activeTab === 'users' && (
            <UsersTab
              users={users}
              onUpdateRole={handleUpdateUserRole}
              onDeleteUser={handleDeleteUser}
            />
          )}
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-all text-sm"
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
      {/* Custom Web Confirm Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-150 dark:border-gray-700 overflow-hidden transform transition-all duration-300 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h3 className="font-semibold text-gray-900 dark:text-white text-base">
                {confirmModal.title}
              </h3>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {confirmModal.message}
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2.5 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-150 dark:border-gray-700">
              <Button
                variant="secondary"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="text-xs py-2 px-4"
              >
                Batal
              </Button>
              <Button
                onClick={confirmModal.onConfirm}
                className={`text-xs py-2 px-4 text-white border-none ${
                  confirmModal.isDestructive
                    ? 'bg-red-650 hover:bg-red-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
              >
                Konfirmasi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}