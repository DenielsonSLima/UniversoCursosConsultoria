import type { ReceivablesSummary, ReceivablesSummaryFilters, ReceivablesStatusScope } from '../../../financeiro.types';
import { getMaceioDateKey } from '../../../conciliacao-bancaria/conciliacao-bancaria.utils.ts';
import {
  getResumoMonthRange,
  getResumoPresetRange,
  shiftResumoDateKey,
  validateResumoCustomRange,
  type ResumoPeriodRange,
} from '../../../resumo/resumo-period.ts';

export type ReceivablesScope = ReceivablesStatusScope | 'upcoming';
export type ReceivablesPeriodPreset = 'CURRENT_MONTH' | 'PREVIOUS_MONTH' | 'LAST_30_DAYS' | 'ALL' | 'CUSTOM';
export interface ReceivablesPeriod extends ResumoPeriodRange {
  preset: ReceivablesPeriodPreset;
}

export const RECEIVABLES_PERIODS: Array<{ id: ReceivablesPeriodPreset; label: string }> = [
  { id: 'CURRENT_MONTH', label: 'Este mês' },
  { id: 'PREVIOUS_MONTH', label: 'Mês anterior' },
  { id: 'LAST_30_DAYS', label: 'Últimos 30 dias' },
  { id: 'ALL', label: 'Todo o período' },
  { id: 'CUSTOM', label: 'Personalizado' },
];

export const getReceivablesPeriod = (
  preset: Exclude<ReceivablesPeriodPreset, 'CUSTOM'> = 'CURRENT_MONTH',
  reference = new Date(),
): ReceivablesPeriod => {
  if (preset === 'ALL') return { preset, start: '', end: '' };
  const currentMonth = getResumoPresetRange('CURRENT_MONTH', reference);
  if (preset === 'PREVIOUS_MONTH') {
    return { preset, ...getResumoMonthRange(shiftResumoDateKey(currentMonth.start, -1)) };
  }
  return { preset, ...getResumoPresetRange(preset, reference) };
};

export const validateReceivablesPeriod = (period: ReceivablesPeriod) => (
  period.preset === 'ALL' ? null : validateResumoCustomRange(period)
);

// A mesma interseção é usada no total canônico, na lista e na exportação.
// Intervalos anteriores a hoje ficam vazios (início > fim), sem virar histórico geral.
export const getUpcomingReceivablesFilters = (
  filters: ReceivablesSummaryFilters,
  today = getMaceioDateKey(),
): ReceivablesSummaryFilters => ({
  ...filters,
  dueStart: filters.dueStart && filters.dueStart > today ? filters.dueStart : today,
});

export const getReceivablesListScope = (
  scope: ReceivablesScope,
  filters: ReceivablesSummaryFilters,
  today = getMaceioDateKey(),
) => ({
  ...(scope === 'upcoming' ? getUpcomingReceivablesFilters(filters, today) : filters),
  statusScope: scope === 'upcoming' ? 'pending' as const : scope,
});

export const getReceivablesScopeTotal = (scope: ReceivablesScope, summary: ReceivablesSummary) => {
  switch (scope) {
    case 'upcoming':
    case 'pending': return { count: summary.pendingCount, value: summary.pendingValue };
    case 'received': return { count: summary.receivedCount, value: summary.receivedValue };
    case 'overdue': return { count: summary.overdueCount, value: summary.overdueValue };
    case 'canceled': return { count: summary.canceledCount, value: summary.canceledValue };
    case 'all': return { count: summary.allCount, value: summary.allValue };
  }
};
