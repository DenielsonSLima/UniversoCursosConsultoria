import {
  authorizationErrorHttpStatus, requireGestorAtivo, requireGestorGlobal, requireGestorModule,
} from '../_shared/authz.ts';
import { buildCorsHeaders, isRateLimitExceeded, json } from '../_shared/http.ts';
import { object, ProescError } from './contract.ts';
import { testProescV1Token } from './test-token.ts';
import { connectionActions, handleConnectionAction } from './connections.ts';
import { connectionToken } from './connection-contract.ts';
import { runProescSync } from './sync-worker.ts';
import { runProescReadOnlyDiagnostic } from './diagnostic-readonly.ts';
import { reviewProescCycles } from './cycle-review.ts';
import { reviewProescClassCycles, runProescCycleReviewWorker } from './cycle-review-batch.ts';

type Admin = Parameters<typeof requireGestorAtivo>[1];
const publicActions = new Set(['status', 'save_token', 'remove_token', 'class_history', 'class_events', 'test_token']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Testes de conexão nunca importam dados nem alteram cobranças.
export const createHandler = (admin: Admin, transport: typeof fetch = fetch) => async (req: Request) => {
  const respond = (body: unknown, status = 200) => {
    const response = json(body, status, req);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);
  try {
    const text = await req.text();
    if (text.length > 12000) throw new ProescError('Solicitação muito grande.');
    let body;
    try { body = object(JSON.parse(text)); } catch { throw new ProescError('Solicitação inválida.'); }
    const action = typeof body.action === 'string' ? body.action : '';
    let actorId: string;
    if (action === 'internal_sync') {
      const key = req.headers.get('X-Proesc-Sync-Secret') || '';
      if (!/^[0-9a-f]{64}$/.test(key)) throw new ProescError('Acesso interno não autorizado.', 403);
      const { data, error } = await admin.rpc('proesc_sync_runtime_service', {
        p_action: 'authorize', p_payload: { key },
      });
      if (error || typeof data?.actorId !== 'string') throw new ProescError('Acesso interno não autorizado.', 403);
      const [sync, cycleReview] = await Promise.allSettled([
        runProescSync(admin, data.actorId, transport),
        runProescCycleReviewWorker(admin, data.actorId, transport),
      ]);
      if (sync.status === 'rejected') throw new ProescError('Não foi possível concluir a atualização Proesc.', 409);
      return respond({ ...sync.value, cycleReview: cycleReview.status === 'fulfilled'
        ? cycleReview.value : { success: false, message: 'A consulta automática será retomada.' } });
    } else if (action === 'internal_probe' || action === 'internal_accounting_probe' || action === 'internal_data_probe') {
      const key = req.headers.get('X-Proesc-Worker-Secret') || '';
      if (!/^[0-9a-f]{64}$/.test(key)) throw new ProescError('Acesso interno não autorizado.', 403);
      const { data, error } = await admin.rpc('proesc_internal_probe_service', {
        p_action: 'authorize', p_payload: { key },
      });
      if (error || typeof data?.actorId !== 'string') throw new ProescError('Acesso interno não autorizado.', 403);
      actorId = data.actorId;
    } else {
      const gestor = await requireGestorAtivo(req, admin);
      if (action === 'review_class_cycles') {
        if (typeof body.turmaId !== 'string' || !uuidPattern.test(body.turmaId)) throw new ProescError('Turma inválida.');
        if (isRateLimitExceeded(`proesc-class-cycle-review:${gestor.id}`, 8, 60000)) {
          return respond({ error: 'A atualização automática está em andamento. Aguarde alguns instantes.' }, 429);
        }
        return respond(await reviewProescClassCycles(admin, gestor.id, body.turmaId, transport));
      }
      if (action === 'review_cycles') {
        // The service reuses can_operate_turma_academics + gestor_has_tab for
        // this exact enrollment, including the actor's current polo scope.
        if (isRateLimitExceeded(`proesc-cycle-review:${gestor.id}`, 12, 60000)) {
          return respond({ error: 'Muitas conferências. Aguarde um minuto e retome.' }, 429);
        }
        return respond(await reviewProescCycles(admin, gestor.id, body.matriculaId, transport));
      }
      requireGestorGlobal(gestor);
      requireGestorModule(gestor, 'configuracoes');
      if (!publicActions.has(action) && !connectionActions.has(action)) throw new ProescError('Ação não permitida neste painel.', 403);
      actorId = gestor.id;
    }
    if (isRateLimitExceeded(`proesc:${actorId}`, 100, 60000)) {
      return respond({ error: 'Muitas consultas. Aguarde um minuto e retome.' }, 429);
    }
    if (connectionActions.has(action)) {
      if (action === 'test_connection' && isRateLimitExceeded(`proesc-test:${actorId}`, 5, 60000)) {
        throw new ProescError('Aguarde um minuto antes de testar novamente.', 429);
      }
      return respond(await handleConnectionAction(admin, actorId, body, transport));
    }
    if (action === 'internal_data_probe') {
      if (isRateLimitExceeded(`proesc-test:${actorId}`, 5, 60000)) {
        throw new ProescError('Aguarde um minuto antes de testar novamente.', 429);
      }
      return respond(await handleConnectionAction(admin, actorId,
        { action: 'test_connection', version: 'v2' }, transport));
    }
    if (action === 'internal_accounting_probe') {
      if (isRateLimitExceeded(`proesc-accounting-probe:${actorId}`, 5, 60000)) {
        throw new ProescError('Aguarde um minuto antes de consultar novamente.', 429);
      }
      return respond(await runProescReadOnlyDiagnostic(admin, actorId, body, transport));
    }
    const rpc = async (name: string, action: string, payload: unknown = {}) => {
      const { data, error } = await admin.rpc(name, {
        p_action: action, p_actor_id: actorId, p_payload: payload,
      });
      // Erros de banco nunca retornam argumentos ou conteúdo de credenciais.
      if (error) throw new ProescError('Não foi possível concluir a operação. Atualize a tela e tente novamente.', 409);
      return data;
    };
    if (action === 'test_token' || action === 'internal_probe') {
      if (isRateLimitExceeded(`proesc-test:${actorId}`, 5, 60000)) throw new ProescError('Aguarde um minuto antes de testar novamente.', 429);
      const credential = object(await rpc('proesc_workspace_service', 'token'));
      if (typeof credential.token !== 'string' || !credential.token) throw new ProescError('Cadastre o token antes de testar.');
      const result = await testProescV1Token(credential.token, transport);
      const current = object(await rpc('proesc_workspace_service', 'token'));
      if (current.revision !== credential.revision) throw new ProescError('O token foi alterado durante o teste. Teste novamente.', 409);
      return respond(result);
    }
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
      const token = connectionToken('v1', body.token);
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
    return respond({ error: status ? 'Acesso restrito ao gestor autorizado.'
      : 'Falha ao consultar a integração Proesc. Tente novamente.' }, status || 500);
  }
};
