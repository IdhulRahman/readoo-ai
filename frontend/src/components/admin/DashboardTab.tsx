import React from 'react';
import { Card } from '../ui/Card';
import type { AdminStats } from '../../types';

interface DashboardTabProps {
  stats: AdminStats | null;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ stats }) => {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Pengguna</p>
          <p className="text-2xl font-bold mt-1">{stats?.total_users ?? '-'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Koleksi</p>
          <p className="text-2xl font-bold mt-1">{stats?.total_collections ?? '-'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Dokumen</p>
          <p className="text-2xl font-bold mt-1">{stats?.total_documents ?? '-'}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sesi Aktif</p>
          <p className="text-2xl font-bold mt-1">{stats?.active_sessions ?? '-'}</p>
        </Card>
      </div>

      {stats?.collections && stats.collections.length > 0 && (
        <Card className="mt-6">
          <h3 className="font-semibold mb-3">Koleksi & Dokumen</h3>
          <div className="max-h-[220px] overflow-y-auto pr-2 scrollbar-thin space-y-2">
            {stats.collections.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <span className="text-gray-700 dark:text-gray-300">{c.name}</span>
                <span className="text-gray-500 text-xs">{c.document_count} dokumen</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
