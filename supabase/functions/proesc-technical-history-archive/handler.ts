import type { ArchiveAdmin } from '../proesc-history-archive/worker.ts';
import { ArchiveError } from './codec.ts';
import { drainTechnicalArchive } from './worker.ts';

export const createTechnicalArchiveHandler = (admin: ArchiveAdmin) => async (request: Request) => {
  const deadline = performance.now() + 100000;
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const key = request.headers.get('X-Proesc-Sync-Secret') || '';
  if (!/^[0-9a-f]{64}$/.test(key)) return respond({ error: 'TECHNICAL_ARCHIVE_UNAUTHORIZED' }, 403);
  try {
    const authorization = await admin.rpc('proesc_sync_runtime_service', { p_action: 'authorize', p_payload: { key } });
    if (authorization.error || typeof (authorization.data as { actorId?: unknown } | null)?.actorId !== 'string') {
      return respond({ error: 'TECHNICAL_ARCHIVE_UNAUTHORIZED' }, 403);
    }
    const actorId = (authorization.data as { actorId: string }).actorId;
    const text = await request.text();
    if (text.length > 256) return respond({ error: 'TECHNICAL_ARCHIVE_INVALID_REQUEST' }, 400);
    let body: { limit?: number; maxBatches?: number; verifyRestore?: boolean } = {};
    if (text) {
      try { body = JSON.parse(text); } catch { return respond({ error: 'TECHNICAL_ARCHIVE_INVALID_REQUEST' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some((field) => !['limit', 'maxBatches', 'verifyRestore'].includes(field))
        || (body.limit !== undefined && (!Number.isSafeInteger(body.limit) || body.limit < 1 || body.limit > 25))
        || (body.maxBatches !== undefined && (!Number.isSafeInteger(body.maxBatches) || body.maxBatches < 1 || body.maxBatches > 5))
        || (body.verifyRestore !== undefined && typeof body.verifyRestore !== 'boolean')
        || (body.verifyRestore && (body.limit !== 1 || (body.maxBatches ?? 1) !== 1))) {
        return respond({ error: 'TECHNICAL_ARCHIVE_INVALID_REQUEST' }, 400);
      }
    }
    return respond(await drainTechnicalArchive(admin, body.limit ?? 25, body.maxBatches ?? 1, body.verifyRestore ?? false,
      undefined, body.verifyRestore ? actorId : undefined, deadline));
  } catch (error) {
    return respond({ error: error instanceof ArchiveError ? error.code : 'TECHNICAL_ARCHIVE_UNAVAILABLE' }, 409);
  }
};
