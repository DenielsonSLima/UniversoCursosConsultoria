import React from 'react';
import { Eye, FileText, XCircle } from 'lucide-react';
import type { DocumentoAlunoArquivo } from '../../../shared/documentos-aluno/documentos-aluno.types';
import {
  formatDocumentoAlunoBytes,
  formatDocumentoAlunoData,
} from './documentos-aluno.formatters';

export type PdfUnicoEnvioStatus =
  | 'preparando'
  | 'aguardando_mapeamento'
  | 'mapeado'
  | 'arquivado'
  | 'exclusao_pendente'
  | 'excluido';

export interface PdfUnicoEnvioResumo {
  id: string;
  status: PdfUnicoEnvioStatus;
  arquivos: DocumentoAlunoArquivo[];
  criadoEm: string;
  finalizadoEm?: string | null;
  observacao?: string | null;
}

interface PdfUnicoStatusCardProps {
  envio: PdfUnicoEnvioResumo;
  title?: string;
  cancelling?: boolean;
  onOpenArquivo?: (arquivo: DocumentoAlunoArquivo) => void;
  onCancel?: () => void;
}

const statusLabels: Record<PdfUnicoEnvioStatus, string> = {
  preparando: 'Preparando envio',
  aguardando_mapeamento: 'Aguardando organização',
  mapeado: 'Documentos organizados',
  arquivado: 'Arquivado',
  exclusao_pendente: 'Exclusão em andamento',
  excluido: 'Excluído',
};

const statusMessages: Record<PdfUnicoEnvioStatus, string> = {
  preparando: 'O arquivo ainda está sendo preparado para envio.',
  aguardando_mapeamento: 'PDF recebido. A secretaria identificará os documentos e as páginas correspondentes.',
  mapeado: 'A secretaria já organizou o PDF. A análise continua individualmente em cada documento.',
  arquivado: 'Este envio foi arquivado pela secretaria e permanece no histórico.',
  exclusao_pendente: 'A secretaria está concluindo a exclusão administrativa deste envio.',
  excluido: 'Este envio foi excluído pela secretaria.',
};

const PdfUnicoStatusCard: React.FC<PdfUnicoStatusCardProps> = ({
  envio,
  title = 'PDF consolidado',
  cancelling = false,
  onOpenArquivo,
  onCancel,
}) => (
  <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="shrink-0 rounded-xl bg-blue-50 p-2 text-blue-600">
          <FileText size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4 className="text-xs font-black uppercase tracking-wide text-[#001a33]">{title}</h4>
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            Enviado em {formatDocumentoAlunoData(envio.finalizadoEm || envio.criadoEm)}
          </p>
        </div>
      </div>
      <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700">
        {statusLabels[envio.status]}
      </span>
    </div>

    <p className="mt-3 text-[11px] font-medium leading-relaxed text-slate-600">
      {statusMessages[envio.status]}
    </p>

    {envio.observacao ? (
      <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] font-semibold leading-relaxed text-amber-800">
        {envio.observacao}
      </p>
    ) : null}

    {envio.arquivos.length ? (
      <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {envio.arquivos.map((arquivo) => (
          <li key={arquivo.id} className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold text-slate-700">{arquivo.nome}</span>
              <span className="block text-[9px] font-medium text-slate-400">
                {formatDocumentoAlunoBytes(arquivo.tamanhoBytes)}
                {arquivo.totalPaginas ? ` · ${arquivo.totalPaginas} páginas` : ''}
              </span>
            </span>
            {onOpenArquivo && envio.status !== 'excluido' ? (
              <button
                type="button"
                onClick={() => onOpenArquivo(arquivo)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-black uppercase text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Eye size={12} aria-hidden="true" /> Visualizar
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null}

    {envio.status === 'preparando' && onCancel ? (
      <button
        type="button"
        disabled={cancelling}
        onClick={onCancel}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 text-[9px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"
      >
        <XCircle size={13} aria-hidden="true" />
        {cancelling ? 'Cancelando…' : 'Cancelar envio incompleto'}
      </button>
    ) : null}
  </article>
);

export default PdfUnicoStatusCard;
