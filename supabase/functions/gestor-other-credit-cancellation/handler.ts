import { requireGestorAtivo, requireGestorTab, authorizationErrorHttpStatus } from '../_shared/authz.ts';
import { buildCorsHeaders, getClientIp, isRateLimitExceeded } from '../_shared/http.ts';
import { CancellationRequestError, parseCancellationRequest, UUID_RE } from './contract.ts';
import { createCancellationStore, type RpcClient } from './store.ts';
import { createCancellationBank } from './bank.ts';
import { processCancellationBatch } from './processor.ts';

type Dependencies = {
  createAdmin: () => any;
  createUser: (authorization: string) => RpcClient;
  authorize?: typeof requireGestorAtivo;
  process?: typeof processCancellationBatch;
};
const respond = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...buildCorsHeaders(req, { methods: 'POST, OPTIONS' }),
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
});

export const createCancellationHandler = (dependencies: Dependencies) => async (req: Request) => {
  if (req.method === 'OPTIONS') return respond(req, { ok: true });
  if (req.method !== 'POST') return respond(req, { error: 'Método não permitido.' }, 405);
  if (isRateLimitExceeded(`other-credit-cancellation:${getClientIp(req)}`, 20, 60_000)) {
    return respond(req, { error: 'Aguarde alguns instantes antes de continuar.' }, 429);
  }
  try {
    const text = await req.text();
    if (!text || text.length > 4_096) throw new CancellationRequestError(400, 'Solicitação inválida.');
    let parsed: unknown;
    try { parsed = JSON.parse(text); }
    catch { throw new CancellationRequestError(400, 'Solicitação inválida.'); }
    const request = parseCancellationRequest(parsed);
    const admin = dependencies.createAdmin();
    let gestor;
    try { gestor = await (dependencies.authorize ?? requireGestorAtivo)(req, admin); }
    catch (error) {
      const status = authorizationErrorHttpStatus(error instanceof Error ? error.message : '') ?? 503;
      throw new CancellationRequestError(status, 'Não foi possível autorizar o cancelamento. Verifique seu acesso.');
    }
    try { requireGestorTab(gestor, 'financeiro', 'outros-creditos'); }
    catch { throw new CancellationRequestError(403, 'Acesso a Outros Créditos não autorizado.'); }
    if (!['gestor', 'financeiro'].includes(String(gestor.perfil).toLowerCase().trim())) {
      throw new CancellationRequestError(403, 'Perfil sem permissão para cancelar créditos.');
    }
    // This client forwards the verified bearer. SQL binds auth.uid() itself;
    // neither actor IDs supplied by the browser nor impersonation are accepted.
    const user = dependencies.createUser(req.headers.get('Authorization') ?? '');
    const begin = await user.rpc('begin_other_credit_cancellation', {
      p_request_id: request.idempotencyKey, p_receivable_ids: request.receivableIds, p_reason: request.reason,
    });
    if (begin.error || typeof begin.data?.operationId !== 'string' || !UUID_RE.test(begin.data.operationId) ||
      !Array.isArray(begin.data?.receivableIds) ||
      JSON.stringify([...begin.data.receivableIds].sort()) !== JSON.stringify(request.receivableIds)) {
      throw new CancellationRequestError(409, 'Seleção indisponível ou alterada. Confira os créditos e seu acesso ao polo antes de continuar.');
    }
    // Do not attach req.signal: closing the page must not interrupt persistence
    // after a PUT. The bank adapter has its own bounded timeout.
    const result = await (dependencies.process ?? processCancellationBatch)(begin.data.operationId, request.receivableIds, {
      store: createCancellationStore(admin), bank: createCancellationBank(admin),
    });
    return respond(req, result);
  } catch (error) {
    if (error instanceof CancellationRequestError) return respond(req, { error: error.message }, error.status);
    return respond(req, { error: 'Cancelamento não confirmado. Retome a mesma solicitação para consultar o resultado.' }, 503);
  }
};
