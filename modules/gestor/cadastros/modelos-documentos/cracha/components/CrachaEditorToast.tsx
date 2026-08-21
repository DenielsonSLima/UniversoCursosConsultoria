import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type CrachaEditorToastState = {
  message: string;
  type: 'success' | 'error' | 'warning';
};

const CrachaEditorToast: React.FC<{ toast: CrachaEditorToastState }> = ({ toast }) => (
  <div className="fixed top-6 right-6 z-[99999] animate-fadeIn" role="status" aria-live="polite">
    <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
      toast.type === 'success'
        ? 'bg-emerald-500/95 border-emerald-400 text-white'
        : toast.type === 'error'
          ? 'bg-red-500/95 border-red-400 text-white'
          : 'bg-amber-500/95 border-amber-400 text-white'
    }`}>
      {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
    </div>
  </div>
);

export default CrachaEditorToast;
