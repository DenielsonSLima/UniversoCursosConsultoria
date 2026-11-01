import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import { authorizationErrorHttpStatus, requireGestorAtivo, requireGestorGlobal, requireGestorModule } from '../_shared/authz.ts';
import { buildCorsHeaders, json } from '../_shared/http.ts';
import { migrateProfilePhoto } from './migrate.ts';

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, request);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'Serviço indisponível.' }, 503, request);
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const operationToken = request.headers.get('x-lgpd-operation-token');
    let actorId: string;
    let reason: string;
    let dryRun: boolean;
    if (operationToken !== null) {
      const { data, error } = await admin.rpc('claim_profile_photo_migration_operation', { p_token: operationToken });
      if (error || !data?.actorId || typeof data.dryRun !== 'boolean' || typeof data.reason !== 'string') {
        return json({ error: 'Operação administrativa inválida ou expirada.' }, 403, request);
      }
      actorId = data.actorId;
      reason = data.reason;
      dryRun = data.dryRun;
    } else {
      const gestor = await requireGestorAtivo(request, admin);
      requireGestorGlobal(gestor);
      requireGestorModule(gestor, 'configuracoes');
      const body = await request.json();
      dryRun = body.dryRun !== false;
      if (!dryRun && (body.confirmation !== 'MIGRAR_FOTOS_PESSOAIS'
        || typeof body.reason !== 'string' || body.reason.trim().length < 12)) {
        return json({ error: 'Confirmação e motivo da migração são obrigatórios.' }, 400, request);
      }
      actorId = gestor.id;
      reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    }
    const respond = async (result: Record<string, unknown>) => {
      if (operationToken !== null) {
        const { error } = await admin.rpc('finish_profile_photo_migration_operation', {
          p_operation_id: actorId, p_result: result,
        });
        if (error) return json({ error: 'Não foi possível registrar o resultado administrativo.' }, 503, request);
      }
      return json(result, 200, request);
    };
    const { data: summary, error: summaryError } = await admin.rpc('profile_photo_migration_summary');
    if (summaryError) return json({ error: 'Não foi possível conferir o resumo da migração.' }, 503, request);
    if (dryRun) return await respond({ dryRun: true, ...summary });
    const { data: candidates, error } = await admin.rpc('profile_photo_migration_candidates', { p_limit: 10 });
    if (error) return json({ error: 'Não foi possível conferir a fila da migração.' }, 503, request);
    const rows = Array.isArray(candidates) ? candidates : [];
    const counts = { completed: 0, quarantined: 0, pendingPublicCache: 0, failed: 0 };
    const publicStatuses: Record<string, number> = {};
    // Serialização evita sobrecarga e permite retomada pelo journal persistido.
    for (const row of rows) {
      try {
        const result = await migrateProfilePhoto(admin, url, row.source_path, actorId, reason);
        if (result.completed) counts.completed++;
        if (result.quarantined) counts.quarantined++;
        if (result.pendingPublicCache) counts.pendingPublicCache++;
        if ('publicStatus' in result && typeof result.publicStatus === 'number') {
          const code = String(result.publicStatus);
          publicStatuses[code] = (publicStatuses[code] || 0) + 1;
        }
      } catch { counts.failed++; }
    }
    return await respond({ dryRun: false, examined: rows.length, ...counts, publicStatuses });
  } catch (error) {
    const status = authorizationErrorHttpStatus(error instanceof Error ? error.message : '') || 400;
    return json({ error: 'Migração não autorizada ou solicitação inválida.' }, status, request);
  }
});
