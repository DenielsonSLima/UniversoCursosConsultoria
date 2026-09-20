import { ArchiveError } from './codec.ts';
import type { ArchiveAdmin } from './worker.ts';
import { runArchiveDrain } from './drain.ts';

// The existing SQL authorizer compares the dedicated Vault secret in constant time.
// User/anon JWTs cannot authorize this maintenance worker.
export const createArchiveHandler = (admin: ArchiveAdmin) => async (request: Request) => {
  const respond = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store' },
  });
  if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const key = request.headers.get('X-Proesc-Sync-Secret') || '';
  if (!/^[0-9a-f]{64}$/.test(key)) return respond({ error: 'ARCHIVE_UNAUTHORIZED' }, 403);
  try {
    const authorization = await admin.rpc('proesc_sync_runtime_service', {
      p_action: 'authorize', p_payload: { key },
    });
    if (authorization.error || typeof (authorization.data as { actorId?: unknown } | null)?.actorId !== 'string') {
      return respond({ error: 'ARCHIVE_UNAUTHORIZED' }, 403);
    }
    const text = await request.text();
    if (text.length > 256) return respond({ error: 'ARCHIVE_INVALID_REQUEST' }, 400);
    let body: { limit?: number; verifyRestore?: boolean; maxBatches?: number } = {};
    if (text) {
      try { body = JSON.parse(text); } catch { return respond({ error: 'ARCHIVE_INVALID_REQUEST' }, 400); }
      if (!body || Array.isArray(body) || typeof body !== 'object'
        || Object.keys(body).some((key) => key !== 'limit' && key !== 'verifyRestore' && key !== 'maxBatches')
        || (body.verifyRestore !== undefined && typeof body.verifyRestore !== 'boolean')
        || (body.maxBatches !== undefined && (!Number.isSafeInteger(body.maxBatches) || body.maxBatches < 1 || body.maxBatches > 10))
        || (body.verifyRestore && (body.limit !== 1 || (body.maxBatches ?? 1) !== 1))) {
        return respond({ error: 'ARCHIVE_INVALID_REQUEST' }, 400);
      }
    }
    const result = await runArchiveDrain(admin, body.limit ?? 500, body.maxBatches ?? 1, body.verifyRestore ?? false);
    return respond(result, 'lastStatus' in result && result.lastStatus === 'FAILED' ? 409 : 200);
  } catch (error) {
    // Never forward SQL errors, request arguments, financial payloads or credentials.
    return respond({ error: error instanceof ArchiveError ? error.code : 'ARCHIVE_UNAVAILABLE' }, 409);
  }
};
