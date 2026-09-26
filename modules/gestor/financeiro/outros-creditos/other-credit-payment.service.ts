import { supabase } from '../../../../lib/supabase';
import type { BanesePaymentRecord } from '../../../aluno/financeiro/banese/banese-payment.types';

export type OtherCreditPayment = {
  payment: BanesePaymentRecord;
  customerName: string;
  canPay: boolean;
  canRefresh: boolean;
  boletoAvailable: boolean;
  pixState: 'available' | 'pending' | 'sandbox-unavailable';
  needsReview: boolean;
};

export async function getOtherCreditPayment(receivableId: string, signal: AbortSignal): Promise<OtherCreditPayment> {
  const { data, error } = await supabase.functions.invoke<OtherCreditPayment>('gestor-other-credit-payment', {
    body: { action: 'get', receivableId }, signal,
  });
  if (error) {
    const context = (error as { context?: Response }).context;
    const body = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(body?.error || 'Não foi possível consultar a cobrança. Tente novamente.');
  }
  if (!data?.payment || data.payment.id !== receivableId) throw new Error('Cobrança não disponível para este caixa.');
  return data;
}

export function safeOtherCreditLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function shouldWatchOtherCredit(data: OtherCreditPayment | undefined, failed: boolean, startedAt: number, now: number) {
  return Boolean(data?.canPay && !failed && now - startedAt < 10 * 60_000);
}

export async function refreshOtherCreditPayment(receivableId: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const { data, error } = await supabase.functions.invoke('asaas-api', {
      body: { action: 'refresh-receivable-status', receivableId }, signal: controller.signal,
    });
    if (controller.signal.aborted) throw new Error('A consulta demorou mais que o esperado. Aguarde antes de verificar novamente.');
    if (error) {
      const context = (error as { context?: Response }).context;
      const body = context instanceof Response ? await context.json().catch(() => null) : null;
      throw new Error(body?.error || 'Não foi possível consultar o pagamento no banco.');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  } finally { window.clearTimeout(timeout); }
}
