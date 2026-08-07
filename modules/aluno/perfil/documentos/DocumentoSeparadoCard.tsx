import React, { useId } from 'react';
import { AlertCircle, Eye, Loader2, Send, Upload } from 'lucide-react';
import { DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM } from '../../../shared/documentos-aluno/documentos-aluno.constants';
import type {
  DocumentoAlunoArquivo,
  DocumentoAlunoChecklistItem,
} from '../../../shared/documentos-aluno/documentos-aluno.types';
import ArquivosSelecionados from './ArquivosSelecionados';
import DocumentoStatusBadge from './DocumentoStatusBadge';

interface DocumentoSeparadoCardProps {
  documento: DocumentoAlunoChecklistItem;
  selectedFiles: File[];
  uploading?: boolean;
  canSubmit?: boolean;
  blockReason?: string | null;
  error?: string | null;
  onFilesSelected: (documentoId: string, files: File[]) => void;
  onRemoveSelectedFile: (documentoId: string, index: number) => void;
  onSubmit: (documentoId: string) => void;
  onOpenArquivo?: (arquivo: DocumentoAlunoArquivo) => void;
}

const DocumentoSeparadoCard: React.FC<DocumentoSeparadoCardProps> = ({
  documento,
  selectedFiles,
  uploading = false,
  canSubmit,
  blockReason = null,
  error = null,
  onFilesSelected,
  onRemoveSelectedFile,
  onSubmit,
  onOpenArquivo,
}) => {
  const inputId = useId();
  const currentVersion = documento.versaoAtual;
  const submissionAllowed = canSubmit ?? ['nao_enviado', 'recusado'].includes(documento.status);
  const locked = !submissionAllowed || uploading;
  const status = documento.status;
  const files = currentVersion?.fontes || [];

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-medium">
      <div className="flex flex-col items-start gap-2 min-[390px]:flex-row min-[390px]:justify-between">
        <div className="min-w-0 space-y-1">
          <h4 className="break-words font-bold text-[#001a33]">{documento.nome}</h4>
          {currentVersion ? (
            <p className="text-[9px] font-semibold text-slate-400">
              Versão {currentVersion.numero} · {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
            </p>
          ) : (
            <p className="text-[9px] text-slate-400">Pendente de entrega</p>
          )}
        </div>
        <DocumentoStatusBadge status={status} />
      </div>

      {currentVersion?.motivoRecusa ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[10px] font-semibold leading-relaxed text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="block font-black uppercase tracking-wide">Motivo da recusa</span>
            {currentVersion.motivoRecusa}
          </span>
        </div>
      ) : null}

      {!submissionAllowed && (blockReason || documento.status === 'pendente' || documento.status === 'aprovado') ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] font-semibold leading-relaxed text-blue-700">
          {blockReason || (documento.status === 'aprovado'
            ? 'Documento aprovado. Somente a gestão pode arquivar ou excluir esta versão.'
            : 'Documento enviado e bloqueado enquanto a secretaria realiza a análise.')}
        </p>
      ) : null}

      {submissionAllowed ? (
        <div className="space-y-3">
          <label
            htmlFor={inputId}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-center text-[10px] font-black transition ${
              locked
                ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                : 'cursor-pointer text-slate-500 hover:border-blue-500 hover:bg-white hover:text-blue-600'
            }`}
          >
            <Upload size={14} aria-hidden="true" />
            {selectedFiles.length ? 'Adicionar mais arquivos' : 'Escolher arquivos'}
          </label>
          <input
            id={inputId}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={locked}
            onChange={(event) => {
              const incoming = Array.from(event.target.files || []);
              event.target.value = '';
              if (incoming.length) onFilesSelected(documento.id, incoming);
            }}
          />
          <p className="text-[9px] font-medium leading-relaxed text-slate-400">
            PDF, JPG, PNG ou WEBP. Até {DOCUMENTO_ALUNO_MAX_ARQUIVOS_POR_ITEM} arquivos por item.
          </p>

          <ArquivosSelecionados
            files={selectedFiles}
            disabled={uploading}
            onRemove={(index) => onRemoveSelectedFile(documento.id, index)}
          />

          {error ? (
            <p role="alert" className="text-[10px] font-bold leading-relaxed text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={uploading || selectedFiles.length === 0}
            onClick={() => onSubmit(documento.id)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Enviando
              </>
            ) : (
              <>
                <Send size={14} aria-hidden="true" /> Enviar para análise
              </>
            )}
          </button>
        </div>
      ) : null}

      {files.length ? (
        <div className="border-t border-slate-200 pt-3">
          <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">
            Arquivos da versão atual
          </p>
          <ul className="space-y-1.5">
            {files.map((source) => (
              <li key={source.id} className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[10px] font-semibold text-slate-600">
                  {source.arquivo.nome}
                </span>
                {onOpenArquivo ? (
                  <button
                    type="button"
                    onClick={() => onOpenArquivo(source.arquivo)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Eye size={11} aria-hidden="true" /> Visualizar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
};

export default DocumentoSeparadoCard;
