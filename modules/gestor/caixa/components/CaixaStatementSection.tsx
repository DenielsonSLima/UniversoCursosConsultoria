import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CaixaComposicaoMensalPayload } from '../caixa-composicao.types';
import type { CaixaContasPagarResumo, CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency } from '../caixa.formatters';
import { CaixaCommitmentTracks } from './CaixaCommitmentTracks';
import { CaixaCompositionCards } from './CaixaCompositionCards';
import { CaixaDistributionDonuts } from './CaixaDistributionDonuts';
import { CaixaFlowHero } from './CaixaFlowHero';
import { CaixaMovementAndAccounts } from './CaixaMovementAndAccounts';

interface CaixaStatementSectionProps {
  statement?: CaixaMonthlyStatement;
  isLoading: boolean;
  hasError: boolean;
  isConsolidated: boolean;
  onRetry: () => void;
  contasPagar?: CaixaContasPagarResumo;
  isPayablesLoading?: boolean;
  hasPayablesError?: boolean;
  composicao?: CaixaComposicaoMensalPayload;
  isCompositionLoading?: boolean;
  hasCompositionError?: boolean;
  onRetryComposition?: () => void;
}

export const CaixaStatementSection: React.FC<CaixaStatementSectionProps> = ({
  statement,
  isLoading,
  hasError,
  isConsolidated,
  onRetry,
  contasPagar,
  isPayablesLoading = false,
  hasPayablesError = false,
  composicao,
  isCompositionLoading = false,
  hasCompositionError = false,
  onRetryComposition,
}) => {
  if (isLoading) {
    return (
      <section role="status" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent motion-reduce:animate-none" />
        <p className="mt-4 text-sm font-medium text-slate-500">
          Carregando prestação de contas do período e polo selecionados...
        </p>
      </section>
    );
  }

  if (hasError || !statement) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <AlertTriangle className="mx-auto text-rose-500" size={30} />
        <h2 className="mt-3 text-base font-bold">Prestação mensal indisponível</h2>
        <p className="mt-1 text-sm">
          Não foi possível carregar os valores deste período e polo. Os demais resumos são apresentados separadamente.
        </p>
        <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">
          Tentar novamente
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {statement.classificacao.quantidadeSemPolo > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle size={17} className="shrink-0 text-amber-600" />
          <p className="text-sm">
            <strong>{formatCaixaCurrency(statement.classificacao.valorSemPolo)}</strong> em{' '}
            {statement.classificacao.quantidadeSemPolo}{' '}
            {statement.classificacao.quantidadeSemPolo === 1 ? 'movimento aguarda' : 'movimentos aguardam'} identificação do polo.
          </p>
        </div>
      ) : null}

      <CaixaFlowHero statement={statement} isConsolidated={isConsolidated} />

      <CaixaCommitmentTracks
        statement={statement}
        contasPagar={contasPagar}
        isPayablesLoading={isPayablesLoading}
        hasPayablesError={hasPayablesError}
      />

      <section aria-labelledby="caixa-composition-section-title">
        <div className="mb-4 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
            Composição dos valores realizados
          </p>
          <h2 id="caixa-composition-section-title" className="mt-1 text-lg font-extrabold text-[#001a33]">
            Como recebimentos e despesas formaram os totais do mês
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Base, juros, multa, acréscimo, desconto e diferenças usam a mesma fonte canônica do PDF.
          </p>
        </div>
        <CaixaCompositionCards
          composicao={composicao}
          isLoading={isCompositionLoading}
          hasError={hasCompositionError}
          onRetry={onRetryComposition}
        />
      </section>

      <CaixaDistributionDonuts statement={statement} />

      <CaixaMovementAndAccounts
        serieMensal={statement.serieMensal}
        accounts={statement.contas}
        reconciliation={statement.conciliacao}
      />
    </div>
  );
};
