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
  return Boolean(data && !failed && now - startedAt < 10 * 60_000 &&
    ['PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO'].includes(data.payment.status));
}

export function watchOtherCreditPayment(receivableId: string, onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 300);
  };
  const channel = supabase.channel(`pdv-payment-${receivableId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'finance_realtime_events',
      filter: `entity_id=eq.${receivableId}`,
    }, payload => {
      if (payload.new.source_table === 'contas_receber') refresh();
    }).subscribe(status => {
      // Catch changes between the first read and subscription/reconnection.
      if (status === 'SUBSCRIBED') refresh();
    });
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
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
