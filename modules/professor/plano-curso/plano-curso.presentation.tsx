import React from 'react';
import { BadgeCheck, FilePenLine, FileQuestion } from 'lucide-react';
import type { PlanoCursoStatus } from '../../shared/plano-curso/plano-curso.types';

export const PLANO_STATUS_VIEW = {
  AUSENTE: { label: 'Não iniciado', icon: FileQuestion, className: 'bg-slate-100 text-slate-600' },
  RASCUNHO: { label: 'Rascunho', icon: FilePenLine, className: 'bg-amber-50 text-amber-800' },
  CONCLUIDO: { label: 'Concluído', icon: BadgeCheck, className: 'bg-emerald-50 text-emerald-800' },
};
export const PlanoStatusBadge: React.FC<{ status: PlanoCursoStatus }> = ({ status }) => {
  const view = PLANO_STATUS_VIEW[status];
  const Icon = view.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${view.className}`}
    >
      <Icon size={14} />
      {view.label}
    </span>
  );
};
export const planoAssignmentId = (value: { turmaId: string; disciplinaId: string }) =>
  `${value.turmaId}:${value.disciplinaId}`;

export const linesToPlanoItems = (value: string) =>
  value.split('\n').map((item) => item.trim()).filter(Boolean);
