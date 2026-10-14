export const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MONEY_RE = /^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$/;
export class PaymentRequestError extends Error {
  constructor(readonly status: number, message: string, readonly safeToEdit = false) { super(message); }
}
export type PaymentRequest = {
  requestId: string; sourceId: string; paymentDate: string;
  components: Array<{ accountId: string; method: string; amount: string }>;
  interest: string; penalty: string; addition: string; discount: string;
  notes: string; fingerprint: string;
};
export function parsePaymentRequest(value: unknown): PaymentRequest {
  const input = value as Partial<PaymentRequest> | null;
  const fail = () => { throw new PaymentRequestError(400, 'Confira a data, os valores e as contas do recebimento.'); };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    !UUID_RE.test(String(input.requestId ?? '')) || !UUID_RE.test(String(input.sourceId ?? '')) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(input.paymentDate ?? '')) ||
    !/^([a-f0-9]{32}|[a-f0-9]{64})$/.test(String(input.fingerprint ?? '')) ||
    !Array.isArray(input.components) || input.components.length < 1 || input.components.length > 20 ||
    typeof input.notes !== 'string' || input.notes.length > 2000) return fail();
  for (const name of ['interest', 'penalty', 'addition', 'discount'] as const) {
    if (typeof input[name] !== 'string' || !MONEY_RE.test(input[name]!)) return fail();
  }
  const components = input.components.map(component => {
    if (!component || !UUID_RE.test(component.accountId) ||
      !['DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TED'].includes(component.method) ||
      typeof component.amount !== 'string' || !MONEY_RE.test(component.amount)) return fail();
    return { accountId: component.accountId, method: component.method, amount: component.amount };
  });
  // Never forward arbitrary actor IDs, source kinds, remote evidence or server flags.
  return { requestId: input.requestId!, sourceId: input.sourceId!, paymentDate: input.paymentDate!,
    components, interest: input.interest!, penalty: input.penalty!, addition: input.addition!,
    discount: input.discount!, notes: input.notes!, fingerprint: input.fingerprint! };
}
