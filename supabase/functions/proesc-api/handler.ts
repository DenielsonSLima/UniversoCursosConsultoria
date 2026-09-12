import {
  authorizationErrorHttpStatus, requireGestorAtivo, requireGestorGlobal, requireGestorModule,
} from '../_shared/authz.ts';
import { buildCorsHeaders, isRateLimitExceeded, json } from '../_shared/http.ts';
import { object, ProescError, queryProesc, validateConsultation } from './contract.ts';
import type { Cursor, Filters, Resource } from './contract.ts';

type Admin = Parameters<typeof requireGestorAtivo>[1];
export const createHandler = (admin: Admin, transport: typeof fetch = fetch) => async (req: Request) => {
  const respond = (body: unknown, status = 200) => {
    const response = json(body, status, req);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);
  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireGestorGlobal(gestor);
    requireGestorModule(gestor, 'configuracoes');
    if (isRateLimitExceeded(`proesc:${gestor.id}`, 100, 60000)) {
      return respond({ error: 'Muitas consultas. Aguarde um minuto e retome.' }, 429);
    }
    const text = await req.text();
    if (text.length > 12000) throw new ProescError('Solicitação muito grande.');
    let body;
    try { body = object(JSON.parse(text)); } catch { throw new ProescError('Solicitação inválida.'); }
    const rpc = async (action: string, payload: unknown = {}) => {
      const { data, error } = await admin.rpc('proesc_workspace_service', {
        p_action: action, p_actor_id: gestor.id, p_payload: payload,
      });
      // Erros de banco nunca retornam argumentos ou conteúdo de credenciais.
      if (error) throw new ProescError('Não foi possível concluir a operação. Atualize a tela e tente novamente.', 409);
      return data;
    };
    const action = String(body.action || '');
    if (action === 'status') {
      const offset = body.offset ?? 0;
      if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 100000) throw new ProescError('Página de consultas inválida.');
      return respond(await rpc(action, { offset }));
    }
    if (action === 'history_t42' || action === 'remove_token') {
      return respond(await rpc(action));
    }
    if (action === 'save_token') {
      const token = String(body.token || '').trim().replace(/^Bearer\s+/i, '');
      if (token.length < 12 || token.length > 8192 || /\s/.test(token)) throw new ProescError('Informe um token Proesc válido.');
      return respond(await rpc(action, { token }));
    }
    if (action === 'start') return respond(await rpc(action, validateConsultation(body)));
    if (action === 'test') {
      const secret = await rpc('token');
      const filters = { unitId: '', start: '2025-01', end: '2025-01' };
      await queryProesc(secret.token, 'people', filters, { year: 2025, month: 1, page: 1 }, transport);
      return respond({ ok: true, message: 'Acesso a pessoas confirmado. Consulte as cobranças para validar a permissão financeira.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(body.id || ''))) throw new ProescError('Consulta inválida.');
    if (action === 'page') {
      if (!Number.isInteger(body.position) || Number(body.position) < 1) throw new ProescError('Página inválida.');
      return respond(await rpc(action, { id: body.id, position: body.position }));
    }
    if (action === 'advance') {
      const run = await rpc('context', { id: body.id });
      if (run.status === 'complete') {
        const { revision: _revision, created_by: _actor, ...safeRun } = run;
        return respond(safeRun);
      }
      const secret = await rpc('token');
      if (secret.revision !== run.revision) throw new ProescError('Token alterado. Inicie uma nova consulta.', 409);
      const page = await queryProesc(secret.token, run.resource as Resource,
        run.filters as Filters, run.cursor as Cursor, transport);
      return respond(await rpc('commit_page', {
        id: run.id, revision: run.revision, expectedPages: run.pages,
        cursor: run.cursor, result: page, nextCursor: page.nextCursor,
      }));
    }
    throw new ProescError('Ação não permitida.');
  } catch (error) {
    if (error instanceof ProescError) return respond({ error: error.message }, error.status);
    const status = authorizationErrorHttpStatus(error instanceof Error ? error.message : '');
    return respond({ error: status ? 'Acesso restrito ao gestor global autorizado em Configurações.'
      : 'Falha ao consultar a integração Proesc. Tente novamente.' }, status || 500);
  }
};
