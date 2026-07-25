import React, { useId } from 'react';
import { FileText, Loader2, Send, Upload } from 'lucide-react';
import { DOCUMENTO_ALUNO_MAX_PDF_UNICO_BYTES } from '../../../shared/documentos-aluno/documentos-aluno.constants';
import ArquivosSelecionados from './ArquivosSelecionados';

interface PdfUnicoUploaderProps {
  selectedFile: File | null;
  uploading?: boolean;
  disabled?: boolean;
  blockReason?: string | null;
  error?: string | null;
  onFileSelected: (file: File | null) => void;
  onSubmit: () => void;
}

const PdfUnicoUploader: React.FC<PdfUnicoUploaderProps> = ({
  selectedFile,
  uploading = false,
  disabled = false,
  blockReason = null,
  error = null,
  onFileSelected,
  onSubmit,
}) => {
  const inputId = useId();
  const locked = disabled || uploading;
  const maxMegabytes = Math.round(DOCUMENTO_ALUNO_MAX_PDF_UNICO_BYTES / 1024 / 1024);

  return (
    <section className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-100 p-2 text-blue-700">
          <FileText size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-[#001a33]">Enviar um PDF único</h3>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
            Reúna os documentos em um único PDF. A secretaria identificará as páginas de cada item.
          </p>
        </div>
      </div>

      {blockReason ? (
        <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] font-semibold leading-relaxed text-blue-700">
          {blockReason}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <label
          htmlFor={inputId}
          className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-center transition ${
            locked
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'cursor-pointer border-slate-300 bg-white text-slate-500 hover:border-blue-500 hover:text-blue-600'
          }`}
        >
          <Upload size={20} aria-hidden="true" />
          <span className="text-[10px] font-black uppercase tracking-wider">
            {selectedFile ? 'Trocar PDF selecionado' : 'Escolher PDF'}
          </span>
          <span className="text-[9px] font-medium text-slate-400">Um arquivo de até {maxMegabytes} MB</span>
        </label>
        <input
          id={inputId}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={locked}
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            event.target.value = '';
            onFileSelected(file);
          }}
        />

        {selectedFile ? (
          <ArquivosSelecionados
            files={[selectedFile]}
            disabled={uploading}
            onRemove={() => onFileSelected(null)}
          />
        ) : null}

        {error ? (
          <p role="alert" className="text-[10px] font-bold leading-relaxed text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={locked || !selectedFile}
          onClick={onSubmit}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {uploading ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Enviando PDF
            </>
          ) : (
            <>
              <Send size={14} aria-hidden="true" /> Enviar PDF para organização
            </>
          )}
        </button>
      </div>
    </section>
  );
};

export default PdfUnicoUploader;

