import {
  authorizationErrorHttpStatus, requireGestorAtivo, requireGestorGlobal, requireGestorModule,
} from '../_shared/authz.ts';
import { buildCorsHeaders, isRateLimitExceeded, json } from '../_shared/http.ts';
import { object, ProescError } from './contract.ts';

type Admin = Parameters<typeof requireGestorAtivo>[1];
const publicActions = new Set(['status', 'save_token', 'remove_token', 'class_history', 'class_events']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O transporte opcional mantém compatibilidade de testes; este handler nunca consulta o Proesc.
export const createHandler = (admin: Admin, _transport?: typeof fetch) => async (req: Request) => {
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
    const action = typeof body.action === 'string' ? body.action : '';
    if (!publicActions.has(action)) throw new ProescError('Ação não permitida neste painel.', 403);
    const rpc = async (name: string, action: string, payload: unknown = {}) => {
      const { data, error } = await admin.rpc(name, {
        p_action: action, p_actor_id: gestor.id, p_payload: payload,
      });
      // Erros de banco nunca retornam argumentos ou conteúdo de credenciais.
      if (error) throw new ProescError('Não foi possível concluir a operação. Atualize a tela e tente novamente.', 409);
      return data;
    };
    if (action === 'status') {
      const result = object(await rpc('proesc_workspace_service', action));
      return respond({ configured: result.configured === true,
        updatedAt: typeof result.updatedAt === 'string' ? result.updatedAt : null });
    }
    if (action === 'remove_token') {
      await rpc('proesc_workspace_service', action);
      return respond({ configured: false });
    }
    if (action === 'save_token') {
      const token = String(body.token || '').trim().replace(/^Bearer\s+/i, '');
      if (token.length < 12 || token.length > 8192 || (/\s/.test(token) || [...token].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new ProescError('Informe um token Proesc válido.');
      await rpc('proesc_workspace_service', action, { token });
      return respond({ configured: true });
    }
    const offset = body.offset ?? 0;
    if (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 100000) throw new ProescError('Página de histórico inválida.');
    if (action === 'class_history') {
      return respond(await rpc('proesc_class_history_service', 'list', { offset }));
    }
    if (typeof body.classId !== 'string' || !uuidPattern.test(body.classId)) throw new ProescError('Turma inválida.');
    return respond(await rpc('proesc_class_history_service', 'events', { classId: body.classId, offset }));
  } catch (error) {
    if (error instanceof ProescError) return respond({ error: error.message }, error.status);
    const status = authorizationErrorHttpStatus(error instanceof Error ? error.message : '');
    return respond({ error: status ? 'Acesso restrito ao gestor global autorizado em Configurações.'
      : 'Falha ao consultar a integração Proesc. Tente novamente.' }, status || 500);
  }
};
