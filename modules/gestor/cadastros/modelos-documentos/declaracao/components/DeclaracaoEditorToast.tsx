import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { EditorToast } from './declaracao-editor.types';

interface DeclaracaoEditorToastProps {
  toast: EditorToast | null;
}

const DeclaracaoEditorToast: React.FC<DeclaracaoEditorToastProps> = ({ toast }) => {
  if (!toast) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] animate-fadeIn">
      <div
        className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-500/95 border-emerald-400 text-white'
            : 'bg-red-500/95 border-red-400 text-white'
        }`}
      >
        {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
      </div>
    </div>
  );
};

export default DeclaracaoEditorToast;
