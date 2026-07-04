import React from 'react';
import { MessageSquare, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { ChatSession } from '../../types';

interface SidebarProps {
  sessions: ChatSession[];
  currentSession: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onNewChat: () => void;
  sidebarOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSession,
  onSelectSession,
  onDeleteSession,
  onNewChat,
  sidebarOpen,
  onClose,
}) => {
  return (
    <>
      {/* Sidebar container */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Riwayat Chat</h2>
            <button
              onClick={onClose}
              className="lg:hidden p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <Button
            onClick={onNewChat}
            variant="secondary"
            className="mt-3 w-full text-sm py-2"
          >
            + Chat Baru
          </Button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-8rem)]">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 transition-all duration-150 ${
                currentSession === s.id
                  ? 'bg-blue-50/80 dark:bg-blue-900/20 border-l-4 border-l-blue-500 pl-2 font-medium'
                  : 'border-l-4 border-l-transparent'
              }`}
            >
              <MessageSquare className={`w-4 h-4 flex-shrink-0 ${currentSession === s.id ? 'text-blue-500' : 'text-gray-400'}`} />
              <span className={`text-sm truncate flex-1 ${currentSession === s.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {s.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              >
                <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}
    </>
  );
};
