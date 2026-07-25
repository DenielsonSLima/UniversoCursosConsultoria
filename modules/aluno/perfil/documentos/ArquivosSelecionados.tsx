import React from 'react';
import { FileText, X } from 'lucide-react';
import { formatDocumentoAlunoBytes } from './documentos-aluno.formatters';

interface ArquivosSelecionadosProps {
  files: File[];
  disabled?: boolean;
  onRemove: (index: number) => void;
}

const ArquivosSelecionados: React.FC<ArquivosSelecionadosProps> = ({
  files,
  disabled = false,
  onRemove,
}) => {
  if (!files.length) return null;

  return (
    <ul className="space-y-2" aria-label="Arquivos selecionados">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
        >
          <FileText size={14} className="shrink-0 text-blue-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-bold text-slate-700">{file.name}</span>
            <span className="block text-[9px] font-medium text-slate-400">
              {formatDocumentoAlunoBytes(file.size)}
            </span>
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(index)}
            aria-label={`Remover ${file.name}`}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
};

export default ArquivosSelecionados;

