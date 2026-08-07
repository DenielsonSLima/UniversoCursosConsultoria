import React from 'react';
import { CheckCheck, Download, LoaderCircle, X } from 'lucide-react';

interface LibrarySelectionToolbarProps {
  count: number;
  isZipDownload: boolean;
  isDownloading: boolean;
  progressMessage?: string;
  onDownload: () => void;
  onClear: () => void;
  onSelectVisible: () => void;
}

const LibrarySelectionToolbar: React.FC<LibrarySelectionToolbarProps> = ({
  count,
  isZipDownload,
  isDownloading,
  progressMessage,
  onDownload,
  onClear,
  onSelectVisible
}) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-[0_12px_30px_rgba(37,99,235,0.10)] sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <p className="text-xs font-black uppercase tracking-wider text-[#001a33]">
        {count} {count === 1 ? 'item selecionado' : 'itens selecionados'}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">
        {isDownloading ? progressMessage || 'Preparando download...' : 'Selecione arquivos e pastas para baixar juntos.'}
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onSelectVisible}
        disabled={isDownloading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCheck size={13} />
        Selecionar visíveis
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={isDownloading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X size={13} />
        Limpar
      </button>
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading || count === 0}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/15 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isDownloading ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
        {isDownloading ? 'Preparando' : isZipDownload ? 'Baixar ZIP' : 'Baixar arquivo'}
      </button>
    </div>
  </div>
);

export default LibrarySelectionToolbar;
