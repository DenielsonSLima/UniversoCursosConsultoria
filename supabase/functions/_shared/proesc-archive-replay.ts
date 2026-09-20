import { MAX_ARCHIVE_BYTES, verifyArchive } from '../proesc-history-archive/codec.ts';

type RpcResult = { data: unknown; error: unknown };
type RpcRequest = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
export type ArchiveReplayAdmin = {
  rpc(name: string, args: Record<string, unknown>): RpcRequest;
  storage?: { from(bucket: string): {
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  } };
};
type Manifest = {
  batchId: string; requestId: string; bucket: string; objectPath: string;
  payloadSha256: string; compressedSha256: string; rowCount: number; formatVersion: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const financialRpc = new Set([
  'proesc_record_financial_snapshot_service', 'proesc_apply_financial_snapshot_service',
  'proesc_link_obligation_service', 'proesc_import_original_obligation_service',
  'proesc_import_residual_obligation_service', 'proesc_finalize_enrollment_financial_service',
]);
const unavailable = (): RpcResult => ({ data: null, error: {
  code: 'PZ002', message: 'PROESC_RECEIPT_ARCHIVE_UNAVAILABLE',
} });

function bounded<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      Promise.resolve(work).catch(() => undefined);
      reject(new Error('ARCHIVE_REQUEST_ABORTED')); return;
    }
    const abort = () => reject(new Error('ARCHIVE_REQUEST_ABORTED'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Authorization happens in the original SQL RPC before it can return PZ001.
 * Restore never applies a financial operation. Reinvoke the same RPC and arguments
 * so its actor/action/payload checks and request lock remain authoritative.
 */
export async function rpcWithArchiveReplay(
  admin: ArchiveReplayAdmin, name: string, args: Record<string, unknown>, signal?: AbortSignal,
  options: { archiveTimeoutMs?: number } = {},
): Promise<RpcResult> {
  const call = async (rpc: string, params: Record<string, unknown>, requestSignal = signal) => {
    if (requestSignal?.aborted) throw new Error('ARCHIVE_REQUEST_ABORTED');
    const request = admin.rpc(rpc, params);
    const pending = requestSignal && request.abortSignal ? request.abortSignal(requestSignal) : request;
    return requestSignal ? await bounded(pending, requestSignal) : await pending;
  };
  const first = await call(name, args);
  const error = first.error as { code?: string; details?: string } | null;
  if (error?.code !== 'PZ001' || !financialRpc.has(name)) return first;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeoutMs = Math.max(1, Math.min(10000, options.archiveTimeoutMs ?? 10000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const recoverySignal = controller.signal;
  try {
    if (!admin.storage || typeof error.details !== 'string') return unavailable();
    const manifest = JSON.parse(error.details) as Manifest;
    if (!uuid.test(manifest.batchId) || !uuid.test(manifest.requestId)
      || manifest.requestId !== args.p_request_id || manifest.bucket !== 'proesc-history'
      || manifest.objectPath !== `receipts/v1/${manifest.batchId}.json.gz`
      || !/^[0-9a-f]{64}$/.test(manifest.payloadSha256) || !/^[0-9a-f]{64}$/.test(manifest.compressedSha256)
      || manifest.formatVersion !== 1 || !Number.isSafeInteger(manifest.rowCount)
      || manifest.rowCount < 1 || manifest.rowCount > 500 || recoverySignal.aborted) return unavailable();
    const downloaded = await bounded(admin.storage.from(manifest.bucket).download(manifest.objectPath), recoverySignal);
    if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_ARCHIVE_BYTES || recoverySignal.aborted) {
      return unavailable();
    }
    const bytes = await bounded(downloaded.data.arrayBuffer(), recoverySignal);
    const payloadText = await bounded(verifyArchive(new Uint8Array(bytes), {
      rowCount: manifest.rowCount, sha256: manifest.payloadSha256, compressedSha256: manifest.compressedSha256,
    }), recoverySignal);
    const restore = await call('proesc_restore_receipt_archive_service', {
      p_request_id: manifest.requestId, p_payload_text: payloadText,
    }, recoverySignal);
    const restored = restore.data as { restored?: boolean; requestId?: string } | null;
    if (restore.error || restored?.restored !== true || restored.requestId !== manifest.requestId) return unavailable();
    const replay = await call(name, args, recoverySignal);
    if ((replay.error as { code?: string } | null)?.code === 'PZ001') return unavailable();
    return replay;
  } catch { return unavailable(); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
