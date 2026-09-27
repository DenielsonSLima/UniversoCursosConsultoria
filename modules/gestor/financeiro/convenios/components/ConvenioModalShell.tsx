import React from 'react';
import { X } from 'lucide-react';

interface ConvenioModalShellProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}

const ConvenioModalShell: React.FC<ConvenioModalShellProps> = ({
  title,
  subtitle,
  onClose,
  children,
}) => (
  <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm animate-fadeIn">
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="my-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">{title}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </div>
  </div>
);

export default ConvenioModalShell;
