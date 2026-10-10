import { fail, validBatchId, strictSnapshot } from './v2-copy-codec.mjs';
import { publishV2Copy, snapshotCopyRemote } from './v2-copy-transfer.mjs';

async function boundedRpc(invoke, milliseconds, code) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(fail(code)); }, milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => invoke(controller.signal)), deadline]);
  } catch { throw fail(code); }
  finally { clearTimeout(timer); }
}
// Trusted backend wiring only. A caller supplies one already-approved batch ID, never a free-form selection.
export async function runV2CopyBatch(batchId, dependencies) {
  if (!validBatchId(batchId)) throw fail('INVALID_BATCH_ID');
  const { remote: inputRemote, exportBatch, recordReceipt, rpcTimeoutMs = 15_000 } = dependencies ?? {};
  if (typeof exportBatch !== 'function' || typeof recordReceipt !== 'function'
    || !Number.isSafeInteger(rpcTimeoutMs) || rpcTimeoutMs < 10 || rpcTimeoutMs > 60_000) throw fail('WORKER_CONFIGURATION');
  const remote = snapshotCopyRemote(inputRemote);
  const exported = await boundedRpc((signal) => exportBatch(batchId, { signal }), rpcTimeoutMs, 'EXPORT_UNCONFIRMED');
  const receipt = await publishV2Copy(exported, remote, batchId);
  const result = await boundedRpc((signal) => recordReceipt(batchId, receipt, { signal }), rpcTimeoutMs, 'CATALOG_UNCONFIRMED');
  let catalog;
  try { catalog = strictSnapshot(result, ['batchId', 'status', 'copyOnly']); }
  catch { throw fail('CATALOG_UNCONFIRMED'); }
  if (catalog.batchId !== batchId || catalog.status !== 'COPY_RECEIPT_RECORDED' || catalog.copyOnly !== true) {
    throw fail('CATALOG_UNCONFIRMED');
  }
  return Object.freeze({ receipt, catalog: Object.freeze(catalog) });
}
