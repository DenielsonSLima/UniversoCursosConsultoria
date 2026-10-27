import { cancelCorrectionItem, CorrectionBlocked, type CorrectionBank } from './processor.ts';
import { parseRequest } from './request.ts';
import { createCorrectionStore, type RpcClient } from './store.ts';

type Dependencies = {
  createAdmin: (url: string, key: string) => RpcClient;
  getEnv: (name: string) => string | undefined;
  createBank?: (admin: RpcClient, signal: AbortSignal) => CorrectionBank;
};
const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
);
const safeEqual = (a: string, b: string) => {
  const encoder = new TextEncoder(); const left = encoder.encode(a); const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
};
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CorrectionBlocked('INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > 1024) { await reader.cancel(); throw new CorrectionBlocked('INVALID_REQUEST'); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(joined)); }
  catch { throw new CorrectionBlocked('INVALID_REQUEST'); }
}

/** Separate authenticated boundary: never calls an issuance or global queue API. */
export const createHandler = (dependencies: Dependencies) => async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = dependencies.getEnv('SUPABASE_URL');
  const key = dependencies.getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({ error: 'CONFIGURATION_UNAVAILABLE' }, 503);
  let admin: RpcClient;
  try { admin = dependencies.createAdmin(url, key); }
  catch { return json({ error: 'CONFIGURATION_UNAVAILABLE' }, 503); }
  // Existing secret remains inside the service boundary; never returned or logged.
  let expected: unknown;
  try {
    const result = await admin.rpc('get_banese_reconciliation_worker_secret', {});
    if (result.error) return json({ error: 'CONFIGURATION_UNAVAILABLE' }, 503);
    expected = result.data;
  } catch { return json({ error: 'CONFIGURATION_UNAVAILABLE' }, 503); }
  if (typeof expected !== 'string' || expected.trim().length < 32) {
    return json({ error: 'CONFIGURATION_UNAVAILABLE' }, 503);
  }
  const supplied = request.headers.get('X-Banese-Worker-Token')?.trim() ?? '';
  if (!safeEqual(supplied, expected.trim())) return json({ error: 'UNAUTHORIZED' }, 401);
  let input: ReturnType<typeof parseRequest>;
  try { input = parseRequest(await readBody(request)); }
  catch { return json({ error: 'INVALID_REQUEST' }, 400); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const result = await cancelCorrectionItem(input, {
      store: createCorrectionStore(admin),
      bank: dependencies.createBank?.(admin, controller.signal) ??
        (await import('./bank.ts')).createCorrectionBank({ rpc: async (name, args) => await admin.rpc(name, args ?? {}) }, controller.signal),
    });
    return json({ success: true, operationId: input.operationId,
      receivableId: input.receivableId, ...result, reissued: false, academicChanged: false });
  } catch (error) {
    // Only our enumerated local error codes are exposed, never provider/SQL text.
    return json({ success: false,
      error: error instanceof CorrectionBlocked ? error.code : 'CANCELLATION_REVIEW_REQUIRED',
      reissued: false, academicChanged: false }, 409);
  } finally { clearTimeout(timer); }
};
