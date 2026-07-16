import {
  ReceivablesPageFilters,
  ReceivablesSummaryFilters,
  TransferenciasFilters,
} from './financeiro.service';

export type CourseModality = 'TECNICO' | 'EAD' | 'LIVRE' | 'ESPECIALIZACAO';

export const financeiroQueryKeys = {
  all: ['financeiro'] as const,
  receivablesRoot: ['financeiro', 'receivables'] as const,
  receivablesByModality: (modality: CourseModality, poloId?: string | null) =>
    ['financeiro', 'receivables', 'modality', modality, poloId || 'sem-polo'] as const,
  receivablesPageByModality: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-page', modality, filters] as const,
  receivablesGroupsByModality: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-groups', modality, filters] as const,
  receivablesGroupItems: (modality: CourseModality, filters: ReceivablesPageFilters) =>
    ['financeiro', 'receivables', 'modality-group-items', modality, filters] as const,
  receivablesModalitySummary: (modality: CourseModality, filters: ReceivablesSummaryFilters) =>
    ['financeiro', 'receivables', 'modality-summary', modality, filters] as const,
  outrosCreditosRoot: ['financeiro', 'outros-creditos'] as const,
  outrosCreditosList: (poloId?: string | null) =>
    ['financeiro', 'outros-creditos', 'list', poloId || 'sem-polo'] as const,
  outrosCreditosSummary: (filters: ReceivablesSummaryFilters) =>
    ['financeiro', 'outros-creditos', 'summary', filters] as const,
  transferenciasRoot: ['financeiro', 'transferencias'] as const,
  transferenciasList: (filters: TransferenciasFilters) =>
    ['financeiro', 'transferencias', 'list', filters] as const,
  contasBancariasSaldos: ['financeiro', 'contas-bancarias-saldos'] as const,
  polos: ['financeiro', 'polos'] as const,
  parceiros: ['financeiro', 'parceiros'] as const,
  resumoKpis: ['financeiro', 'resumo-kpis'] as const,
  alunoReceivables: ['financeiro', 'aluno-receivables'] as const,
};
