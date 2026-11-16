import { supabase } from '../../../lib/supabase';
import { assertEadCouponsEnvironment } from './coupons-environment';
import type {
  EadCouponFreeInput, EadCouponFreeRedemption, EadCouponQuote, EadCouponQuoteInput,
} from './coupons-student.types';

export const normalizeEadCouponCode = (code: string) => code.trim().toUpperCase();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const hasMoney = (value: Record<string, unknown>) =>
  ['originalAmount', 'discountAmount', 'payableAmount'].every(key =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0);

export const parseEadCouponQuote = (data: unknown): EadCouponQuote => {
  if (!isRecord(data) || !hasMoney(data) || typeof data.couponId !== 'string' || !data.couponId
    || (data.requestId !== undefined && (typeof data.requestId !== 'string' || !data.requestId))
    || typeof data.turmaId !== 'string' || !data.turmaId || typeof data.code !== 'string' || !data.code
    || typeof data.discountPercent !== 'number' || ![50, 100].includes(data.discountPercent)
    || (data.discountPercent === 100 && data.payableAmount !== 0)) {
    throw new Error('A consulta do cupom retornou dados inválidos.');
  }
  return data as unknown as EadCouponQuote;
};

export const parseEadCouponFreeRedemption = (data: unknown): EadCouponFreeRedemption => {
  if (!isRecord(data) || !hasMoney(data) || data.status !== 'CONFIRMED' || data.payableAmount !== 0
    || typeof data.couponId !== 'string' || !data.couponId
    || typeof data.matriculaId !== 'string' || !data.matriculaId) {
    throw new Error('O resgate do cupom retornou um estado inválido.');
  }
  return data as unknown as EadCouponFreeRedemption;
};

export const eadCouponStudentService = {
  async quote(input: EadCouponQuoteInput, signal?: AbortSignal): Promise<EadCouponQuote> {
    assertEadCouponsEnvironment();
    let request = supabase.rpc('ead_coupon_quote', {
      p_code: normalizeEadCouponCode(input.code), p_course_id: input.courseId,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw new Error(error.message || 'Não foi possível aplicar o cupom.');
    const quote = parseEadCouponQuote(data);
    if (quote.code !== normalizeEadCouponCode(input.code)) throw new Error('A consulta retornou outro cupom.');
    return quote;
  },
  async redeemFree(input: EadCouponFreeInput): Promise<EadCouponFreeRedemption> {
    assertEadCouponsEnvironment();
    const { data, error } = await supabase.rpc('ead_coupon_redeem_free', {
      p_code: normalizeEadCouponCode(input.code), p_turma_id: input.turmaId, p_request_id: input.requestId,
    });
    if (error) throw new Error(error.message || 'Não foi possível confirmar a gratuidade.');
    return parseEadCouponFreeRedemption(data);
  },
};
