import { runV2CopyBatch } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-worker.mjs';
import { restoreV2Copy } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-transfer.mjs';
import { createMemoryRestoreStore } from './memory-restore.mjs';
import { validBatchId } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-codec.mjs';

export const COPY_PROJECT_REF = 'kfekgwyqozhicpfuunpo';
const error = (code, status) => Object.assign(new Error(code), { code, status });
const respond = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
async function readBody(request, signal) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 256)) throw error('BODY_LIMIT', 413);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || request.headers.has('content-encoding')) throw error('JSON_REQUIRED', 415);
  if (!request.body) throw error('INVALID_REQUEST', 400);
  const reader = request.body.getReader(), chunks = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let lengthRead = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > 256) throw error('BODY_LIMIT', 413);
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(lengthRead); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw error('INVALID_REQUEST', 400); }
    // Exact one-key JSON grammar also rejects duplicate keys and alternate selectors.
    const match = /^\s*\{\s*"batchId"\s*:\s*"([a-f0-9-]+)"\s*\}\s*$/.exec(text);
    if (!match || !validBatchId(match[1])) throw error('INVALID_REQUEST', 400);
    return match[1];
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}
function exportedTenant(source, batchId) {
  // The complete codec validates all fields before uploading. This guard runs before adapter construction.
  if (!source || source.batchId !== batchId || source.format !== 'proesc-v2-copy-v1'
    || source.projectRef !== COPY_PROJECT_REF || source.bucket !== 'proesc-history'
    || source.namespace !== 'proesc-v2-copy' || typeof source.tenantId !== 'string'
    || !/^[1-9][0-9]{0,17}$/.test(source.tenantId)) throw error('EXPORT_UNCONFIRMED', 409);
  return source.tenantId;
}
export function createV2CopyHandler(options = {}) {
  const { enabled = false, deadlineMs = 80_000, authorize, exportBatch, recordReceipt, createRemote } = options;
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(deadlineMs) || deadlineMs < 10 || deadlineMs > 80_000
    || enabled && [authorize, exportBatch, recordReceipt, createRemote].some((fn) => typeof fn !== 'function')) {
    throw error('HANDLER_CONFIGURATION', 500);
  }
  return async function handle(request) {
    if (request.method !== 'POST') return respond({ status: 'METHOD_NOT_ALLOWED' }, 405);
    if (!enabled) return respond({ status: 'COPY_DISABLED' }, 503);
    const key = request.headers.get('X-Proesc-Sync-Secret') ?? '';
    if (!/^[a-f0-9]{64}$/.test(key)) return respond({ status: 'UNAUTHORIZED' }, 403);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    let timer, stop;
    const interruption = new Promise((_, reject) => {
      stop = () => reject(error('COPY_UNCONFIRMED', 504));
      controller.signal.addEventListener('abort', stop, { once: true });
      timer = setTimeout(abort, deadlineMs);
      if (controller.signal.aborted) stop();
    });
    const operation = async () => {
      const signal = controller.signal;
      signal.throwIfAborted();
      let authorized;
      try { authorized = await authorize(key, { signal }); }
      catch { throw error('UNAUTHORIZED', 403); }
      signal.throwIfAborted();
      if (authorized !== true) throw error('UNAUTHORIZED', 403);
      const batchId = await readBody(request, signal);
      signal.throwIfAborted();
      const source = await exportBatch(batchId, { signal });
      signal.throwIfAborted();
      const tenantId = exportedTenant(source, batchId);
      const remote = createRemote(tenantId, { signal });
      let restoreVerified = false;
      const result = await runV2CopyBatch(batchId, {
        remote, exportBatch: async () => { signal.throwIfAborted(); return source; },
        recordReceipt: async (batch, receipt, { signal: rpcSignal }) => {
          signal.throwIfAborted();
          const restored = await restoreV2Copy(remote, receipt, createMemoryRestoreStore(), 'restored.json');
          signal.throwIfAborted();
          rpcSignal.throwIfAborted();
          if (restored.batchId !== batch || restored.payloadSha256 !== receipt.payloadSha256
            || restored.rawBytes !== receipt.rawBytes || restored.rowCount !== receipt.rowCount) {
            throw error('RESTORE_UNCONFIRMED', 409);
          }
          restoreVerified = true;
          return recordReceipt(batch, receipt, { signal: AbortSignal.any([signal, rpcSignal]) });
        },
      });
      signal.throwIfAborted();
      if (!restoreVerified) throw error('RESTORE_UNCONFIRMED', 409);
      return respond({ status: result.catalog.status, receipt: result.receipt, restoreVerified: true });
    };
    try { return await Promise.race([operation(), interruption]); }
    catch (failure) {
      if (controller.signal.aborted) return respond({ status: 'COPY_UNCONFIRMED' }, 504);
      const allowed = new Set(['UNAUTHORIZED', 'BODY_LIMIT', 'JSON_REQUIRED', 'INVALID_REQUEST']);
      return allowed.has(failure?.code) ? respond({ status: failure.code }, failure.status)
        : respond({ status: 'COPY_UNCONFIRMED' }, 409);
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', stop);
      controller.abort(); // No later continuation may start a request after the handler returns.
    }
  };
}
