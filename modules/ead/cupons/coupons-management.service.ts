import { supabase } from '../../../lib/supabase';
import { assertEadCouponsEnvironment } from './coupons-environment';
import type {
  EadCoupon, EadCouponCourseOption, EadCouponHistoryItem, EadCouponPage,
  SaveEadCouponInput,
} from './coupons-management.types';

async function rpc<T>(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  assertEadCouponsEnvironment();
  const request = supabase.rpc(name, args);
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw Object.assign(new Error(error.code === '23505'
    ? 'Este código de cupom já está em uso. Escolha outro código.'
    : error.code === 'PT409' && /cupom foi alterado|versão antiga/i.test(error.message || '')
    ? 'Este cupom foi alterado por outra pessoa. Feche e reabra o formulário para conferir a versão atual antes de salvar.'
    : error.message || 'Não foi possível concluir a operação de cupons.'), { code: error.code });
  if (data === null || data === undefined) throw new Error('O serviço de cupons não retornou os dados esperados.');
  return data as T;
}

function scope(poloId: string) {
  if (!poloId) throw new Error('Selecione um polo para administrar cupons.');
  return { p_polo_id: poloId };
}

export const eadCouponsManagementService = {
  list: (poloId: string, search: string, page: number, signal?: AbortSignal) =>
    rpc<EadCouponPage<EadCoupon>>('ead_coupons_list', {
      ...scope(poloId), p_search: search, p_page: page,
    }, signal),
  save: ({ poloId, coupon, requestId }: SaveEadCouponInput) =>
    rpc<EadCoupon>('ead_coupons_save', {
      ...scope(poloId), p_coupon: coupon, p_request_id: requestId,
    }),
  history: (poloId: string, couponId: string, page: number, signal?: AbortSignal) =>
    rpc<EadCouponPage<EadCouponHistoryItem>>('ead_coupons_history', {
      ...scope(poloId), p_coupon_id: couponId, p_page: page,
    }, signal),
  courses: (poloId: string, search: string, signal?: AbortSignal) =>
    rpc<EadCouponCourseOption[]>('ead_coupons_courses', {
      ...scope(poloId), p_search: search,
    }, signal),
};
