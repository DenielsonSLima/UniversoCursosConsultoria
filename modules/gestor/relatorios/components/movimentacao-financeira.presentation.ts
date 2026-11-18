import type { FinancialReportFilter, FinancialReportSummaryCard, FinancialReportTone } from '../../financeiro/components/FinancialReportPreview';
import type { RelatorioMovimentacaoFinanceiraData, RelatorioMovimentacaoFinanceiraItem, RelatorioMovimentacaoFinanceiraStatus, RelatorioMovimentacaoFinanceiraTipo } from '../relatorios.service';
import { formatCurrency, formatDate } from './RelatorioShared';

type RelatorioMovimentacaoFinanceiraDetalheTipo = Exclude<
  RelatorioMovimentacaoFinanceiraTipo,
  'CATEGORIAS'
>;

export interface RelatorioMovimentacaoFinanceiraProps {
  isGlobal?: boolean;
  company: any;
  polo: any;
  tipo: RelatorioMovimentacaoFinanceiraDetalheTipo;
}

export interface ReportConfiguration {
  title: string;
  shortTitle: string;
  description: string;
  dateLabel: string;
  tone: FinancialReportTone;
  requiresAccount: boolean;
  allowsAccountFilter: boolean;
  showsStatus: boolean;
  flow: boolean;
  fileName: string;
}

export const REPORT_CONFIG: Record<RelatorioMovimentacaoFinanceiraDetalheTipo, ReportConfiguration> = {
  EXTRATO_CONTA: {
    title: 'Extrato Financeiro por Conta',
    shortTitle: 'Extrato por Conta',
    description: 'Movimentos efetivos da conta selecionada, com saldo de abertura, entradas, saídas e saldo de fechamento no período.',
    dateLabel: 'Data do movimento',
    tone: 'blue',
    requiresAccount: true,
    allowsAccountFilter: true,
    showsStatus: false,
    flow: true,
    fileName: 'extrato-financeiro-por-conta',
  },
  ENTRADAS: {
    title: 'Relatório de Entradas',
    shortTitle: 'Entradas de Caixa',
    description: 'Recebimentos, créditos de financiamento e transferências físicas que ingressaram no caixa.',
    dateLabel: 'Data da entrada',
    tone: 'emerald',
    requiresAccount: false,
    allowsAccountFilter: true,
    showsStatus: false,
    flow: true,
    fileName: 'relatorio-entradas',
  },
  SAIDAS: {
    title: 'Relatório de Saídas',
    shortTitle: 'Saídas de Caixa',
    description: 'Pagamentos, amortizações de financiamento e transferências físicas que saíram do caixa.',
    dateLabel: 'Data da saída',
    tone: 'rose',
    requiresAccount: false,
    allowsAccountFilter: true,
    showsStatus: false,
    flow: true,
    fileName: 'relatorio-saidas',
  },
  RECEITAS: {
    title: 'Relatório de Receitas',
    shortTitle: 'Receitas Operacionais',
    description: 'Receitas operacionais de mensalidades, previstas e realizadas por vencimento. Créditos, adiantamentos e empréstimos ficam fora desta visão.',
    dateLabel: 'Vencimento / competência',
    tone: 'emerald',
    requiresAccount: false,
    allowsAccountFilter: false,
    showsStatus: true,
    flow: false,
    fileName: 'relatorio-receitas',
  },
  DESPESAS: {
    title: 'Relatório de Despesas',
    shortTitle: 'Despesas Operacionais',
    description: 'Despesas operacionais previstas e realizadas por vencimento, incluindo rateios econômicos. Principal de empréstimo fica fora desta visão.',
    dateLabel: 'Vencimento / competência',
    tone: 'rose',
    requiresAccount: false,
    allowsAccountFilter: false,
    showsStatus: true,
    flow: false,
    fileName: 'relatorio-despesas',
  },
};

export const statusOptions: Array<{ value: RelatorioMovimentacaoFinanceiraStatus; label: string }> = [
  { value: 'ATIVOS', label: 'Ativos (pago, aberto e vencido)' },
  { value: 'TODOS', label: 'Todos os status' },
  { value: 'PAGO', label: 'Somente pagos' },
  { value: 'PENDENTE', label: 'Somente pendentes' },
  { value: 'VENCIDO', label: 'Somente vencidos' },
  { value: 'SUSPENSO', label: 'Somente suspensos' },
  { value: 'CANCELADO', label: 'Somente cancelados' },
  { value: 'ESTORNADO', label: 'Somente estornados' },
  { value: 'DEVOLVIDO', label: 'Somente devolvidos' },
];

const toInputDate = (date: Date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

export const initialPeriod = () => {
  const current = new Date();
  return {
    start: toInputDate(new Date(current.getFullYear(), current.getMonth(), 1)),
    end: toInputDate(current),
  };
};

export const statusTone = (status: string) => {
  const normalized = status.toUpperCase();
  if (normalized === 'PAGO' || normalized === 'RECEBIDO') return 'text-emerald-700 bg-emerald-50';
  if (normalized === 'VENCIDO') return 'text-rose-700 bg-rose-50';
  if (normalized === 'CANCELADO' || normalized === 'ESTORNADO' || normalized === 'DEVOLVIDO') return 'text-slate-500 bg-slate-100';
  return 'text-amber-700 bg-amber-50';
};

export const directionText = (item: RelatorioMovimentacaoFinanceiraItem) => {
  if (item.direcao === 'ENTRADA') return 'Entrada';
  if (item.direcao === 'SAIDA') return 'Saída';
  return item.classificacao || 'Lançamento';
};

export const directionClass = (item: RelatorioMovimentacaoFinanceiraItem) => (
  item.direcao === 'ENTRADA'
    ? 'text-emerald-700 bg-emerald-50'
    : item.direcao === 'SAIDA'
      ? 'text-rose-700 bg-rose-50'
      : 'text-slate-600 bg-slate-100'
);

export const reportFilters = (
  data: RelatorioMovimentacaoFinanceiraData,
  config: ReportConfiguration,
  applied: {
    categoria: string;
    status: RelatorioMovimentacaoFinanceiraStatus;
    busca: string;
  },
): FinancialReportFilter[] => {
  const selectedCategory = data.categorias.find((item) => item.chave === applied.categoria);
  const selectedStatus = statusOptions.find((item) => item.value === applied.status);

  return [
    { label: config.dateLabel, value: `${formatDate(data.meta.dataInicio)} a ${formatDate(data.meta.dataFim)}` },
    { label: 'Escopo', value: data.meta.escopo },
    ...(data.meta.contaSelecionada
      ? [{ label: 'Conta', value: data.meta.contaSelecionada }]
      : [{ label: 'Conta', value: 'Todas as contas' }]),
    ...(selectedCategory ? [{ label: 'Categoria', value: selectedCategory.rotulo }] : []),
    ...(config.showsStatus && selectedStatus ? [{ label: 'Situação', value: selectedStatus.label }] : []),
    ...(applied.busca ? [{ label: 'Busca', value: applied.busca }] : []),
  ];
};

export const reportSummary = (
  data: RelatorioMovimentacaoFinanceiraData,
  config: ReportConfiguration,
  hasStatementRowFilter = false,
): FinancialReportSummaryCard[] => {
  const { resumo } = data;

  if (data.meta.tipo === 'EXTRATO_CONTA') {
    return [
      { label: 'Saldo de abertura', value: resumo.saldoDisponivel && resumo.saldoAbertura !== null ? formatCurrency(resumo.saldoAbertura) : 'Indisponível', tone: 'slate' },
      { label: hasStatementRowFilter ? 'Entradas filtradas' : 'Entradas', value: formatCurrency(resumo.totalEntradas), tone: 'emerald' },
      { label: hasStatementRowFilter ? 'Saídas filtradas' : 'Saídas', value: formatCurrency(resumo.totalSaidas), tone: 'rose' },
      { label: 'Saldo de fechamento', value: resumo.saldoDisponivel && resumo.saldoFechamento !== null ? formatCurrency(resumo.saldoFechamento) : 'Indisponível', tone: 'blue' },
    ];
  }

  if (config.flow) {
    const isEntry = data.meta.tipo === 'ENTRADAS';
    return [
      { label: isEntry ? 'Total de entradas' : 'Total de saídas', value: formatCurrency(isEntry ? resumo.totalEntradas : resumo.totalSaidas), tone: isEntry ? 'emerald' : 'rose' },
      { label: 'Lançamentos', value: resumo.totalLancamentos, tone: 'slate' },
      { label: 'Valor realizado', value: formatCurrency(resumo.valorRealizado), tone: 'blue' },
    ];
  }

  return [
    { label: 'Total previsto', value: formatCurrency(resumo.valorPrevisto), tone: 'slate' },
    { label: 'Total realizado', value: formatCurrency(resumo.valorRealizado), tone: config.tone === 'emerald' ? 'emerald' : 'rose' },
    { label: 'Em aberto', value: formatCurrency(resumo.valorEmAberto), tone: 'amber' },
    { label: 'Lançamentos', value: resumo.totalLancamentos, tone: 'blue' },
  ];
};


export const getExportColumns = (tipo: RelatorioMovimentacaoFinanceiraTipo, config: ReportConfiguration): import('../../financeiro/components/FinancialReportPreview').FinancialReportColumn[] => {
    if (tipo === 'EXTRATO_CONTA') {
      return [
        { label: 'Data' },
        { label: 'Movimento' },
        { label: 'Descrição / contraparte' },
        { label: 'Categoria' },
        { label: 'Entrada', align: 'right', valueColor: 'green' },
        { label: 'Saída', align: 'right', valueColor: 'red' },
        { label: 'Saldo da conta', align: 'right' },
      ];
    }
    if (config.flow) {
      return [
        { label: 'Data' },
        { label: 'Classificação' },
        { label: 'Descrição / contraparte' },
        { label: 'Conta' },
        { label: 'Categoria' },
        { label: 'Valor', align: 'right' },
      ];
    }
    return [
      { label: 'Vencimento' },
      { label: 'Status', align: 'center' },
      { label: 'Descrição / contraparte' },
      { label: 'Categoria' },
      { label: 'Previsto', align: 'right' },
      { label: 'Realizado', align: 'right' },
    ];
};
