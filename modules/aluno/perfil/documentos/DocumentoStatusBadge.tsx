import React from 'react';
import { CheckCircle2, Clock3, FileQuestion, FolderArchive, XCircle } from 'lucide-react';
import type { DocumentoAlunoStatus } from '../../../shared/documentos-aluno/documentos-aluno.types';

interface DocumentoStatusBadgeProps {
  status: DocumentoAlunoStatus;
}

const statusConfig: Record<
  DocumentoAlunoStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  nao_enviado: {
    label: 'Pendente de envio',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: <FileQuestion size={11} aria-hidden="true" />,
  },
  pendente: {
    label: 'Em análise',
    className: 'border-blue-100 bg-blue-50 text-blue-700',
    icon: <Clock3 size={11} aria-hidden="true" />,
  },
  aprovado: {
    label: 'Aprovado',
    className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    icon: <CheckCircle2 size={11} aria-hidden="true" />,
  },
  recusado: {
    label: 'Recusado',
    className: 'border-red-100 bg-red-50 text-red-700',
    icon: <XCircle size={11} aria-hidden="true" />,
  },
  arquivado: {
    label: 'Arquivado',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
    icon: <FolderArchive size={11} aria-hidden="true" />,
  },
};

const DocumentoStatusBadge: React.FC<DocumentoStatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
};

export default DocumentoStatusBadge;
