import { COPY_LIMITS, fail, snapshotScope, snapshotReceipt, encodeV2Copy,
  decodeV2CopyManifest, decodeV2CopyPayload, sha256, strictSnapshot } from './v2-copy-codec.mjs';

export function snapshotCopyRemote(input) {
  const remote = strictSnapshot(input, ['kind', 'cleanupEnabled', 'enabled', 'scope', 'maxObjectBytes', 'putImmutable', 'read']);
  if (remote?.kind !== 'supabase-private-storage' || remote.cleanupEnabled !== false || remote.enabled !== true
    || typeof remote.putImmutable !== 'function' || typeof remote.read !== 'function'
    || !Number.isSafeInteger(remote.maxObjectBytes) || remote.maxObjectBytes < 1
    || remote.maxObjectBytes > COPY_LIMITS.compressed) throw fail('REMOTE_CONTRACT');
  return Object.freeze({ kind: remote.kind, cleanupEnabled: false, enabled: true, scope: snapshotScope(remote.scope), maxObjectBytes: remote.maxObjectBytes,
    putImmutable: remote.putImmutable.bind(remote), read: remote.read.bind(remote) });
}
function validateBudget(receipt, remote) {
  if (receipt.compressedBytes > remote.maxObjectBytes || receipt.manifestCompressedBytes > remote.maxObjectBytes) {
    throw fail('SPLIT_COPY_BEFORE_UPLOAD');
  }
}
async function putVerified(remote, name, bytes) {
  const result = await remote.putImmutable(name, bytes);
  if (result?.name !== name || result.verified !== true) throw fail('UPLOAD_UNCONFIRMED');
  // The adapter already does byte-for-byte readback; the result only advances this protocol.
}
export async function publishV2Copy(exported, remote, expectedBatchId) {
  remote = snapshotCopyRemote(remote);
  const { receipt, compressed, manifestCompressed } = await encodeV2Copy(exported, expectedBatchId, remote.scope);
  validateBudget(receipt, remote);
  // Decode our full output before any upload, including the exact original payload bytes.
  const manifest = await decodeV2CopyManifest(manifestCompressed, receipt);
  await decodeV2CopyPayload(compressed, manifest);
  await putVerified(remote, receipt.objectName, compressed);
  await putVerified(remote, receipt.manifestObjectName, manifestCompressed);
  return receipt;
}
export async function restoreV2Copy(remote, inputReceipt, destination, filename) {
  remote = snapshotCopyRemote(remote);
  const receipt = snapshotReceipt(inputReceipt, remote.scope);
  validateBudget(receipt, remote);
  if (!['proesc-v2-copy-local-restore', 'proesc-v2-copy-memory-restore'].includes(destination?.kind)
    || typeof destination.putImmutable !== 'function'
    || typeof destination.read !== 'function' || typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.json$/.test(filename ?? '')) {
    throw fail('LOCAL_RESTORE_REQUIRED');
  }
  const write = destination.putImmutable.bind(destination), read = destination.read.bind(destination);
  const compressedManifest = await remote.read(receipt.manifestObjectName, receipt.manifestCompressedBytes);
  const manifest = await decodeV2CopyManifest(compressedManifest, receipt);
  const compressed = await remote.read(receipt.objectName, receipt.compressedBytes);
  const payload = await decodeV2CopyPayload(compressed, manifest);
  const result = await write(filename, payload);
  const restored = await read(filename, receipt.rawBytes);
  if (!restored.equals(payload)) throw fail('RESTORE_READBACK_MISMATCH');
  return Object.freeze({ name: filename, reused: result.reused, batchId: receipt.batchId,
    payloadSha256: sha256(restored), rawBytes: restored.length, rowCount: receipt.rowCount, copyOnly: true });
}
