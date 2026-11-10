import type { PreflightIntent, PreflightMaterial, PreflightScope } from './types.ts';
import { runPreflight } from './probe.ts';

interface Dependencies {
  identity(req: Request): Promise<string>;
  material(actorId: string, scope: PreflightScope): Promise<PreflightMaterial>;
  probe(material: PreflightMaterial, options: { intent: PreflightIntent }): ReturnType<typeof runPreflight>;
  rateLimited(req: Request): boolean;
  respond(req: Request, body: unknown, status: number): Response;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === 'object' && !Array.isArray(value);

async function readIntent(req: Request): Promise<PreflightIntent> {
  if (!/^application\/json(?:;|$)/i.test(req.headers.get('content-type') || '') || !req.body
    || Number(req.headers.get('content-length')) > 2048) throw new Error('INVALID_PREFLIGHT_INPUT');
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 2048) throw new Error('INVALID_PREFLIGHT_INPUT');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new globalThis.TextDecoder().decode(bytes)); }
  finally { bytes.fill(0); }
  if (!object(body) || Object.keys(body).some((key) => !['scope', 'referenceDate', 'serviceCode'].includes(key))
    || !object(body.scope) || Object.keys(body.scope).some((key) => !['contextKey', 'poloId', 'environment', 'month'].includes(key))) {
    throw new Error('INVALID_PREFLIGHT_INPUT');
  }
  const scope = body.scope;
  if (![scope.contextKey, scope.poloId].every((value) => typeof value === 'string' && uuid.test(value))
    || scope.environment !== 'HOMOLOGACAO' || typeof scope.month !== 'string'
    || !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(scope.month)) throw new Error('INVALID_PREFLIGHT_INPUT');
  const date = body.referenceDate || `${scope.month}-01`;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
    || (body.serviceCode !== undefined && (typeof body.serviceCode !== 'string' || !/^\d{6}$/.test(body.serviceCode)))) {
    throw new Error('INVALID_PREFLIGHT_INPUT');
  }
  return { scope: scope as unknown as PreflightScope, referenceDate: date,
    ...(body.serviceCode ? { serviceCode: body.serviceCode as string } : {}) };
}

export function createPreflightHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method !== 'POST') return deps.respond(req, { error: 'METHOD_NOT_ALLOWED' }, 405);
    if (deps.rateLimited(req)) return deps.respond(req, { error: 'RATE_LIMITED' }, 429);
    try {
      const actorId = await deps.identity(req);
      const intent = await readIntent(req);
      const material = await deps.material(actorId, intent.scope);
      if (material.actorId !== actorId || Object.entries(intent.scope).some(([key, value]) =>
        material[key as keyof PreflightScope] !== value)) throw new Error('PREFLIGHT_SCOPE_DENIED');
      const data = await deps.probe(material, { intent });
      return deps.respond(req, { version: 1, scope: intent.scope, data }, 200);
    } catch (error) {
      const invalid = error instanceof Error && error.message === 'INVALID_PREFLIGHT_INPUT';
      return deps.respond(req, { error: invalid ? 'INVALID_PREFLIGHT_INPUT' : 'PREFLIGHT_NOT_AUTHORIZED_OR_UNAVAILABLE' }, invalid ? 400 : 403);
    }
  };
}
