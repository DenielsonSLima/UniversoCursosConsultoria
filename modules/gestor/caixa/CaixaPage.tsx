import React, { useMemo, useState } from 'react';
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
import { CaixaFinanciamentoResumoCard } from './components/CaixaFinanciamentoResumoCard';
import { CaixaLinhaCorteCard } from './components/CaixaLinhaCorteCard';
import { caixaLinhaCorteQueryOptions } from './caixa-linha-corte.service';
import { CaixaPatrimonioResumoCard } from './components/CaixaPatrimonioResumoCard';
import { CaixaPosicaoLiquidaResumoCard } from './components/CaixaPosicaoLiquidaResumoCard';
import { CaixaPosicaoTotalResumoCard } from './components/CaixaPosicaoTotalResumoCard';

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

  const isCurrentCompetencia = competencia === currentCompetencia;
  const isConsolidated = selectedPolo === 'todos';

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn space-y-5 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#001a33]">Caixa</h1>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
              Prestação mensal
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Saúde financeira e posição contábil de {formatCaixaCompetencia(competencia)}.
          </p>
        </div>

        <div className="flex w-fit items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, -1))}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="flex min-w-[154px] items-center justify-center gap-2 px-3 text-sm font-semibold text-slate-800">
              <CalendarDays size={15} className="text-blue-600" />
              {formatCaixaCompetencia(competencia)}
            </div>
            <button
              type="button"
              onClick={() => setCompetencia((value) => shiftCaixaCompetencia(value, 1))}
              disabled={isCurrentCompetencia}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
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

      <div className="overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max gap-1">
          {canViewConsolidated && (
            <button
              type="button"
              onClick={() => setSelectedPolo('todos')}
              className={`relative flex items-center gap-2 px-3 pb-3 pt-2 text-sm font-semibold transition ${
                isConsolidated ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
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
                className={`relative flex items-center gap-2 px-3 pb-3 pt-2 text-sm font-semibold transition ${
                  active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Landmark size={15} />
                {formatPoloName(polo)}
                {polo.is_matriz && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
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
      />

      <CaixaPosicaoTotalResumoCard
        resumo={posicaoTotalResumo}
        isLoading={isPosicaoTotalLoading}
        hasError={hasPosicaoTotalError}
      />

      <CaixaPosicaoLiquidaResumoCard
        resumo={posicaoLiquidaResumo}
        isLoading={isPosicaoLiquidaLoading}
        hasError={hasPosicaoLiquidaError}
      />

      <CaixaPatrimonioResumoCard
        resumo={patrimonioResumo}
        isLoading={isPatrimonioLoading}
        hasError={hasPatrimonioError}
      />

      <CaixaFinanciamentoResumoCard
        resumo={financiamentoResumo}
        isLoading={isFinanciamentoLoading}
        hasError={hasFinanciamentoError}
      />

      <CaixaLinhaCorteCard
        resumo={linhaCorteResumo}
        isLoading={isLinhaCorteLoading}
        hasError={hasLinhaCorteError}
      />

      <footer className="flex items-start gap-2 px-1 text-[10px] leading-4 text-slate-400">
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
