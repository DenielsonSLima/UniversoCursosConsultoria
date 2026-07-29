import React, { useId } from 'react';
import {
  Archive,
  ClipboardCheck,
  Eye,
  FileClock,
  FileText,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { DocumentoAlunoChecklistItem } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentoStatusBadge from './DocumentoStatusBadge';

interface DocumentoChecklistCardProps {
  item: DocumentoAlunoChecklistItem;
  busy?: boolean;
  onPreview?: (item: DocumentoAlunoChecklistItem) => void;
  onHistory?: (item: DocumentoAlunoChecklistItem) => void;
  onReview?: (item: DocumentoAlunoChecklistItem) => void;
  onArchive?: (item: DocumentoAlunoChecklistItem) => void;
  onUpload?: (item: DocumentoAlunoChecklistItem, files: File[]) => void;
  onMarkReceived?: (item: DocumentoAlunoChecklistItem) => void;
  onRevokeReceived?: (item: DocumentoAlunoChecklistItem) => void;
}

const actionClassName =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-[9px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45';

const DocumentoChecklistCard: React.FC<DocumentoChecklistCardProps> = ({
  item,
  busy = false,
  onPreview,
  onHistory,
  onReview,
  onArchive,
  onUpload,
  onMarkReceived,
  onRevokeReceived,
}) => {
  const uploadInputId = useId();
  const hasVersion = Boolean(item.versaoAtual);
  const canReview = item.status === 'pendente' && hasVersion;
  const hasLegacyReceipt = Boolean(item.recebimentoSemAnexo);
  const canUpload =
    ['nao_enviado', 'recusado'].includes(item.status) || hasLegacyReceipt;
  const canMarkReceived = !hasVersion && !hasLegacyReceipt;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              item.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <FileText aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-sm font-black leading-snug text-[#001a33]">{item.nome}</h4>
              {item.obrigatorio === false ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-slate-500">
                  Condicional
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DocumentoStatusBadge status={item.status} />
              {hasLegacyReceipt ? (
                <span className="text-[9px] font-bold text-blue-600">
                  Recebido no sistema anterior · sem arquivo anexado
                </span>
              ) : item.versaoAtual ? (
                <span className="text-[9px] font-bold text-slate-400">
                  Versão {item.versaoAtual.numero} · {item.versaoAtual.fontes.length}{' '}
                  {item.versaoAtual.fontes.length === 1 ? 'arquivo' : 'arquivos'}
                </span>
              ) : (
                <span className="text-[9px] font-bold text-slate-400">Aguardando primeiro envio</span>
              )}
            </div>
            {item.versaoAtual?.motivoRecusa ? (
              <p className="mt-2 max-w-2xl text-[10px] font-semibold leading-relaxed text-red-600">
                Motivo: {item.versaoAtual.motivoRecusa}
              </p>
            ) : null}
            {item.recebimentoSemAnexo ? (
              <p className="mt-2 max-w-2xl text-[10px] font-semibold leading-relaxed text-slate-600">
                Registro legado: {item.recebimentoSemAnexo.motivo}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canUpload && onUpload ? (
            <>
              <input
                id={uploadInputId}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (files.length) onUpload(item, files);
                }}
              />
              <label
                htmlFor={uploadInputId}
                className={`${actionClassName} cursor-pointer border-slate-200 bg-[#001a33] text-white hover:bg-blue-950`}
              >
                <FileText aria-hidden="true" size={13} /> Anexar
              </label>
            </>
          ) : null}
          {canMarkReceived && onMarkReceived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMarkReceived(item)}
              className={`${actionClassName} border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100`}
            >
              <ClipboardCheck aria-hidden="true" size={13} /> Recebido
            </button>
          ) : null}
          {hasLegacyReceipt && onRevokeReceived ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRevokeReceived(item)}
              className={`${actionClassName} border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100`}
            >
              <RotateCcw aria-hidden="true" size={13} /> Corrigir registro
            </button>
          ) : null}
          <button
            type="button"
            disabled={!hasVersion || busy}
            onClick={() => onPreview?.(item)}
            className={`${actionClassName} border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100`}
          >
            <Eye aria-hidden="true" size={13} /> Visualizar
          </button>
          <button
            type="button"
            disabled={item.versoes.length === 0 || busy}
            onClick={() => onHistory?.(item)}
            className={`${actionClassName} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}
          >
            <FileClock aria-hidden="true" size={13} /> Histórico
          </button>
          <button
            type="button"
            disabled={!canReview || busy}
            onClick={() => onReview?.(item)}
            className={`${actionClassName} border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
          >
            <ShieldCheck aria-hidden="true" size={13} /> Revisar
          </button>
          <div className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <button
            type="button"
            aria-label={`Arquivar ${item.nome}`}
            title="Arquivar"
            disabled={!hasVersion || busy}
            onClick={() => onArchive?.(item)}
            className={`${actionClassName} w-9 border-amber-100 bg-amber-50 px-0 text-amber-700 hover:bg-amber-100`}
          >
            <Archive aria-hidden="true" size={13} />
          </button>
          <button
            type="button"
            aria-label={`Excluir ${item.nome}`}
            title="Arquive a versão atual e use o Histórico para excluir o arquivo."
            disabled
            className={`${actionClassName} w-9 border-red-100 bg-red-50 px-0 text-red-700 hover:bg-red-100`}
          >
            <Trash2 aria-hidden="true" size={13} />
          </button>
          {busy ? <MoreHorizontal aria-label="Processando" className="animate-pulse text-slate-400" size={18} /> : null}
        </div>
      </div>
    </article>
  );
};

export default DocumentoChecklistCard;
