import React from 'react';
import { Files, FileText } from 'lucide-react';
import type { DocumentoAlunoModoEnvio } from '../../../shared/documentos-aluno/documentos-aluno.types';

interface DocumentoEnvioModoSelectorProps {
  value: DocumentoAlunoModoEnvio;
  onChange: (mode: DocumentoAlunoModoEnvio) => void;
  disabled?: boolean;
}

const options: Array<{
  value: DocumentoAlunoModoEnvio;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'separado',
    title: 'Documentos separados',
    description: 'Envie um ou mais arquivos em cada item do checklist.',
    icon: <Files size={18} aria-hidden="true" />,
  },
  {
    value: 'pdf_unico',
    title: 'PDF único',
    description: 'Envie um PDF com todos os documentos para a secretaria organizar.',
    icon: <FileText size={18} aria-hidden="true" />,
  },
];

const DocumentoEnvioModoSelector: React.FC<DocumentoEnvioModoSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => (
  <fieldset disabled={disabled}>
    <legend className="text-xs font-black uppercase tracking-wider text-[#001a33]">
      Como deseja enviar?
    </legend>
    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
      Você poderá completar itens faltantes separadamente depois que a secretaria organizar um PDF único.
    </p>

    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex min-h-24 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50'
            }`}
          >
            <span
              className={`mt-0.5 rounded-xl p-2 ${selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {option.icon}
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-wide">{option.title}</span>
              <span className="mt-1 block text-[11px] font-medium leading-relaxed text-slate-500">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </fieldset>
);

export default DocumentoEnvioModoSelector;

