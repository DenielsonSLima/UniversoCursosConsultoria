// File: modules/gestor/components/ToastNotification.tsx
// Sistema de notificações elegantes para substituir alert() do browser

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  avatarUrl?: string | null;
  avatarName?: string;
  contextLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastNotificationProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onRemove }) => {
  if (typeof document === 'undefined' || toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed left-3 right-3 top-3 z-[2147483647] flex flex-col gap-3 pointer-events-none sm:left-auto sm:right-6 sm:top-6 sm:w-[min(360px,calc(100vw-3rem))]"
      role="region"
      aria-label="Notificações"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>,
    document.body,
  );
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const [avatarFailed, setAvatarFailed] = React.useState(false);

  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), toast.onAction ? 7000 : 4500);
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

  const initials = (toast.avatarName || toast.title || 'UN')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const shouldShowAvatar = Boolean(toast.avatarUrl || toast.avatarName || toast.contextLabel);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl shadow-slate-900/15 ${config.bg} ${config.border} border border-slate-100 max-w-sm w-full animate-slideIn`}
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      <div className="mt-0.5 flex-shrink-0">
        {shouldShowAvatar ? (
          <div className="relative h-11 w-11 overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 shadow-sm">
            {toast.avatarUrl && !avatarFailed ? (
              <img
                src={toast.avatarUrl}
                alt={toast.avatarName || toast.title}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#001a33] text-xs font-black text-white">
                {initials || 'UN'}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 shadow-sm">
              {React.cloneElement(config.icon, { size: 14 })}
            </span>
          </div>
        ) : (
          config.icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        {toast.contextLabel && (
          <p className="mb-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">{toast.contextLabel}</p>
        )}
        <p className={`font-black text-sm uppercase tracking-wide ${config.titleColor}`}>{toast.title}</p>
        {toast.message && <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed">{toast.message}</p>}
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onRemove(toast.id);
            }}
            className="mt-2 text-xs font-black text-blue-700 underline decoration-blue-300 underline-offset-2"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        aria-label="Fechar notificação"
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

  const addToast = React.useCallback((type: ToastType, title: string, message?: string, options?: Omit<Toast, 'id' | 'type' | 'title' | 'message'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message, ...options }]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = React.useMemo(() => ({
    success: (title: string, message?: string, options?: Omit<Toast, 'id' | 'type' | 'title' | 'message'>) => addToast('success', title, message, options),
    error: (title: string, message?: string, options?: Omit<Toast, 'id' | 'type' | 'title' | 'message'>) => addToast('error', title, message, options),
    info: (title: string, message?: string, options?: Omit<Toast, 'id' | 'type' | 'title' | 'message'>) => addToast('info', title, message, options),
  }), [addToast]);

  return { toasts, removeToast, toast };
}

export default ToastNotification;
