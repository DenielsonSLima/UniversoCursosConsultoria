import { createSupabasePrivateStore } from '../../review-drafts/proesc-v2-growth/archive/supabase-store.mjs';
import { validBatchId, strictSnapshot } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-codec.mjs';
import { COPY_PROJECT_REF } from './handler.mjs';

const ORIGIN = `https://${COPY_PROJECT_REF}.supabase.co`;
const RPC_NAMES = new Set(['proesc_v2_worker_service', 'proesc_v2_export_copy_service', 'proesc_v2_record_copy_receipt_service']);
const fail = () => new Error('COPY_BACKEND_UNCONFIRMED');
async function rpcResponse(response, signal) {
  if (!response.body) throw fail();
  const reader = response.body.getReader(), chunks = []; let total = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4 * 1024 * 1024) throw fail();
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { status: response.status, headers: response.headers });
  } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
}
export function createV2CopySdkBridge(input) {
  const { createClient, fetchImpl, serverUrl, serviceRoleKey } = strictSnapshot(input,
    ['createClient', 'fetchImpl', 'serverUrl', 'serviceRoleKey']);
  if (typeof createClient !== 'function' || typeof fetchImpl !== 'function'
    || ![ORIGIN, `${ORIGIN}/`].includes(serverUrl)
    || typeof serviceRoleKey !== 'string' || !serviceRoleKey || serviceRoleKey.length > 16_384
    || /[\s\x00-\x1f\x7f]/.test(serviceRoleKey)) throw fail();
  async function guardedFetch(inputUrl, init = {}, outerSignal, tenantId) {
    const url = new URL(inputUrl instanceof Request ? inputUrl.url : inputUrl);
    const method = init.method ?? (inputUrl instanceof Request ? inputUrl.method : 'GET');
    const requestSignal = init.signal ?? (inputUrl instanceof Request ? inputUrl.signal : undefined);
    const signals = [requestSignal, outerSignal].filter(Boolean);
    if (!signals.length) throw fail();
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);
    signal.throwIfAborted();
    const rpc = url.pathname.startsWith('/rest/v1/rpc/');
    const storage = url.pathname.startsWith('/storage/v1/');
    const prefix = `/storage/v1/object/proesc-history/proesc-v2-copy/${tenantId}/`;
    const bucketRead = url.pathname === '/storage/v1/bucket/proesc-history' && method === 'GET';
    const objectAccess = url.pathname.startsWith(prefix) && ['GET', 'POST'].includes(method)
      && /^[a-f0-9-]{36}\.[a-f0-9]{64}\.(jsonl\.gz|manifest\.json\.gz)$/.test(url.pathname.slice(prefix.length));
    if (url.origin !== ORIGIN || url.search || url.hash || url.username || url.password
      || rpc && (method !== 'POST' || !RPC_NAMES.has(url.pathname.slice('/rest/v1/rpc/'.length)))
      || rpc && tenantId !== undefined || storage && (tenantId === undefined || !bucketRead && !objectAccess)
      || !rpc && !storage) throw fail();
    const response = await fetchImpl(inputUrl, { ...init, redirect: 'error', cache: 'no-store', signal });
    signal.throwIfAborted();
    if (!(response instanceof Response) || response.redirected || response.status >= 300 && response.status < 400
      || response.url && response.url !== url.href) {
      void response?.body?.cancel().catch(() => {}); throw fail();
    }
    return rpc ? rpcResponse(response, signal) : response;
  }
  const admin = createClient(ORIGIN, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => guardedFetch(url, init) },
  });
  async function rpc(name, args, { signal }) {
    signal.throwIfAborted();
    const result = await admin.rpc(name, args).abortSignal(signal);
    signal.throwIfAborted();
    if (!result || result.error || result.data == null) throw fail();
    return result.data;
  }
  return Object.freeze({
    authorize: async (key, options) => {
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return false;
      const data = await rpc('proesc_v2_worker_service', { p_action: 'authorize', p_payload: { key } }, options);
      return validBatchId(data?.actorId);
    },
    exportBatch: (batchId, options) => {
      if (!validBatchId(batchId)) throw fail();
      return rpc('proesc_v2_export_copy_service', { p_batch: batchId }, options);
    },
    recordReceipt: (batchId, receipt, options) => {
      if (!validBatchId(batchId)) throw fail();
      return rpc('proesc_v2_record_copy_receipt_service', { p_batch: batchId, p_receipt: receipt }, options);
    },
    createRemote: (tenantId, { signal }) => {
      signal.throwIfAborted();
      if (typeof tenantId !== 'string' || !/^[1-9][0-9]{0,17}$/.test(tenantId)) throw fail();
      return createSupabasePrivateStore({ projectRef: COPY_PROJECT_REF, bucket: 'proesc-history',
        namespace: 'proesc-v2-copy', tenantId, maxObjectBytes: 4194304, enabled: true }, {
        transport: (url, init) => guardedFetch(url, init, signal, tenantId),
        credentials: async () => { signal.throwIfAborted(); return { apiKey: serviceRoleKey, accessToken: serviceRoleKey }; },
      });
    },
  });
}
