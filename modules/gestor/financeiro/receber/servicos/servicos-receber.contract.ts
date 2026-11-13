import type { ContasReceber, ReceivablesSummary, ReceivablesGroupSummary } from '../../financeiro.types';
import { mapReceivableRpcRow, mapReceivablesSummary } from '../../financeiro.receivables-mappers';

export type ServiceStatusScope = 'ALL' | 'PENDING' | 'UPCOMING' | 'RECEIVED' | 'CANCELLED' | 'OVERDUE';
export type ServiceCancellationState = 'PENDING' | 'CANCELLED' | 'PAID' | 'REVIEW_REQUIRED';
export interface ServiceReceivablesFilters {
  poloId?: string | null; search: string; dueStart: string; dueEnd: string; statusScope: ServiceStatusScope;
}
export interface ServiceReceivable extends ContasReceber {
  nfseNumber: string | null; nfseAccessKey: string | null; nfseFiscalCancelledAt: string | null;
  nfseFiscalDescription: string | null; nfseInstallmentNumber: number | null; nfseInstallmentCount: number | null;
  nfseCancellationState: ServiceCancellationState | null; nfseCancellationReason: string | null;
}
export interface ServiceReceivablesPage { rows: ServiceReceivable[]; totalItems: number; page: number; pageSize: number }
export interface ServiceReceivablesGroup extends ReceivablesGroupSummary { first: ServiceReceivable }
export interface ServiceReceivablesGroupsPage {
  groups: ServiceReceivablesGroup[]; totalItems: number; totalReceivables: number; page: number; pageSize: number;
}
export interface ServiceReceivablesExport { rows: ServiceReceivable[]; totalItems: number; summary: ReceivablesSummary; generatedAt: string }
const statuses = ['ALL', 'PENDING', 'UPCOMING', 'RECEIVED', 'CANCELLED', 'OVERDUE'];
const fail = (): never => { throw new Error('A consulta dos serviços não foi confirmada. Tente novamente.'); };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const natural = (value: unknown, minimum = 0) => typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : fail();
const optionalText = (value: unknown) => value == null ? null : typeof value === 'string' ? value : fail();
const requiredText = (value: unknown) => typeof value === 'string' ? value : fail();
const cancellationState = (value: unknown): ServiceCancellationState | null => value == null ? null
  : ['PENDING', 'CANCELLED', 'PAID', 'REVIEW_REQUIRED'].includes(String(value)) ? value as ServiceCancellationState : fail();

function parseServiceReceivable(value: unknown): ServiceReceivable {
  const row = record(value);
  if (typeof row.id !== 'string' || typeof row.polo_id !== 'string' || typeof row.descricao !== 'string'
    || typeof row.data_vencimento !== 'string' || !Number.isFinite(Number(row.valor))) fail();
  return { ...mapReceivableRpcRow(row), nfseNumber: optionalText(row.nfse_number),
    nfseAccessKey: optionalText(row.nfse_access_key), nfseFiscalCancelledAt: optionalText(row.nfse_fiscal_cancelled_at),
    nfseFiscalDescription: optionalText(row.nfse_fiscal_description),
    nfseCancellationState: cancellationState(row.nfse_cancellation_state), nfseCancellationReason: optionalText(row.nfse_cancellation_reason),
    nfseInstallmentNumber: row.nfse_installment_number == null ? null : natural(row.nfse_installment_number, 1),
    nfseInstallmentCount: row.nfse_installment_count == null ? null : natural(row.nfse_installment_count, 1) };
}

export function serviceReceivablesArgs(filters: ServiceReceivablesFilters) {
  if (!statuses.includes(filters.statusScope) || filters.search.length > 200) fail();
  for (const date of [filters.dueStart, filters.dueEnd]) if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail();
  if (filters.dueStart && filters.dueEnd && filters.dueStart > filters.dueEnd) throw new Error('A data final deve ser igual ou posterior à inicial.');
  return { p_polo_id: filters.poloId && filters.poloId !== 'todos' ? filters.poloId : null,
    p_search: filters.search.trim() || null, p_due_start: filters.dueStart || null,
    p_due_end: filters.dueEnd || null, p_status_scope: filters.statusScope };
}

export function parseServiceReceivablesPage(value: unknown, expectedPage: number, expectedPageSize: number): ServiceReceivablesPage {
  const payload = record(typeof value === 'string' ? JSON.parse(value) : value);
  const page = natural(payload.page, 1), pageSize = natural(payload.page_size, 1), totalItems = natural(payload.total_items);
  if (page !== expectedPage || pageSize !== expectedPageSize || !Array.isArray(payload.rows)
    || payload.rows.length > pageSize || payload.rows.length > totalItems) fail();
  const rows = (payload.rows as unknown[]).map(parseServiceReceivable);
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail();
  return { rows, totalItems, page, pageSize };
}

export function parseServiceReceivablesGroups(value: unknown, expectedPage: number, expectedPageSize: number): ServiceReceivablesGroupsPage {
  const payload = record(typeof value === 'string' ? JSON.parse(value) : value);
  const page = natural(payload.page, 1), pageSize = natural(payload.page_size, 1), totalItems = natural(payload.total_items);
  const totalReceivables = natural(payload.total_receivables);
  if (page !== expectedPage || pageSize !== expectedPageSize || !Array.isArray(payload.groups)
    || payload.groups.length > pageSize || payload.groups.length > totalItems) fail();
  const groups = (payload.groups as unknown[]).map(value => {
    const group = record(value), first = parseServiceReceivable(group.first);
    if (typeof group.key !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(group.key)
      || typeof group.label !== 'string' || first.clienteId !== group.key) fail();
    return { key: requiredText(group.key), label: requiredText(group.label), first, itemCount: natural(group.item_count, 1),
      pendingCount: natural(group.pending_count), receivedCount: natural(group.received_count),
      canceledCount: natural(group.canceled_count), nextDue: optionalText(group.next_due) || '' };
  });
  if (new Set(groups.map(group => group.key)).size !== groups.length || totalReceivables < totalItems) fail();
  return { groups, totalItems, totalReceivables, page, pageSize };
}

export function parseServiceReceivablesSummary(value: unknown): ReceivablesSummary {
  const row = record(Array.isArray(value) ? value[0] : value);
  for (const key of ['pending_count', 'received_count', 'canceled_count', 'overdue_count', 'all_count',
    'pending_value', 'received_value', 'canceled_value', 'overdue_value', 'all_value']) {
    if (row[key] == null || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0) fail();
  }
  return mapReceivablesSummary(row);
}

export function parseServiceReceivablesExport(value: unknown): ServiceReceivablesExport {
  const payload = record(typeof value === 'string' ? JSON.parse(value) : value), totalItems = natural(payload.total_items);
  if (!Array.isArray(payload.rows) || totalItems > 5000 || payload.rows.length !== totalItems
    || typeof payload.generated_at !== 'string' || !Number.isFinite(Date.parse(payload.generated_at))) fail();
  const rows = (payload.rows as unknown[]).map(parseServiceReceivable);
  if (new Set(rows.map(row => row.id)).size !== totalItems) fail();
  return { rows, totalItems, summary: parseServiceReceivablesSummary(payload.summary), generatedAt: requiredText(payload.generated_at) };
}

export const serviceReceivablesKeys = {
  root: ['financeiro', 'receivables', 'servicos'] as const,
  scope: (poloId?: string | null) => ['financeiro', 'receivables', 'servicos', poloId || 'todos'] as const,
  page: (filters: ServiceReceivablesFilters, page: number, pageSize: number) =>
    [...serviceReceivablesKeys.scope(filters.poloId), 'page', filters, page, pageSize] as const,
  summary: (filters: ServiceReceivablesFilters) => [...serviceReceivablesKeys.scope(filters.poloId), 'summary', filters] as const,
  groups: (filters: ServiceReceivablesFilters, page: number, pageSize: number) =>
    [...serviceReceivablesKeys.scope(filters.poloId), 'groups', filters, page, pageSize] as const,
  groupItems: (filters: ServiceReceivablesFilters, partnerId: string, page: number, pageSize: number) =>
    [...serviceReceivablesKeys.scope(filters.poloId), 'groupItems', filters, partnerId, page, pageSize] as const,
  export: (filters: ServiceReceivablesFilters) => [...serviceReceivablesKeys.scope(filters.poloId), 'export', filters] as const,
};
