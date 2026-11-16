import { useMemo } from 'react';
import {
  FinancialReportColumn,
  FinancialReportFilter,
  FinancialReportRow,
  FinancialReportStatusBadge,
  FinancialReportSummaryCard,
} from '../../components/FinancialReportPreview';
import type { DespesaLancamento, DespesasSummary } from '../despesas.service';
import type { DespesaOrdem, DespesaSituacao, DespesaStatusScope } from '../despesas.queryKeys';
import { getDespesaEstimativaLabel, isDespesaEstimadaPendente } from '../components/despesaPresentation';
import { despesaOrdemLabels, despesaScopeLabels, despesaSituacaoLabels, getDespesaPeriodoLabel } from '../components/despesa-periodo-apresentacao';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value || 0);

const formatDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem limite'
);

interface UseDespesasReportParams {
  filtered: DespesaLancamento[];
  totals: DespesasSummary;
  statusScope: DespesaStatusScope;
  situacao: DespesaSituacao;
  ordem: DespesaOrdem;
  search: string;
  dataInicio: string;
  dataFim: string;
  categoriaLabel: string;
  turmaLabel: string;
  poloLabel: string;
}

export const useDespesasReport = ({
  filtered,
  totals,
  statusScope,
  situacao,
  ordem,
  search,
  dataInicio,
  dataFim,
  categoriaLabel,
  turmaLabel,
  poloLabel,
}: UseDespesasReportParams) => {
  const columns = useMemo<FinancialReportColumn[]>(() => [
    { label: 'Vencimento' },
    { label: 'Descrição' },
    { label: 'Categoria' },
    { label: 'Fornecedor' },
    { label: 'Valor', align: 'right' },
    { label: 'Parcela', align: 'center' },
    { label: 'Status', align: 'center' },
  ], []);

  const rows = useMemo<FinancialReportRow[]>(() => filtered.map((item) => ({
    id: item.id,
    cells: [
      <span className="font-bold text-slate-700">{formatDate(item.dataVencimento)}</span>,
      <div>
        <p className="font-black text-[#001a33]">{item.descricao}</p>
        {item.valorEstimado && <p className="text-amber-800">{getDespesaEstimativaLabel(item)}</p>}
        {item.turmaNome && <p className="mt-0.5 font-bold text-indigo-600">Turma: {item.turmaNome}</p>}
        {item.observacao && <p className="mt-0.5 text-slate-500">{item.observacao}</p>}
        {item.dataPagamento && <p className="mt-0.5 font-bold text-emerald-700">Pago em {formatDate(item.dataPagamento)}</p>}
      </div>,
      item.categoriaNome || 'Sem categoria',
      item.fornecedorNome || 'Não informado',
      <div>
        <p className="font-black text-[#001a33]">{formatCurrency(item.valorSemCobrancaEm ? 0 : item.valor)}</p>
        {item.valorPago !== undefined && item.valorPago !== item.valor && (
          <p className="text-[9px] font-bold text-emerald-700">Pago: {formatCurrency(item.valorPago)}</p>
        )}
      </div>,
      item.totalParcelas > 1 ? `${item.parcelaNumero}/${item.totalParcelas}` : 'Única',
      <FinancialReportStatusBadge status={isDespesaEstimadaPendente(item) ? 'PENDENTE' : item.status}
        label={item.valorSemCobrancaEm ? 'Sem cobrança neste mês' : isDespesaEstimadaPendente(item) ? 'Fatura a confirmar' : undefined} />,
    ],
  })), [filtered]);

  const filters = useMemo<FinancialReportFilter[]>(() => [
    { label: 'Escopo', value: despesaScopeLabels[statusScope] },
    { label: 'Situação', value: despesaSituacaoLabels[situacao] },
    { label: 'Vencimento', value: despesaOrdemLabels[ordem] },
    { label: 'Busca', value: search.trim() || 'Todos os lançamentos' },
    { label: 'Período', value: getDespesaPeriodoLabel(statusScope, dataInicio, dataFim) },
    { label: 'Categoria', value: categoriaLabel },
    { label: 'Turma', value: turmaLabel },
    { label: 'Polo', value: poloLabel },
  ], [categoriaLabel, dataFim, dataInicio, ordem, poloLabel, search, situacao, statusScope, turmaLabel]);

  const summaryCards = useMemo<FinancialReportSummaryCard[]>(() => [
    { label: 'Total previsto', value: formatCurrency(totals.totalValue), tone: 'slate' },
    { label: 'Pago', value: formatCurrency(totals.paidValue), tone: 'emerald' },
    { label: 'A pagar confirmado', value: formatCurrency(totals.confirmedPendingValue ?? totals.pendingValue), tone: 'amber' },
    ...(totals.estimatedCount ? [{ label: 'Estimado a confirmar', value: formatCurrency(totals.estimatedValue ?? 0), tone: 'amber' as const }] : []),
    { label: 'Vencidos', value: totals.vencidosCount, tone: 'rose' },
  ], [totals]);

  return { columns, rows, filters, summaryCards };
};
