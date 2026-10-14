import { requireGestorAtivo, authorizationErrorHttpStatus } from '../_shared/authz.ts';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded } from '../_shared/http.ts';
import { parsePaymentRequest, PaymentRequestError, UUID_RE } from './contract.ts';
import { createPaymentStore, type RpcClient } from './store.ts';
import { createReceiptBank } from './bank.ts';
import { processReceipt } from './processor.ts';
import { completeAcademicProjection } from './academic.ts';
type Dependencies = {
  createAdmin: () => any; createUser: (authorization: string) => RpcClient;
  authorize?: typeof requireGestorAtivo; process?: typeof processReceipt;
  academic?: typeof completeAcademicProjection;
};
const respond = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...buildCorsHeaders(req, { methods: 'POST, OPTIONS' }),
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
});
export const createPaymentHandler = (dependencies: Dependencies) => async (req: Request) => {
  if (req.method === 'OPTIONS') return respond(req, { ok: true });
  if (req.method !== 'POST') return respond(req, { error: 'Método não permitido.' }, 405);
  if (isRateLimitExceeded(`receivable-payment:${getClientIp(req)}`, 30, 60_000)) {
    return respond(req, { error: 'Aguarde alguns instantes antes de continuar.' }, 429);
  }
  try {
    const text = await req.text();
    if (!text || text.length > 12_000) throw new PaymentRequestError(400, 'Solicitação inválida.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new PaymentRequestError(400, 'Solicitação inválida.'); }
    const input = parsePaymentRequest(value);
    const admin = dependencies.createAdmin();
    try { await (dependencies.authorize ?? requireGestorAtivo)(req, admin); }
    catch (error) {
      throw new PaymentRequestError(authorizationErrorHttpStatus(error instanceof Error ? error.message : '') ?? 503,
        'Não foi possível autorizar o recebimento. Verifique seu acesso.');
    }
    // Source tab, profile, polo, accounts and actor are authorized by SQL with
    // this verified JWT, including completed replays and subsequent service calls.
    const user = dependencies.createUser(req.headers.get('Authorization') ?? '');
    const begin = await user.rpc('begin_receivable_payment_secure', { p_source_id: input.sourceId, p_input: input });
    if (begin.error && /PAYMENT_PREVIEW_CHANGED|PAYMENT_PREVIEW_STALE|PAYMENT_EXCEEDS_REMAINING/.test(
      String((begin.error as { message?: string }).message ?? ''))) {
      // These errors occur before begin inserts an attempt or calls the bank.
      throw new PaymentRequestError(409, 'O saldo mudou. Atualize a prévia e confira os valores.', true);
    }
    if (begin.error || begin.data?.attemptId !== input.requestId || !UUID_RE.test(begin.data?.attemptId ?? '') ||
      begin.data?.sourceId !== input.sourceId) {
      throw new PaymentRequestError(409, 'O saldo, a cobrança ou seu acesso mudou. Confira a prévia antes de receber.');
    }
    const result = await (dependencies.process ?? processReceipt)(begin.data.attemptId, input.sourceId,
      { store: createPaymentStore(admin), bank: createReceiptBank(admin) });
    if (!result?.success || !UUID_RE.test(result.paymentId ?? '') || !result.preview) throw new Error('PAYMENT_RESULT_INVALID');
    return respond(req, await (dependencies.academic ?? completeAcademicProjection)(admin, input.sourceId, result));
  } catch (error) {
    if (error instanceof PaymentRequestError) return respond(req, { error: error.message, safeToEdit: error.safeToEdit }, error.status);
    return respond(req, { error: 'Recebimento não confirmado. Retome a mesma solicitação para consultar o resultado.' }, 503);
  }
};
