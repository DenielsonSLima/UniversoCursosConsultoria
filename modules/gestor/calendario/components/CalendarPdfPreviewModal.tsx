import React from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

interface CalendarPdfPreviewModalProps {
  url: string;
  fileName: string;
  year: number;
  onClose: () => void;
}

const CalendarPdfPreviewModal: React.FC<CalendarPdfPreviewModalProps> = ({
  url,
  fileName,
  year,
  onClose,
}) => (
  <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
    <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <FileText size={19} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-black uppercase tracking-tight text-[#001a33]">
              Pré-visualização do calendário
            </h3>
            <p className="text-xs font-bold text-slate-400">Calendário anual de {year} • 2 páginas</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={15} />
            Abrir em nova guia
          </button>
          <a
            href={url}
            download={fileName}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-red-700 hover:bg-red-50"
          >
            <Download size={15} />
            Baixar PDF
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
            title="Fechar pré-visualização"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 bg-slate-200/70 p-3 sm:p-4">
        <iframe
          src={url}
          title={`Pré-visualização do calendário de ${year}`}
          className="h-full w-full rounded-xl border border-slate-300 bg-white shadow-inner"
        />
      </div>
    </div>
  </div>
);

export default CalendarPdfPreviewModal;
