import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface TechnicalDataErrorProps {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}

const TechnicalDataError: React.FC<TechnicalDataErrorProps> = ({
  title,
  message,
  onRetry,
  retrying = false,
}) => (
  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert">
    <div className="flex items-start gap-3">
      <AlertTriangle size={19} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wider">{title}</p>
        <p className="mt-1 text-xs leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
        >
          <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} />
          Tentar novamente
        </button>
      </div>
    </div>
  </div>
);

export default TechnicalDataError;
