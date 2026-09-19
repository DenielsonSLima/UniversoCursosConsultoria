import React, { useId, useRef } from 'react';
import {
  Archive, ClipboardCheck, Eye, FileClock, FileText, Loader2,
  MoreHorizontal, RotateCcw, ShieldCheck, Trash2,
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
  'inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45';

const DocumentoChecklistCard: React.FC<DocumentoChecklistCardProps> = ({
  item, busy = false, onPreview, onHistory, onReview, onArchive,
  onUpload, onMarkReceived, onRevokeReceived,
}) => {
  const uploadInputId = useId();
  const uploadInput = useRef<HTMLInputElement>(null);
  const more = useRef<React.ComponentRef<'details'>>(null);
  const hasVersion = Boolean(item.versaoAtual);
  const canReview = item.status === 'pendente' && hasVersion;
  const hasLegacyReceipt = Boolean(item.recebimentoSemAnexo);
  const canUpload = ['nao_enviado', 'recusado'].includes(item.status) || hasLegacyReceipt;
  const canMarkReceived = !hasVersion && !hasLegacyReceipt;
  const primaryAction = canUpload && onUpload ? 'upload' : canReview ? 'review' : 'preview';
  const actions = [
    { id: 'upload', label: 'Anexar', icon: FileText, visible: canUpload && !!onUpload, disabled: busy, run: () => uploadInput.current?.click() },
    { id: 'received', label: 'Marcar entregue', icon: ClipboardCheck, visible: canMarkReceived && !!onMarkReceived, disabled: busy, run: () => onMarkReceived?.(item) },
    { id: 'revoke', label: 'Corrigir registro', icon: RotateCcw, visible: hasLegacyReceipt && !!onRevokeReceived, disabled: busy, run: () => onRevokeReceived?.(item) },
    { id: 'preview', label: 'Visualizar', icon: Eye, visible: true, disabled: !hasVersion || busy, run: () => onPreview?.(item) },
    { id: 'history', label: 'Histórico', icon: FileClock, visible: true, disabled: item.versoes.length === 0 || busy, run: () => onHistory?.(item) },
    { id: 'review', label: 'Revisar', icon: ShieldCheck, visible: true, disabled: !canReview || busy, run: () => onReview?.(item) },
    { id: 'archive', label: 'Arquivar', icon: Archive, visible: true, disabled: !hasVersion || busy, run: () => onArchive?.(item) },
    { id: 'delete', label: 'Excluir', icon: Trash2, visible: true, disabled: true, run: () => {}, title: 'Arquive a versão atual e use o Histórico para excluir o arquivo.' },
  ].filter((action) => action.visible);
  const primary = actions.find((action) => action.id === primaryAction)!;
  const PrimaryIcon = primary.icon;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            <FileText aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="break-words text-sm font-semibold leading-snug text-[#001a33]">{item.nome}</h4>
              {item.obrigatorio === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Condicional</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DocumentoStatusBadge status={item.status} />
              <span className={`text-xs ${hasLegacyReceipt ? 'text-blue-700' : 'text-slate-500'}`}>
                {hasLegacyReceipt ? 'Entregue e conferido · sem arquivo anexado' : item.versaoAtual
                  ? `Versão ${item.versaoAtual.numero} · ${item.versaoAtual.fontes.length} ${item.versaoAtual.fontes.length === 1 ? 'arquivo' : 'arquivos'}`
                  : 'Aguardando primeiro envio'}
              </span>
            </div>
            {item.versaoAtual?.motivoRecusa && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-red-600">Motivo: {item.versaoAtual.motivoRecusa}</p>}
            {item.recebimentoSemAnexo && (
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-500">
                Registro administrativo: {item.recebimentoSemAnexo.motivo}{' · '}
                {item.recebimentoSemAnexo.recebidoPorNome || 'Gestor responsável'}{' · '}
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.recebimentoSemAnexo.recebidoEm))}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
          {canUpload && onUpload && (
            <input ref={uploadInput} id={uploadInputId} type="file" multiple
              aria-label={`Anexar arquivo a ${item.nome}`}
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden" disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = '';
                if (files.length) onUpload(item, files);
              }} />
          )}
          <button type="button" disabled={primary.disabled} onClick={primary.run}
            className={`${actionClassName} border-[#001a33] bg-[#001a33] text-white hover:bg-blue-950`}>
            <PrimaryIcon aria-hidden="true" size={14} /> {primary.label}
          </button>
          <details ref={more} className="relative"
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}>
            <summary aria-label={`Mais ações para ${item.nome}`}
              className={`${actionClassName} list-none cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&::-webkit-details-marker]:hidden`}>
              <MoreHorizontal aria-hidden="true" size={16} /> Mais
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {actions.filter((action) => action.id !== primaryAction).map(({ id, label, icon: Icon, disabled, run, title }) => (
                <button key={id} type="button" disabled={disabled} title={title}
                  onClick={() => { if (more.current) more.current.open = false; more.current?.querySelector('summary')?.focus(); run(); }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45">
                  <Icon aria-hidden="true" size={15} /> {label}
                </button>
              ))}
              <p className="px-3 py-2 text-xs text-slate-500">Exclusão de arquivos pelo Histórico, após arquivar a versão atual.</p>
            </div>
          </details>
          {busy && <Loader2 role="status" aria-label="Processando" className="animate-spin text-blue-600" size={16} />}
        </div>
      </div>
    </article>
  );
};

export default DocumentoChecklistCard;
