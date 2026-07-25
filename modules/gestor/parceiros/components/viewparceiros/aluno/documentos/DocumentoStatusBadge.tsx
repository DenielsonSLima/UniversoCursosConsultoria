import React from 'react';
import { Archive, CheckCircle2, Clock3, CircleDashed, XCircle } from 'lucide-react';
import { DocumentoAlunoStatus } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';

const statusConfig: Record<
  DocumentoAlunoStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  nao_enviado: {
    label: 'Não enviado',
    icon: CircleDashed,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  pendente: {
    label: 'Em análise',
    icon: Clock3,
    className: 'border-blue-100 bg-blue-50 text-blue-700',
  },
  aprovado: {
    label: 'Aprovado',
    icon: CheckCircle2,
    className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  },
  recusado: {
    label: 'Recusado',
    icon: XCircle,
    className: 'border-red-100 bg-red-50 text-red-700',
  },
  arquivado: {
    label: 'Arquivado',
    icon: Archive,
    className: 'border-amber-100 bg-amber-50 text-amber-700',
  },
};

interface DocumentoStatusBadgeProps {
  status: DocumentoAlunoStatus;
}

const DocumentoStatusBadge: React.FC<DocumentoStatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${config.className}`}
    >
      <Icon aria-hidden="true" size={11} />
      {config.label}
    </span>
  );
};

export default DocumentoStatusBadge;
