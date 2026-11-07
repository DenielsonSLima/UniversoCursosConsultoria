import React from 'react';
import { RefreshCw } from 'lucide-react';
import ToastNotification from '../../components/ToastNotification';

interface IntegracaoBancariaStateProps {
  loading?: boolean;
  message?: string;
  toasts: React.ComponentProps<typeof ToastNotification>['toasts'];
  onRemove: React.ComponentProps<typeof ToastNotification>['onRemove'];
}

export default function IntegracaoBancariaState({ loading, message, toasts, onRemove }: IntegracaoBancariaStateProps) {
  return loading ? (
    <div className="flex flex-col items-center justify-center py-12">
      <ToastNotification toasts={toasts} onRemove={onRemove} />
      <RefreshCw className="mb-4 animate-spin text-blue-500" size={32} />
      <p className="text-sm font-bold text-slate-500">Carregando integração bancária...</p>
    </div>
  ) : (
    <div className="rounded-lg border border-red-100 bg-red-50 p-6 text-center">
      <ToastNotification toasts={toasts} onRemove={onRemove} />
      <p className="font-bold text-red-700">Erro ao carregar integração bancária</p>
      <p className="mt-1 text-sm text-red-500">{message}</p>
    </div>
  );
}
