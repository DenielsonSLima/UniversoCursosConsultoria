import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { parseCaixaReviewPage, type CaixaReviewRequest } from './caixa-review-pending.contract';

export const normalizeReviewPolo = (poloId?: string | null) => poloId && poloId !== 'todos' ? poloId : null;
export const caixaReviewKeys = {
  root: ['caixa', 'review-pending', 'v1'] as const,
  forPolo: (poloId?: string | null) => [...caixaReviewKeys.root, normalizeReviewPolo(poloId)] as const,
  page: (request: CaixaReviewRequest) => [...caixaReviewKeys.forPolo(request.poloId),
    request.competencia, request.context, request.page, request.pageSize] as const,
};

export function assertCaixaReviewRequest(request: CaixaReviewRequest) {
  if ((request.poloId !== null && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(request.poloId))
    || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(request.competencia)
    || !['MONTHLY', 'FUTURE'].includes(request.context)
    || !Number.isSafeInteger(request.page) || request.page < 1
    || !Number.isSafeInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100) {
    throw new Error('Recorte inválido para consultar as pendências.');
  }
}

export async function getCaixaReviewPage(request: CaixaReviewRequest, signal?: AbortSignal) {
  assertCaixaReviewRequest(request);
  const call = supabase.rpc('get_caixa_review_pending_page_secure', {
    p_polo_id: request.poloId, p_competencia: request.competencia, p_context: request.context,
    p_page: request.page, p_page_size: request.pageSize,
  });
  if (signal) call.abortSignal(signal);
  let response;
  try { response = await call; } catch { throw new Error('Não foi possível carregar as pendências. Tente novamente.'); }
  if (response.error) throw new Error(response.error.code === '42501'
    ? 'Seu acesso não permite consultar estas pendências.'
    : 'Não foi possível carregar as pendências. Tente novamente.');
  return parseCaixaReviewPage(response.data, request);
}

export const caixaReviewQueryOptions = (request: CaixaReviewRequest) => queryOptions({
  queryKey: caixaReviewKeys.page(request),
  queryFn: ({ signal }) => getCaixaReviewPage(request, signal),
  staleTime: 0, gcTime: 0, retry: false, retryOnMount: false,
  refetchOnWindowFocus: false, refetchOnReconnect: false,
});
