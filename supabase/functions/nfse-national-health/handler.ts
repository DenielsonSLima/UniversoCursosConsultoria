import type { HealthObservation, HealthScope } from './probe.ts';

interface Dependencies {
  authorize(request: Request, scope: HealthScope): Promise<string>;
  probe(scope: HealthScope, actor: string): Promise<HealthObservation>;
  respond(request: Request, body: unknown, status: number): Response;
  rateLimited(request: Request): boolean;
  now?: () => number;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

async function readScope(request: Request): Promise<HealthScope> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '') || !request.body
    || Number(request.headers.get('content-length')) > 1024) throw new Error('INVALID_INPUT');
  const reader = request.body.getReader(); const bytes: number[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      if (bytes.length + value.length > 1024) throw new Error('INVALID_INPUT');
      bytes.push(...value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const data = JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
  if (!object(data) || Object.keys(data).length !== 1 || !object(data.scope)) throw new Error('INVALID_INPUT');
  const scope = data.scope;
  if (Object.keys(scope).length !== 4 || Object.keys(scope).some(key => !['contextKey', 'poloId', 'environment', 'month'].includes(key))
    || typeof scope.contextKey !== 'string' || !uuid.test(scope.contextKey) || typeof scope.poloId !== 'string' || !uuid.test(scope.poloId)
    || scope.environment !== 'PRODUCAO' || typeof scope.month !== 'string'
    || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(scope.month)) throw new Error('INVALID_INPUT');
  return scope as unknown as HealthScope;
}

/** Cache only sanitized observations; reauthorize every hit and coalesce concurrent probes. */
export function createHealthHandler(deps: Dependencies) {
  const cache = new Map<string, { expires: number; pending: Promise<HealthObservation> }>();
  const now = deps.now || Date.now;
  return async (request: Request) => {
    if (request.method !== 'POST') return deps.respond(request, { error: 'METHOD_NOT_ALLOWED' }, 405);
    if (deps.rateLimited(request)) return deps.respond(request, { error: 'RATE_LIMITED' }, 429);
    let scope: HealthScope;
    try { scope = await readScope(request); }
    catch { return deps.respond(request, { error: 'INVALID_INPUT' }, 400); }
    let actor: string;
    try { actor = await deps.authorize(request, scope); if (!uuid.test(actor)) throw new Error(); }
    catch { return deps.respond(request, { error: 'NOT_AUTHORIZED' }, 403); }
    const key = JSON.stringify([actor.toLowerCase(), scope.contextKey.toLowerCase(), scope.poloId.toLowerCase(), scope.environment, scope.month]);
    let item = cache.get(key);
    if (!item || item.expires <= now()) {
      for (const [entry, value] of cache) if (value.expires <= now()) cache.delete(entry);
      if (cache.size >= 200) return deps.respond(request, { error: 'RATE_LIMITED' }, 429);
      item = { expires: now() + 120_000, pending: deps.probe(scope, actor) };
      cache.set(key, item);
    }
    try {
      const data = await item.pending;
      item.expires = Date.parse(data.expiresAt);
      return deps.respond(request, { version: 1, scope, data }, 200);
    } catch {
      cache.delete(key);
      return deps.respond(request, { error: 'VERIFICATION_UNCONFIRMED' }, 503);
    }
  };
}
