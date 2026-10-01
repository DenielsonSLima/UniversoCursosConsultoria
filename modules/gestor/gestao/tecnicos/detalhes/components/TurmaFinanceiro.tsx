// File: modules/gestor/gestao/tecnicos/detalhes/components/TurmaFinanceiro.tsx

import React, { useState } from 'react';
import { DollarSign, Eye, EyeOff, Loader2, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import FinanceiroConfig from './financeiro/FinanceiroConfig';
import FinanceiroAlunosList from './financeiro/FinanceiroAlunosList';
import { Turma } from '../../../gestao.types';
import TechnicalDataError from './TechnicalDataError';
import { useMatriculaTecnicaFinanceiroWorkspace } from './financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { useMatriculaTecnicaFinanceiroRealtime } from './financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime';
import { getFinancialWorkspaceErrorPresentation } from './financeiro/financial-workspace-error';

interface TurmaFinanceiroProps {
  turma: Turma;
  canSettleEnrollment?: boolean;
  initialMatriculaId?: string;
}

const formatCurrency = (value?: string) => {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(parsed) ? parsed : 0);
};

const HIDDEN_CURRENCY = 'R$ •••••';

const TurmaFinanceiro: React.FC<TurmaFinanceiroProps> = ({ turma, canSettleEnrollment = false, initialMatriculaId }) => {
  const workspaceQuery = useMatriculaTecnicaFinanceiroWorkspace(turma.id);
  useMatriculaTecnicaFinanceiroRealtime(turma.id);
  const [valuesVisible, setValuesVisible] = useState(false);
  const [rulesEditing, setRulesEditing] = useState(false);
  const workspace = workspaceQuery.data;
  const summary = workspace?.resumo;
  const loadError = getFinancialWorkspaceErrorPresentation(workspaceQuery.error);
  const toggleLabel = rulesEditing
    ? 'Valores visíveis durante a edição das regras'
    : valuesVisible
      ? 'Ocultar valores financeiros'
      : 'Exibir valores financeiros';

  const renderCurrency = (value?: string) => (valuesVisible ? formatCurrency(value) : (
    <>
      <span aria-hidden="true">{HIDDEN_CURRENCY}</span>
      <span className="sr-only">Valor oculto</span>
    </>
  ));

  const receivedPercentage = Math.min(100, Math.max(0, Number(summary?.recebidoPercentual) || 0));

  return (
    <div className="space-y-5">
      {workspaceQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-8 shadow-sm">
          <Loader2 className="animate-spin text-blue-600" size={22} />
          <span className="ml-3 text-sm font-bold text-slate-500">Carregando resumo financeiro...</span>
        </div>
      ) : null}
      {!workspaceQuery.isLoading && (workspaceQuery.isError || !workspace) ? (
        <TechnicalDataError
          title={loadError.title}
          message={loadError.message}
          retrying={workspaceQuery.isFetching}
          onRetry={() => { void workspaceQuery.refetch(); }}
        />
      ) : null}
      {workspace ? (
        <section
          aria-labelledby="financial-overview-title"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 bg-[#001a33] px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-blue-200 ring-1 ring-white/10">
                <WalletCards size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="financial-overview-title" className="text-sm font-black tracking-tight">Visão financeira da turma</h2>
                <p className="mt-0.5 truncate text-[11px] font-medium text-slate-300">Plano, recebimentos e inadimplência em um só lugar.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setValuesVisible((current) => !current)}
              aria-label={toggleLabel}
              aria-pressed={valuesVisible}
              title={toggleLabel}
              disabled={rulesEditing}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-3 text-[11px] font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-70 sm:self-auto"
            >
              {valuesVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              <span>{rulesEditing ? 'Valores na edição' : valuesVisible ? 'Ocultar valores' : 'Exibir valores'}</span>
            </button>
          </div>

          {!workspaceQuery.isError ? <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <article className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Plano lançado</span>
                <span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <TrendingUp size={15} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-1 text-xl font-black tabular-nums text-[#001a33]">{renderCurrency(summary.total)}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">Total previsto no plano vigente</p>
            </article>

            <article className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">Recebido</span>
                <span className="grid size-7 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <DollarSign size={15} aria-hidden="true" />
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="text-xl font-black tabular-nums text-[#001a33]">{renderCurrency(summary.recebido)}</p>
                <span className="text-[10px] font-black tabular-nums text-blue-600">{summary.recebidoPercentual}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
                  style={{ width: `${receivedPercentage}%` }}
                />
              </div>
            </article>

            <article className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-rose-700">Inadimplência</span>
                <span className="grid size-7 place-items-center rounded-lg bg-rose-50 text-rose-600">
                  <TrendingDown size={15} aria-hidden="true" />
                </span>
              </div>
              <p className="mt-1 text-xl font-black tabular-nums text-[#001a33]">{renderCurrency(summary.inadimplencia)}</p>
              <p className="mt-1 text-[10px] font-bold tabular-nums text-rose-600">{summary.inadimplenciaPercentual}% do plano lançado</p>
            </article>
          </div> : null}
        </section>
      ) : null}

      {workspace ? (
        <FinanceiroConfig
          turma={turma}
          regra={workspace.regra}
          policy={workspace.turma.cicloFinanceiroTecnico}
          valuesVisible={valuesVisible}
          onRevealValues={() => setValuesVisible(true)}
          onEditingChange={setRulesEditing}
        />
      ) : null}

      {workspace ? (
        <FinanceiroAlunosList
          key={initialMatriculaId || turma.id}
          turma={turma}
          initialMatriculaId={initialMatriculaId}
          canSettleEnrollment={canSettleEnrollment}
          regra={workspace.regra}
          alunos={workspace.matriculas}
          resumo={workspace.resumo}
          isLoading={false}
          isError={false}
          isFetching={workspaceQuery.isFetching}
          valuesVisible={valuesVisible}
          onRetry={() => { void workspaceQuery.refetch(); }}
        />
      ) : null}
    </div>
  );
};

export default TurmaFinanceiro;
