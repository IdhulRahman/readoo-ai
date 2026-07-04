import React from 'react';
import { Trash2 } from 'lucide-react';

interface User {
  id: number;
  nama_lengkap: string;
  email: string;
  role: string;
}

interface UsersTabProps {
  users: User[];
  onUpdateRole: (userId: number, newRole: string) => void;
  onDeleteUser: (userId: number) => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  users,
  onUpdateRole,
  onDeleteUser,
}) => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">Manajemen Pengguna</h2>
      
      <div className="max-h-[480px] overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 scrollbar-thin">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-6 py-4">Nama Lengkap</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm text-gray-700 dark:text-gray-300">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                  Tidak ada pengguna terdaftar.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    {u.nama_lengkap}
                  </td>
                  <td className="px-6 py-4">
                    {u.email}
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={u.role}
                      onChange={(e) => onUpdateRole(u.id, e.target.value)}
                      className="text-xs font-medium py-1.5 px-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-750 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all cursor-pointer"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => {
                        if (confirm(`Apakah Anda yakin ingin menghapus pengguna ${u.nama_lengkap}?`)) {
                          onDeleteUser(u.id);
                        }
                      }}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-950/45 rounded-lg text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Hapus Pengguna"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
