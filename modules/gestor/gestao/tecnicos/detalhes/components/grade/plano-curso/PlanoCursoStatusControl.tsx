import React from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Eye,
  FilePenLine,
  FileQuestion,
  Loader2,
} from 'lucide-react';

import type { PlanoCursoGestaoStatus } from '../../../../../../../shared/plano-curso/plano-curso.types';

interface PlanoCursoStatusControlProps {
  plano: PlanoCursoGestaoStatus | null;
  isLoading?: boolean;
  isError?: boolean;
  onOpen: () => void;
}

const STATUS_VIEW = {
  AUSENTE: {
    label: 'Plano ausente',
    icon: FileQuestion,
    className: 'border-dashed border-slate-300 bg-slate-50 text-slate-500',
  },
  RASCUNHO: {
    label: 'Plano em rascunho · aguardando conclusão',
    icon: FilePenLine,
    className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  },
  CONCLUIDO: {
    label: 'Plano concluído',
    icon: BadgeCheck,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
} as const;

const PlanoCursoStatusControl: React.FC<PlanoCursoStatusControlProps> = ({
  plano,
  isLoading = false,
  isError = false,
  onOpen,
}) => {
  const status = plano?.status || 'AUSENTE';
  const view = STATUS_VIEW[status];
  const Icon = view.icon;
  // Somente o plano concluído possui documento oficial. Rascunho é estado
  // informativo e nunca aciona preparação, download ou impressão.
  const canOpen = Boolean(
    plano?.planoId
    && status === 'CONCLUIDO'
    && plano.templateRevision !== null
    && plano.documentoFingerprint,
  );
  const label = isError ? 'Plano indisponível' : view.label;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isLoading || isError || !canOpen}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[9px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-65 ${view.className}`}
    >
      {isLoading ? <Loader2 size={14} className="animate-spin" /> : isError ? <AlertTriangle size={14} /> : <Icon size={14} />}
      <span className="hidden 2xl:inline">{isError ? 'Indisponível' : status === 'RASCUNHO' ? 'Rascunho' : status === 'CONCLUIDO' ? 'Concluído' : 'Sem plano'}</span>
      {canOpen && !isError ? <Eye size={13} className="opacity-70" /> : null}
    </button>
  );
};

export default PlanoCursoStatusControl;
