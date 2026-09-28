import React from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, CircleDollarSign,
  Info, Landmark, WalletCards,
} from 'lucide-react';
import type { CaixaMonthlyStatement } from '../caixa.types';
import { formatCaixaCurrency } from '../caixa.formatters';
import { CaixaBreakdownList, CaixaMetricCard } from './CaixaDashboardCards';
import { CaixaCompromissosCards } from './CaixaCompromissosCards';
import { CaixaMovimentacaoChart } from './CaixaMovimentacaoChart';
import { CaixaReconciliationCard } from './CaixaReconciliationCard';

interface CaixaStatementSectionProps {
  statement?: CaixaMonthlyStatement;
  isLoading: boolean;
  hasError: boolean;
  isConsolidated: boolean;
  onRetry: () => void;
}

export const CaixaStatementSection: React.FC<CaixaStatementSectionProps> = ({
  statement, isLoading, hasError, isConsolidated, onRetry,
}) => {
  if (isLoading) {
    return (
      <section role="status" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white py-12 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-slate-500">Carregando prestação de contas do período e polo selecionados...</p>
      </section>
    );
  }
  if (hasError || !statement) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <AlertTriangle className="mx-auto text-rose-500" size={30} />
        <h2 className="mt-3 text-base font-bold">Prestação mensal indisponível</h2>
        <p className="mt-1 text-sm">Não foi possível carregar os valores deste período e polo. Os demais resumos são apresentados separadamente.</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold">
          Tentar novamente
        </button>
      </section>
    );
  }
  const resultTone = statement.resumoCompetencia.resultadoStatus === 'NEGATIVO'
    ? 'rose'
    : statement.resumoCompetencia.resultadoStatus === 'POSITIVO' ? 'green' : 'blue';

  return (
    <>
      {statement.classificacao.quantidadeSemPolo > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle size={17} className="shrink-0 text-amber-600" />
          <p className="text-sm">
            <strong>{formatCaixaCurrency(statement.classificacao.valorSemPolo)}</strong> em{' '}
            {statement.classificacao.quantidadeSemPolo}{' '}
            {statement.classificacao.quantidadeSemPolo === 1 ? 'movimento aguarda' : 'movimentos aguardam'} identificação do polo.
          </p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CaixaMetricCard
          label={isConsolidated ? 'Saldo contábil consolidado' : 'Posição atribuída ao polo'}
          value={statement.saldosHoje.registradoTotal}
          tone="navy"
          icon={<CircleDollarSign size={15} className="text-blue-400" />}
          helper={(
            <span>
              {isConsolidated ? 'Banco registrado' : 'Posição nas contas'}{' '}
              {formatCaixaCurrency(statement.saldosHoje.bancarioRegistrado)}
              {' · '}
              Caixa local {formatCaixaCurrency(statement.saldosHoje.caixaLocal)}
            </span>
          )}
        />
        <CaixaMetricCard
          label="Entradas operacionais no mês"
          value={statement.resumoCompetencia.entradasRecebidasBrutas}
          tone="green"
          icon={<ArrowUpRight size={15} className="text-emerald-500" />}
          helper={`${statement.resumoCompetencia.quantidadeRecebimentos} receita(s) operacional(is) confirmada(s)`}
        />
        <CaixaMetricCard
          label="Saídas operacionais no mês"
          value={statement.resumoCompetencia.saidasPagas}
          tone="rose"
          icon={<ArrowDownRight size={15} className="text-rose-500" />}
          helper={(
            <span>
              {statement.resumoCompetencia.quantidadePagamentos} pagamento(s)
              {statement.resumoCompetencia.tarifasBancariasConfirmadas > 0 && (
                <> · Tarifas {formatCaixaCurrency(statement.resumoCompetencia.tarifasBancariasConfirmadas)}</>
              )}
            </span>
          )}
        />
        <CaixaMetricCard
          label={
            statement.resumoCompetencia.resultadoStatus === 'NEGATIVO'
              ? 'Déficit operacional'
              : statement.resumoCompetencia.resultadoStatus === 'POSITIVO'
                ? 'Superávit operacional'
                : 'Resultado operacional'
          }
          value={statement.resumoCompetencia.resultado}
          tone={resultTone}
          icon={<Banknote size={15} />}
          helper="Entradas operacionais menos saídas operacionais do período"
        />
      </section>

      <CaixaCompromissosCards compromissos={statement.compromissos} />

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <CaixaMovimentacaoChart serieMensal={statement.serieMensal} />

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Onde está o saldo</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Contas bancárias e caixas da unidade
              </p>
            </div>
            <Info size={16} className="mt-0.5 text-slate-400" />
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {statement.contas.length > 0 ? statement.contas.map((account) => (
              <div key={account.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                    {account.natureza === 'CAIXA_INTERNO'
                      ? <WalletCards size={17} />
                      : <Landmark size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {account.banco} · Ag. {account.agencia} · Conta {account.conta}
                        </p>
                        {!account.ativo && (
                          <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                            Inativa — somente histórico
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {account.titular} · {account.cidadeUf}
                        </p>
                      </div>
                      <p className={`shrink-0 text-sm font-extrabold ${
                        account.valorExibido < 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}>
                        {formatCaixaCurrency(account.valorExibido)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                      <span className="font-semibold text-blue-600">
                        {account.tipoValorExibido === 'POSICAO_POLO'
                          ? 'Posição deste polo'
                          : account.compartilhada
                            ? `Compartilhada com ${account.unidadesUso} unidades`
                            : 'Saldo registrado'}
                      </span>
                      {account.tipoValorExibido === 'POSICAO_POLO' && (
                        <span className="text-slate-400">
                          Total da conta {formatCaixaCurrency(account.saldoTotalRegistrado)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <p className="py-8 text-center text-sm text-slate-400">Nenhuma conta disponível.</p>
            )}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Saldo contábil atualizado por cobranças e baixas conciliadas.
              A integração Banese não consulta o extrato bancário.
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <ArrowUpRight size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Receitas recebidas no mês</h2>
              <p className="mt-0.5 text-xs text-slate-500">Por modalidade de curso</p>
            </div>
          </div>
          <CaixaBreakdownList
            items={statement.receitasPorModalidade}
            emptyLabel="Nenhuma receita recebida."
            tone="green"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
              <ArrowDownRight size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Despesas pagas no mês</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Tarifas bancárias aparecem somente quando confirmadas
              </p>
            </div>
          </div>
          <CaixaBreakdownList
            items={statement.despesasPorCategoria}
            emptyLabel="Nenhuma despesa paga."
            tone="rose"
          />
        </div>
      </section>

      <CaixaReconciliationCard reconciliation={statement.conciliacao} />

    </>
  );
};
