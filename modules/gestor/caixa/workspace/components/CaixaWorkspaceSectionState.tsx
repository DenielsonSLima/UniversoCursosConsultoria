import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import type {
  CaixaWorkspaceAvailableSection,
  CaixaWorkspaceIncompleteCode,
  CaixaWorkspaceLaterSection,
} from '../caixa-workspace.types.ts';

const reasonLabels: Record<CaixaWorkspaceIncompleteCode, string> = {
  OBRIGACOES_SEM_VENCIMENTO: 'Obrigações sem vencimento',
  OBRIGACOES_SEM_DATA_REGISTRO: 'Obrigações sem data de registro',
  PAGAMENTOS_SEM_DATA: 'Pagamentos sem data',
  PAGAMENTOS_SEM_VALOR: 'Pagamentos sem valor confirmado',
  PAGAMENTOS_PARCIAIS_SEM_ESTADO_CANONICO: 'Pagamentos parciais sem estado canônico',
  CANCELAMENTOS_E_EXCLUSOES_SEM_VIGENCIA_HISTORICA: 'Histórico de cancelamentos incompleto',
};

export const formatCaixaWorkspaceIncompleteReason = (
  reason: CaixaWorkspaceIncompleteCode,
) => reasonLabels[reason];

type WorkspacePresentationSection =
  | CaixaWorkspaceAvailableSection<unknown>
  | CaixaWorkspaceLaterSection;

interface CaixaWorkspaceSectionStateProps {
  label: string;
  section: WorkspacePresentationSection;
  description?: string;
  compact?: boolean;
}

export const CaixaWorkspaceSectionState = ({
  label,
  section,
  description,
  compact = false,
}: CaixaWorkspaceSectionStateProps) => {
  if (!section.disponivel) {
    return (
      <article
        data-workspace-state="unavailable"
        aria-label={`${label}: indisponível`}
        className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 text-slate-600"
      >
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm">
            <CircleDashed aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">{label}</h3>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Indisponível
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {description || section.observacao}
            </p>
            {!compact && (
              <p className="mt-3 text-sm font-extrabold text-slate-400" aria-label="Sem valor disponível">
                —
              </p>
            )}
          </div>
        </div>
      </article>
    );
  }

  if (!section.completo) {
    return (
      <aside
        data-workspace-state="incomplete"
        role="status"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" size={18} />
          <div>
            <h3 className="text-sm font-bold">{label} em conferência</h3>
            <p className="mt-1 text-xs leading-5 text-amber-800">{description || section.observacao}</p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div
      data-workspace-state="available"
      aria-label={`${label}: disponível e completo`}
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700"
    >
      <CheckCircle2 aria-hidden="true" size={12} />
      Disponível
    </div>
  );
};
