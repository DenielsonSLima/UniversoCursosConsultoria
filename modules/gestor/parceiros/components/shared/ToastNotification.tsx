// File: modules/gestor/parceiros/components/shared/ToastNotification.tsx
// Sistema de notificações elegantes para substituir alert() do browser

import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const config = {
    success: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-emerald-500',
      icon: <CheckCircle2 className="text-emerald-500" size={22} />,
      titleColor: 'text-emerald-700',
    },
    error: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-red-500',
      icon: <XCircle className="text-red-500" size={22} />,
      titleColor: 'text-red-700',
    },
    info: {
      bg: 'bg-white',
      border: 'border-l-4 border-l-blue-500',
      icon: <Info className="text-blue-500" size={22} />,
      titleColor: 'text-blue-700',
    },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl shadow-slate-900/15 ${config.bg} ${config.border} border border-slate-100 max-w-sm w-full animate-slideIn`}
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`font-black text-sm uppercase tracking-wide ${config.titleColor}`}>{toast.title}</p>
        {toast.message && <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">{toast.message}</p>}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
};

// Hook para gerenciar toasts
export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((type: ToastType, title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = React.useMemo(() => ({
    success: (title: string, message?: string) => addToast('success', title, message),
    error: (title: string, message?: string) => addToast('error', title, message),
    info: (title: string, message?: string) => addToast('info', title, message),
  }), [addToast]);

  return { toasts, removeToast, toast };
}

export default ToastNotification;
