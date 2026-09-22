import {
  MAX_TECHNICAL_BYTES, MAX_TECHNICAL_RUNS, TECHNICAL_BUCKET,
  technicalObjectPath, verifyTechnicalArchive,
} from '../proesc-technical-history-archive/codec.ts';
import { ProescError, object } from '../proesc-api/contract.ts';

type RpcResult = { data: unknown; error: unknown };
export type TechnicalHistoryAdmin = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage?: { from(bucket: string): {
    download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
  } };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const unavailable = () => new ProescError('Não foi possível consultar o histórico. Tente novamente.', 503);

async function bounded<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(unavailable());
    if (signal.aborted) { Promise.resolve(work).catch(() => undefined); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** SQL authorizes before lookup and again before returning the hydrated, polo-filtered history.
 * No pointer, unfiltered archive, or raw database failure is returned to the caller.
 */
export async function readProescTechnicalHistory(
  admin: TechnicalHistoryAdmin, actorId: string, input: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
) {
  const runId = input.runId;
  const poloId = input.poloId ?? null;
  if (typeof runId !== 'string' || !uuid.test(runId)
    || (poloId !== null && (typeof poloId !== 'string' || !uuid.test(poloId)))) {
    throw new ProescError('Filtro de histórico inválido.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(15000, options.timeoutMs ?? 15000)));
  const call = async (payloadText: string | null) => {
    const result = await bounded(admin.rpc('proesc_technical_history_service', {
      p_actor_id: actorId, p_run_id: runId, p_polo_id: poloId, p_payload_text: payloadText,
    }), controller.signal);
    const error = object(result.error);
    if (result.error) {
      if (error.code === '42501') throw new ProescError('Histórico fora do escopo autorizado.', 403);
      throw unavailable();
    }
    return object(result.data);
  };
  try {
    const first = await call(null);
    let result = first;
    if ('archive' in first) {
      const manifest = object(first.archive);
      if (!admin.storage || manifest.status !== 'COMMITTED' || manifest.formatVersion !== 1
        || typeof manifest.batchId !== 'string' || !uuid.test(manifest.batchId)
        || manifest.bucket !== TECHNICAL_BUCKET || manifest.objectPath !== technicalObjectPath(manifest.batchId)
        || typeof manifest.payloadSha256 !== 'string' || !hash.test(manifest.payloadSha256)
        || typeof manifest.compressedSha256 !== 'string' || !hash.test(manifest.compressedSha256)
        || !Number.isSafeInteger(manifest.runCount) || Number(manifest.runCount) < 1
        || Number(manifest.runCount) > MAX_TECHNICAL_RUNS) throw unavailable();
      const downloaded = await bounded(admin.storage.from(TECHNICAL_BUCKET).download(String(manifest.objectPath)),
        controller.signal);
      if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_TECHNICAL_BYTES) throw unavailable();
      const bytes = await bounded(downloaded.data.arrayBuffer(), controller.signal);
      const payload = await bounded(verifyTechnicalArchive(new Uint8Array(bytes), {
        runCount: Number(manifest.runCount), payloadSha256: manifest.payloadSha256,
        compressedSha256: manifest.compressedSha256,
      }), controller.signal);
      result = await call(payload);
    }
    if ('archive' in result || result.runId !== runId || result.poloId !== poloId
      || !Array.isArray(result.items) || !Array.isArray(result.http)
      || !Array.isArray(result.reusedCounts)) throw unavailable();
    return { runId, poloId, items: result.items, http: result.http, reusedCounts: result.reusedCounts,
      httpMetricsScope: 'GLOBAL_SHARED_WORKER' };
  } catch (error) {
    if (error instanceof ProescError) throw error;
    throw unavailable();
  } finally { clearTimeout(timer); }
}
