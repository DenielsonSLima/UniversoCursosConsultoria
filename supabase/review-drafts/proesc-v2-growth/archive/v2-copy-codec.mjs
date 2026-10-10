import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { boundedGunzip } from './bounded-gunzip.mjs';

const compress = promisify(gzip);
export const COPY_LIMITS = Object.freeze({ raw: 1048576, compressed: 4194304, manifest: 65536, rows: 100 });
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const scopeKeys = ['projectRef', 'bucket', 'namespace', 'tenantId', 'prefix'];
const sourceKeys = ['format', 'batchId', 'projectRef', 'bucket', 'namespace', 'tenantId', 'runId',
  'observationIds', 'rowCount', 'payloadText', 'payloadSha256', 'rawBytes'];
const metadataKeys = sourceKeys.filter((key) => key !== 'payloadText' && key !== 'format');
const receiptKeys = ['format', 'batchId', 'payloadSha256', 'rawBytes', 'rowCount', 'objectName',
  'compressedSha256', 'compressedBytes', 'manifestObjectName', 'manifestJsonSha256', 'manifestJsonBytes',
  'manifestCompressedSha256', 'manifestCompressedBytes', 'storageScope', 'copyOnly'];
const manifestKeys = ['format', ...metadataKeys, 'objectName', 'compressedSha256', 'compressedBytes', 'copyOnly'];
export const fail = (code) => Object.assign(new Error(`V2 copy: ${code}`), { code });
const require = (condition, code) => { if (!condition) throw fail(code); };
const bounded = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
const validHash = (value) => typeof value === 'string' && HASH.test(value);
export const validBatchId = (value) => typeof value === 'string' && UUID.test(value);

// Capture only own data properties; never call accessors or trust caller-owned arrays across awaits.
export function strictSnapshot(input, keys) {
  require(input && [Object.prototype, null].includes(Object.getPrototypeOf(input)), 'INVALID_OBJECT');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const actual = Reflect.ownKeys(descriptors);
  require(actual.length === keys.length && actual.every((key) => typeof key === 'string' && keys.includes(key)), 'UNEXPECTED_FIELDS');
  const result = {};
  for (const key of keys) {
    require(Object.hasOwn(descriptors[key], 'value'), 'ACCESSOR_REJECTED');
    result[key] = descriptors[key].value;
  }
  return result;
}
function snapshotIds(ids) {
  require(Array.isArray(ids) && bounded(ids.length, COPY_LIMITS.rows), 'INVALID_SELECTION');
  const descriptors = Object.getOwnPropertyDescriptors(ids);
  require(Reflect.ownKeys(descriptors).length === ids.length + 1, 'INVALID_SELECTION');
  const copy = [];
  for (let i = 0; i < ids.length; i += 1) {
    require(descriptors[i] && Object.hasOwn(descriptors[i], 'value'), 'INVALID_SELECTION');
    const id = descriptors[i].value;
    require(validBatchId(id) && (i === 0 || id > copy[i - 1]), 'INVALID_SELECTION');
    copy.push(id);
  }
  return Object.freeze(copy);
}
export function snapshotScope(input) {
  const scope = strictSnapshot(input, scopeKeys);
  require(typeof scope.projectRef === 'string' && /^[a-z0-9]{20}$/.test(scope.projectRef)
    && scope.bucket === 'proesc-history' && scope.namespace === 'proesc-v2-copy'
    && typeof scope.tenantId === 'string' && /^[1-9][0-9]{0,17}$/.test(scope.tenantId)
    && scope.prefix === `${scope.namespace}/${scope.tenantId}`, 'INVALID_SCOPE');
  return Object.freeze(scope);
}
export function equalScope(a, b) { return scopeKeys.every((key) => a[key] === b[key]); }
function validateMetadata(metadata, batchId, scope) {
  require(validBatchId(batchId) && metadata.batchId === batchId && validBatchId(metadata.runId), 'BATCH_OR_RUN_MISMATCH');
  require(['projectRef', 'bucket', 'namespace', 'tenantId'].every((key) => metadata[key] === scope[key]), 'SCOPE_MISMATCH');
  require(bounded(metadata.rowCount, COPY_LIMITS.rows) && metadata.rowCount === metadata.observationIds.length, 'COUNT_MISMATCH');
  require(bounded(metadata.rawBytes, COPY_LIMITS.raw) && validHash(metadata.payloadSha256), 'INVALID_PAYLOAD_METADATA');
}
function parseUtf8(bytes) {
  const text = bytes.toString('utf8');
  require(Buffer.from(text).equals(bytes), 'INVALID_UTF8');
  try { return JSON.parse(text); } catch { throw fail('INVALID_JSON'); }
}
function validatePayload(bytes, metadata) {
  require(bytes.length === metadata.rawBytes && sha256(bytes) === metadata.payloadSha256, 'PAYLOAD_INTEGRITY');
  require(!bytes.includes(10) && !bytes.includes(13), 'PAYLOAD_NOT_SINGLE_LINE');
  const envelope = strictSnapshot(parseUtf8(bytes), ['format', 'normalizationVersion', 'run', 'unitId', 'rows']);
  require(envelope.format === 'proesc-v2-copy-v1' && envelope.normalizationVersion === 1
    && envelope.unitId === metadata.tenantId, 'PAYLOAD_ENVELOPE');
  const run = strictSnapshot(envelope.run, ['id', 'actor_id', 'credential_revision', 'mode', 'status', 'created_at', 'finished_at']);
  require(run.id === metadata.runId && run.status === 'COMPLETE' && typeof run.finished_at === 'string'
    && Number.isFinite(Date.parse(run.finished_at)), 'PAYLOAD_RUN');
  require(Array.isArray(envelope.rows) && envelope.rows.length === metadata.rowCount, 'PAYLOAD_ROWS');
  for (const [index, row] of envelope.rows.entries()) {
    const value = strictSnapshot(row, ['observation', 'normalizedJson']);
    const observation = strictSnapshot(value.observation, ['id', 'run_id', 'task_id', 'unit_id', 'invoice_id',
      'link_id', 'snapshot_id', 'source_status', 'result', 'reason', 'observed_at', 'recorded_at', 'normalized_payload_id']);
    require(observation.id === metadata.observationIds[index] && observation.run_id === metadata.runId
      && observation.unit_id === metadata.tenantId && validBatchId(observation.task_id)
      && typeof observation.result === 'string' && observation.result !== 'STAGED'
      && typeof value.normalizedJson === 'string', 'PAYLOAD_OBSERVATION');
    // normalizedJson is opaque PostgreSQL JSON text. Never parse or reserialize financial numbers.
  }
}
export function snapshotReceipt(input, scope) {
  const receipt = strictSnapshot(input, receiptKeys);
  receipt.storageScope = snapshotScope(receipt.storageScope);
  require(receipt.format === 'proesc-v2-copy-receipt-v1' && receipt.copyOnly === true
    && validBatchId(receipt.batchId) && (scope === undefined || equalScope(receipt.storageScope, scope)), 'RECEIPT_SCOPE');
  require(validHash(receipt.payloadSha256) && bounded(receipt.rawBytes, COPY_LIMITS.raw)
    && bounded(receipt.rowCount, COPY_LIMITS.rows), 'RECEIPT_PAYLOAD');
  for (const field of ['compressedSha256', 'manifestJsonSha256', 'manifestCompressedSha256']) require(validHash(receipt[field]), 'RECEIPT_HASH');
  require(bounded(receipt.compressedBytes, COPY_LIMITS.compressed)
    && bounded(receipt.manifestCompressedBytes, COPY_LIMITS.manifest)
    && bounded(receipt.manifestJsonBytes, COPY_LIMITS.manifest), 'RECEIPT_SIZE');
  require(receipt.objectName === `${receipt.batchId}.${receipt.compressedSha256}.jsonl.gz`
    && receipt.manifestObjectName === `${receipt.batchId}.${receipt.manifestCompressedSha256}.manifest.json.gz`, 'RECEIPT_NAME');
  return Object.freeze(receipt);
}
export async function encodeV2Copy(exported, expectedBatchId, approvedScope) {
  const source = strictSnapshot(exported, sourceKeys);
  source.observationIds = snapshotIds(source.observationIds);
  const scope = snapshotScope(approvedScope);
  require(source.format === 'proesc-v2-copy-v1', 'SOURCE_FORMAT');
  validateMetadata(source, expectedBatchId, scope);
  require(typeof source.payloadText === 'string' && source.payloadText.length <= COPY_LIMITS.raw, 'PAYLOAD_LIMIT');
  const payload = Buffer.from(source.payloadText, 'utf8');
  require(payload.toString('utf8') === source.payloadText, 'INVALID_UTF8');
  validatePayload(payload, source);
  const compressed = await compress(payload, { level: 6, maxOutputLength: COPY_LIMITS.compressed });
  const compressedSha256 = sha256(compressed), objectName = `${source.batchId}.${compressedSha256}.jsonl.gz`;
  const manifest = { format: 'proesc-v2-copy-manifest-v1',
    ...Object.fromEntries(metadataKeys.map((key) => [key, source[key]])),
    objectName, compressedSha256, compressedBytes: compressed.length, copyOnly: true };
  const manifestJson = Buffer.from(JSON.stringify(manifest));
  require(manifestJson.length <= COPY_LIMITS.manifest, 'MANIFEST_LIMIT');
  const manifestCompressed = await compress(manifestJson, { level: 6, maxOutputLength: COPY_LIMITS.manifest });
  const manifestCompressedSha256 = sha256(manifestCompressed);
  const receipt = snapshotReceipt({ format: 'proesc-v2-copy-receipt-v1', batchId: source.batchId,
    payloadSha256: source.payloadSha256, rawBytes: source.rawBytes, rowCount: source.rowCount,
    objectName, compressedSha256, compressedBytes: compressed.length,
    manifestObjectName: `${source.batchId}.${manifestCompressedSha256}.manifest.json.gz`,
    manifestJsonSha256: sha256(manifestJson), manifestJsonBytes: manifestJson.length,
    manifestCompressedSha256, manifestCompressedBytes: manifestCompressed.length, storageScope: scope, copyOnly: true }, scope);
  return { receipt, compressed, manifestCompressed };
}
function snapshotManifest(input) {
  const manifest = strictSnapshot(input, manifestKeys);
  require(manifest.format === 'proesc-v2-copy-manifest-v1' && manifest.copyOnly === true, 'MANIFEST_FORMAT');
  manifest.observationIds = snapshotIds(manifest.observationIds);
  const scope = snapshotScope({ projectRef: manifest.projectRef, bucket: manifest.bucket,
    namespace: manifest.namespace, tenantId: manifest.tenantId, prefix: `${manifest.namespace}/${manifest.tenantId}` });
  validateMetadata(manifest, manifest.batchId, scope);
  require(validHash(manifest.compressedSha256) && bounded(manifest.compressedBytes, COPY_LIMITS.compressed)
    && manifest.objectName === `${manifest.batchId}.${manifest.compressedSha256}.jsonl.gz`, 'MANIFEST_COMPRESSED_METADATA');
  return Object.freeze(manifest);
}
export async function decodeV2CopyManifest(input, inputReceipt) {
  const receipt = snapshotReceipt(inputReceipt);
  require(Buffer.isBuffer(input) && input.length === receipt.manifestCompressedBytes, 'MANIFEST_COMPRESSED_INTEGRITY');
  const compressed = Buffer.from(input);
  require(sha256(compressed) === receipt.manifestCompressedSha256, 'MANIFEST_COMPRESSED_INTEGRITY');
  const plain = await boundedGunzip(compressed, receipt.manifestJsonBytes);
  require(plain.length === receipt.manifestJsonBytes && sha256(plain) === receipt.manifestJsonSha256, 'MANIFEST_JSON_INTEGRITY');
  const manifest = snapshotManifest(parseUtf8(plain));
  validateMetadata(manifest, receipt.batchId, receipt.storageScope);
  require(['payloadSha256', 'rawBytes', 'rowCount', 'objectName', 'compressedSha256', 'compressedBytes']
    .every((key) => manifest[key] === receipt[key]), 'MANIFEST_RECEIPT_MISMATCH');
  return manifest;
}
export async function decodeV2CopyPayload(input, inputManifest) {
  const manifest = snapshotManifest(inputManifest);
  require(Buffer.isBuffer(input) && input.length === manifest.compressedBytes, 'COMPRESSED_INTEGRITY');
  const compressed = Buffer.from(input);
  require(sha256(compressed) === manifest.compressedSha256, 'COMPRESSED_INTEGRITY');
  const payload = await boundedGunzip(compressed, manifest.rawBytes);
  validatePayload(payload, manifest);
  return payload;
}
