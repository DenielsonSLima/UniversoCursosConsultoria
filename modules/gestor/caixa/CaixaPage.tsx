import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Landmark,
  ReceiptText,
  Scale,
} from 'lucide-react';
import {
  caixaDashboardQueryOptions,
  caixaFinanciamentoResumoQueryOptions,
  caixaPatrimonioResumoQueryOptions,
  caixaPosicaoLiquidaResumoQueryOptions,
  caixaPosicaoTotalResumoQueryOptions,
  caixaContasPagarResumoQueryOptions,
  caixaPolosQueryOptions,
  getCurrentCaixaCompetencia,
  shiftCaixaCompetencia,
} from './caixa.service';
import { useCaixaRealtime } from './useCaixaRealtime';
import type { CaixaPolo } from './caixa-polos';
import {
  formatCaixaCompetencia,
} from './caixa.formatters';
import { CaixaStatementSection } from './components/CaixaStatementSection';
import { CaixaReportLauncher } from './report/CaixaReportLauncher';
import { CaixaLinhaCorteCard } from './components/CaixaLinhaCorteCard';
import { caixaLinhaCorteQueryOptions } from './caixa-linha-corte.service';
import { caixaConveniosResumoQueryOptions } from './caixa-convenios.service';
import { CaixaContasPagarResumoCard } from './components/CaixaContasPagarResumoCard';
import { CaixaAdvancedAnalysis } from './components/CaixaAdvancedAnalysis';
import { CaixaLinkedCapitalOverview } from './components/CaixaLinkedCapitalOverview';
import { CaixaStructuralOverview } from './components/CaixaStructuralOverview';
import { caixaComposicaoQueryOptions } from './caixa-composicao.queries';
import { CaixaReviewPendingModal } from './review-pending/CaixaReviewPendingModal';
import { normalizeReviewPolo } from './review-pending/caixa-review-pending.service';
import { caixaReceivablesPositionQueryOptions } from './review-pending/caixa-receivables-position.service';
import type { CaixaReviewContext } from './review-pending/caixa-review-pending.contract';

interface CaixaPageProps {
  poloId?: string | null;
  poloName?: string;
  isGlobal?: boolean;
  isMatriz?: boolean;
}

const formatPoloName = (polo?: CaixaPolo) => {
  if (!polo) return 'Polo atual';
  if (!polo.cidade) return polo.nome;
  return `${polo.cidade}/${(polo.estado || 'SE').toUpperCase()}`;
};

interface CaixaScopePageProps extends CaixaPageProps {
  competencia: string;
  setCompetencia: React.Dispatch<React.SetStateAction<string>>;
}

const CaixaScopePage: React.FC<CaixaScopePageProps> = ({
  poloId,
  poloName,
  isGlobal = false,
  isMatriz = false,
  competencia,
  setCompetencia,
}) => {
  const currentCompetencia = getCurrentCaixaCompetencia();
  const canViewConsolidated = isGlobal && isMatriz;
  const [selectedPolo, setSelectedPolo] = useState(
    poloId || (canViewConsolidated ? 'todos' : ''),
  );
  const [review, setReview] = useState<{ scope: string; context: CaixaReviewContext } | null>(null);
  const reviewScope = `${selectedPolo}:${competencia}`;
  useEffect(() => { setReview(null); }, [reviewScope]);
  const positionQuery = useQuery({
    ...caixaReceivablesPositionQueryOptions(normalizeReviewPolo(selectedPolo), competencia),
    enabled: Boolean(selectedPolo),
  });

  const { data: polos = [] } = useQuery({
    ...caixaPolosQueryOptions(),
    enabled: canViewConsolidated,
  });

  const visiblePolos = useMemo<CaixaPolo[]>(() => {
    if (canViewConsolidated) return polos as CaixaPolo[];
    if (!poloId) return [];
    return [{
      id: poloId,
      nome: poloName || 'Polo atual',
      cidade: null,
      estado: null,
      is_matriz: false,
      created_at: null,
    }];
  }, [canViewConsolidated, poloId, poloName, polos]);

  useCaixaRealtime();

  const { data: statement, isLoading, error, refetch: refetchStatement } = useQuery({
    ...caixaDashboardQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });
  const positionCutMismatch = Boolean(positionQuery.data && statement
    && positionQuery.data.dataCorte !== statement.compromissos.inadimplenciaMensal.dataCorte);

  const {
    data: financiamentoResumo,
    isLoading: isFinanciamentoLoading,
    isError: hasFinanciamentoError,
  } = useQuery({
    ...caixaFinanciamentoResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: linhaCorteResumo,
    isLoading: isLinhaCorteLoading,
    isError: hasLinhaCorteError,
  } = useQuery({
    ...caixaLinhaCorteQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: patrimonioResumo,
    isLoading: isPatrimonioLoading,
    isError: hasPatrimonioError,
  } = useQuery({
    ...caixaPatrimonioResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: posicaoLiquidaResumo,
    isLoading: isPosicaoLiquidaLoading,
    isError: hasPosicaoLiquidaError,
  } = useQuery({
    ...caixaPosicaoLiquidaResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: posicaoTotalResumo,
    isLoading: isPosicaoTotalLoading,
    isError: hasPosicaoTotalError,
  } = useQuery({
    ...caixaPosicaoTotalResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: conveniosResumo,
    isLoading: isConveniosLoading,
    isError: hasConveniosError,
  } = useQuery({
    ...caixaConveniosResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: contasPagarResumo,
    isLoading: isContasPagarLoading,
    isError: hasContasPagarError,
  } = useQuery({
    ...caixaContasPagarResumoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const {
    data: composicaoResumo,
    isLoading: isComposicaoLoading,
    isError: hasComposicaoError,
    refetch: refetchComposicao,
  } = useQuery({
    ...caixaComposicaoQueryOptions(selectedPolo, competencia),
    enabled: Boolean(selectedPolo),
  });

  const isCurrentCompetencia = competencia === currentCompetencia;
  const isConsolidated = selectedPolo === 'todos';

  return (
    <div className="caixa-page mx-auto max-w-[1680px] space-y-5 pb-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[25px] font-medium tracking-[-0.04em] text-[#122b42]">Caixa</h1>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-[#607286]">
              Prestação mensal
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#607286]">
            Saúde financeira e posição contábil de {formatCaixaCompetencia(competencia)}.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-fit">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, -1))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 max-sm:h-11 max-sm:w-11"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3 text-xs font-medium text-slate-700 sm:min-w-[154px]">
              <CalendarDays size={15} className="text-blue-600" />
              {formatCaixaCompetencia(competencia)}
            </div>
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, 1))}
              disabled={isCurrentCompetencia}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 max-sm:h-11 max-sm:w-11 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Próximo mês"
            >
              <ChevronRight size={17} />
            </button>
          </div>
          {statement && !error && (
            <CaixaReportLauncher
              poloId={selectedPolo}
              competencia={competencia}
              scopeLabel={statement.meta.escopoRotulo}
            />
          )}
        </div>
      </header>

      <div className="caixa-polo-tabs overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1">
          {canViewConsolidated && (
            <button
              type="button"
              onClick={() => setSelectedPolo('todos')}
              className={`relative flex min-h-11 items-center gap-2 px-3 py-2 text-[13px] font-medium leading-5 tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                isConsolidated ? 'text-blue-700' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Scale size={15} />
              Resultado geral
              {isConsolidated && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-blue-600" />}
            </button>
          )}
          {visiblePolos.map((polo) => {
            const active = selectedPolo === polo.id;
            return (
              <button
                key={polo.id}
                type="button"
                onClick={() => setSelectedPolo(polo.id)}
                disabled={!canViewConsolidated}
                className={`relative flex min-h-11 items-center gap-2 px-3 py-2 text-[13px] font-medium leading-5 tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                  active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Landmark size={15} />
                {formatPoloName(polo)}
                {polo.is_matriz && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-blue-700">
                    Matriz
                  </span>
                )}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-blue-600" />}
              </button>
            );
          })}
        </div>
      </div>

      <CaixaStatementSection
        statement={statement}
        isLoading={isLoading}
        hasError={Boolean(error)}
        isConsolidated={isConsolidated}
        onRetry={() => { void refetchStatement(); }}
        contasPagar={contasPagarResumo}
        isPayablesLoading={isContasPagarLoading}
        hasPayablesError={hasContasPagarError}
        composicao={composicaoResumo}
        isCompositionLoading={isComposicaoLoading}
        hasCompositionError={hasComposicaoError}
        onRetryComposition={() => { void refetchComposicao(); }}
        receivablesPosition={positionQuery.data}
        isReceivablesLoading={positionQuery.isPending}
        hasReceivablesError={positionQuery.isError || positionCutMismatch}
        onRetryReceivables={() => { void positionQuery.refetch(); void refetchStatement(); }}
        onReviewPending={(context) => setReview({ scope: reviewScope, context })}
      />

      {review?.scope === reviewScope ? <CaixaReviewPendingModal
        key={`${reviewScope}:${review.context}`} poloId={normalizeReviewPolo(selectedPolo)}
        poloLabel={selectedPolo === 'todos' ? 'Todos os polos' : formatPoloName(visiblePolos.find((polo) => polo.id === selectedPolo))}
        competencia={competencia} context={review.context} onClose={() => setReview(null)} /> : null}

      {(Boolean(error) || (!isLoading && !statement)) ? (
        <CaixaContasPagarResumoCard
          resumo={contasPagarResumo}
          isLoading={isContasPagarLoading}
          hasError={hasContasPagarError}
        />
      ) : null}

      <CaixaAdvancedAnalysis
        position={(
          <CaixaStructuralOverview
            posicaoTotal={posicaoTotalResumo}
            posicaoLiquida={posicaoLiquidaResumo}
            patrimonio={patrimonioResumo}
            isPosicaoTotalLoading={isPosicaoTotalLoading}
            hasPosicaoTotalError={hasPosicaoTotalError}
            isPosicaoLiquidaLoading={isPosicaoLiquidaLoading}
            hasPosicaoLiquidaError={hasPosicaoLiquidaError}
            isPatrimonioLoading={isPatrimonioLoading}
            hasPatrimonioError={hasPatrimonioError}
          />
        )}
        capital={(
          <CaixaLinkedCapitalOverview
            convenios={conveniosResumo}
            financiamento={financiamentoResumo}
            isConveniosLoading={isConveniosLoading}
            hasConveniosError={hasConveniosError}
            isFinanciamentoLoading={isFinanciamentoLoading}
            hasFinanciamentoError={hasFinanciamentoError}
          />
        )}
        lineCut={(
          <CaixaLinhaCorteCard
            resumo={linhaCorteResumo}
            isLoading={isLinhaCorteLoading}
            hasError={hasLinhaCorteError}
          />
        )}
        lineCutAttention={linhaCorteResumo?.cobertura.statusOperacional === 'ABAIXO_DA_LINHA'
          || linhaCorteResumo?.inadimplencia.impacto === 'CRITICO'}
      />

      <footer className="flex items-start gap-2 px-1 text-[11px] leading-5 text-[#607286]">
        <ReceiptText size={13} className="mt-0.5 shrink-0" />
        <span>
          Esta tela apresenta posição contábil do sistema. Valores bancários reais devem ser conferidos
          com o extrato quando a integração de saldo estiver disponível.
        </span>
      </footer>
    </div>
  );
};

const CaixaPage: React.FC<CaixaPageProps> = (props) => {
  const [competencia, setCompetencia] = useState(getCurrentCaixaCompetencia);
  // A competência permanece ao trocar de polo. O escopo local e seus observers
  // são recriados juntos, sem um render com os dados da unidade anterior.
  const scopeKey = `${props.poloId || ''}:${Boolean(props.isGlobal)}:${Boolean(props.isMatriz)}`;
  return (
    <CaixaScopePage
      key={scopeKey}
      {...props}
      competencia={competencia}
      setCompetencia={setCompetencia}
    />
  );
};

export default CaixaPage;
