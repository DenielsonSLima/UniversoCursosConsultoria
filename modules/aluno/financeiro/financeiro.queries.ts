import { queryOptions } from '@tanstack/react-query';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';
import { alunoFinanceiroService } from './financeiro.service';
import type { AlunoFinancialFilters } from './financeiro.types';

export const alunoFinanceiroKeys = {
  all: (alunoId: string) => alunoCourseAccessKeys.finance(alunoId),
  lists: (alunoId: string) => (
    [...alunoFinanceiroKeys.all(alunoId), 'list'] as const
  ),
  list: (alunoId: string, filters: AlunoFinancialFilters) => ([
    ...alunoFinanceiroKeys.lists(alunoId),
    {
      search: filters.search,
      startDate: filters.startDate,
      endDate: filters.endDate,
      modality: filters.modality,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
    },
  ] as const),
  details: (alunoId: string) => (
    [...alunoFinanceiroKeys.all(alunoId), 'detail'] as const
  ),
  detail: (alunoId: string, paymentId: string) => (
    [...alunoFinanceiroKeys.details(alunoId), paymentId] as const
  ),
  receipts: (alunoId: string) => (
    [...alunoFinanceiroKeys.all(alunoId), 'receipt'] as const
  ),
  receipt: (alunoId: string, paymentId: string) => (
    [...alunoFinanceiroKeys.receipts(alunoId), paymentId] as const
  ),
};

export const alunoFinanceiroListOptions = (
  alunoId: string,
  filters: AlunoFinancialFilters,
) => queryOptions({
  queryKey: alunoFinanceiroKeys.list(alunoId, filters),
  queryFn: ({ signal }) => alunoFinanceiroService.list(alunoId, filters, signal),
  enabled: Boolean(alunoId),
  staleTime: 60_000,
  retry: 1,
  refetchOnWindowFocus: true,
});

export const alunoFinanceiroPaymentOptions = (
  alunoId: string,
  paymentId: string,
) => queryOptions({
  queryKey: alunoFinanceiroKeys.detail(alunoId, paymentId),
  queryFn: ({ signal }) => alunoFinanceiroService.getPayment(
    alunoId,
    paymentId,
    signal,
  ),
  enabled: Boolean(alunoId && paymentId),
  staleTime: 15_000,
  retry: 1,
});

export const alunoFinanceiroReceiptOptions = (
  alunoId: string,
  paymentId: string,
) => queryOptions({
  queryKey: alunoFinanceiroKeys.receipt(alunoId, paymentId),
  queryFn: ({ signal }) => alunoFinanceiroService.getReceipt(
    alunoId,
    paymentId,
    signal,
  ),
  enabled: Boolean(alunoId && paymentId),
  staleTime: 0,
  gcTime: 0,
  retry: 1,
});
