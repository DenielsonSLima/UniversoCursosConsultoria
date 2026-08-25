import { queryOptions } from '@tanstack/react-query';
import { professorFinanceiroService } from './financeiro.service';
import type {
  ProfessorFinancialFilters,
  ProfessorFinancialReceiptRequest,
} from './financeiro.types';

export const professorFinanceiroKeys = {
  all: ['professor', 'financeiro'] as const,
  lists: (professorId: string, poloId: string) => (
    [...professorFinanceiroKeys.all, 'list', professorId, poloId] as const
  ),
  list: (
    professorId: string,
    poloId: string,
    filters: ProfessorFinancialFilters,
  ) => ([
    ...professorFinanceiroKeys.lists(professorId, poloId),
    {
      search: filters.search,
      startDate: filters.startDate,
      endDate: filters.endDate,
      category: filters.category,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
    },
  ] as const),
  receipts: (professorId: string, poloId: string) => (
    [...professorFinanceiroKeys.all, 'receipt', professorId, poloId] as const
  ),
  receipt: ({ professorId, poloId, paymentId }: ProfessorFinancialReceiptRequest) => (
    [...professorFinanceiroKeys.receipts(professorId, poloId), paymentId] as const
  ),
};

export const professorFinanceiroListOptions = (
  professorId: string,
  poloId: string,
  filters: ProfessorFinancialFilters,
) => queryOptions({
  queryKey: professorFinanceiroKeys.list(professorId, poloId, filters),
  queryFn: ({ signal }) => professorFinanceiroService.list(
    professorId,
    poloId,
    filters,
    signal,
  ),
  enabled: Boolean(professorId && poloId),
  staleTime: 30_000,
  retry: 1,
});

export const professorFinanceiroReceiptOptions = (
  request: ProfessorFinancialReceiptRequest,
) => queryOptions({
  queryKey: professorFinanceiroKeys.receipt(request),
  queryFn: ({ signal }) => professorFinanceiroService.getReceipt(request, signal),
  enabled: Boolean(request.professorId && request.poloId && request.paymentId),
  staleTime: 0,
  gcTime: 0,
  retry: 1,
});
