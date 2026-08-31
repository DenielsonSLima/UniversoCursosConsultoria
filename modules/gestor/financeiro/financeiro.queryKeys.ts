import {
  ReceivablesPageFilters,
  ReceivablesSummaryFilters,
  TransferenciasFilters,
} from './financeiro.service';

export type CourseModality = 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';

const RECEIVABLES_DETAIL_CONTRACT_VERSION = 'active-class-filter-v1';

export const financeiroQueryKeys = {
  all: ['financeiro'] as const,
  receivablesRoot: ['financeiro', 'receivables'] as const,
  receivablesByModality: (modality: CourseModality, poloId?: string | null) =>
    ['financeiro', 'receivables', 'modality', modality, poloId || 'sem-polo'] as const,
  receivablesPageByModality: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-page', RECEIVABLES_DETAIL_CONTRACT_VERSION, modality, filters] as const,
  receivablesGroupsByModality: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-groups', RECEIVABLES_DETAIL_CONTRACT_VERSION, modality, filters] as const,
  receivablesGroupItems: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-group-items', RECEIVABLES_DETAIL_CONTRACT_VERSION, modality, filters] as const,
  receivablesModalitySummary: (modality: CourseModality, filters: ReceivablesSummaryFilters) =>
    ['financeiro', 'receivables', 'modality-summary', modality, filters] as const,
  receivablesActiveClassesByModality: (modality: CourseModality, poloId?: string | null) =>
    ['financeiro', 'receivables', 'active-classes', modality, poloId || 'sem-polo'] as const,
  outrosCreditosRoot: ['financeiro', 'outros-creditos'] as const,
  outrosCreditosList: (poloId?: string | null) =>
    ['financeiro', 'outros-creditos', 'list', poloId || 'sem-polo'] as const,
  outrosCreditosSummary: (filters: ReceivablesSummaryFilters) =>
    ['financeiro', 'outros-creditos', 'summary', filters] as const,
  transferenciasRoot: ['financeiro', 'transferencias'] as const,
  transferenciasList: (filters: TransferenciasFilters) =>
    ['financeiro', 'transferencias', 'list', filters] as const,
  transferenciasSummary: (filters: TransferenciasFilters) =>
    ['financeiro', 'transferencias', 'summary', filters] as const,
  conciliacaoBancariaRoot: ['financeiro', 'conciliacao-bancaria'] as const,
  conciliacaoBancariaItems: (poloId?: string | null) =>
    ['financeiro', 'conciliacao-bancaria', 'items', poloId || 'sem-polo'] as const,
  conciliacaoBancariaTransacoes: (poloId?: string | null) =>
    ['financeiro', 'conciliacao-bancaria', 'transacoes', poloId || 'sem-polo'] as const,
  baneseApiHealthByEnvironment: (environment?: string | null) =>
    ['financeiro', 'banese-api-health', environment || 'sem-ambiente'] as const,
  baneseApiHealth: (
    environment?: string | null,
    credentialEvidence?: {
      configured: boolean;
      lastTestAt?: string | null;
      lastTestStatus?: string | null;
    } | null,
  ) => [
    'financeiro',
    'banese-api-health',
    environment || 'sem-ambiente',
    credentialEvidence || null,
  ] as const,
  contasBancariasSaldos: ['financeiro', 'contas-bancarias-saldos'] as const,
  polos: ['financeiro', 'polos'] as const,
  parceiros: ['financeiro', 'parceiros'] as const,
  parceirosByPolo: (poloId?: string | null) =>
    ['financeiro', 'parceiros', poloId || 'todos'] as const,
  resumoKpis: ['financeiro-resumo-kpis'] as const,
  resumoKpisByPolo: (poloId?: string | null) =>
    ['financeiro-resumo-kpis', poloId || 'todos'] as const,
  resumoFinanceiroByPoloPeriod: (
    poloId: string | null | undefined,
    start: string,
    end: string,
  ) => [
    'financeiro-resumo-kpis',
    poloId || 'todos',
    'financial',
    start,
    end,
  ] as const,
  resumoOverdueByPolo: (poloId: string | null | undefined, asOf: string) => [
    'financeiro-resumo-kpis',
    poloId || 'todos',
    'overdue',
    asOf,
  ] as const,
  resumoFlowByPolo: (poloId: string | null | undefined, monthKey: string) => [
    'financeiro-resumo-kpis',
    poloId || 'todos',
    'flow-3-months',
    monthKey,
  ] as const,
  alunoReceivables: ['financeiro-aluno-receivables'] as const,
  alunoReceivablesSearch: (search: string, poloId?: string | null) =>
    ['financeiro-aluno-receivables', search, poloId || 'todos'] as const,
};
