import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const FORMAT = 'proesc-synthetic-archive-v1';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const validId = (value) => typeof value === 'string' && ID.test(value);
const DEFAULT_LIMITS = Object.freeze({
  maxRecords: 5000,
  maxUncompressedBytes: 16 * 1024 * 1024,
  maxCompressedBytes: 8 * 1024 * 1024,
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function canonical(value, depth = 0) {
  if (depth > 32) throw new Error('JSON nesting limit exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error('Sparse arrays are not lossless JSON');
    }
    return value.map((item) => canonical(item, depth + 1));
  }
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], depth + 1)]));
  }
  throw new Error('Only lossless JSON values are accepted');
}
const encode = (value) => Buffer.from(JSON.stringify(canonical(value)), 'utf8');

function limitsFor(options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  for (const [key, value] of Object.entries(limits)) {
    if (!(key in DEFAULT_LIMITS) || !Number.isSafeInteger(value) || value < 1 || value > 64 * 1024 * 1024) {
      throw new Error('Invalid archive limit');
    }
  }
  return limits;
}
function assertStore(store) {
  if (store?.kind !== 'synthetic-filesystem-only') throw new Error('Only synthetic local storage is supported');
}
function validateContext(context) {
  if (context?.syntheticOnly !== true) throw new Error('Explicit synthetic-only context required');
  if (Object.keys(context).sort().join(',') !== 'archiveId,createdAt,cutoff,normalizationVersion,sourceKind,syntheticOnly,tenantId') {
    throw new Error('Unexpected archive context fields');
  }
  for (const key of ['tenantId', 'archiveId', 'sourceKind']) {
    if (!validId(context[key])) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isSafeInteger(context.normalizationVersion) || context.normalizationVersion < 1) {
    throw new Error('Invalid normalization version');
  }
  for (const key of ['cutoff', 'createdAt']) {
    if (typeof context[key] !== 'string' || !Number.isFinite(Date.parse(context[key]))
      || new Date(context[key]).toISOString() !== context[key]) throw new Error(`Invalid ${key}`);
  }
  if (Date.parse(context.cutoff) > Date.parse(context.createdAt)) throw new Error('Cutoff is after creation');
}
function validateRecords(records, context, limits) {
  if (!Array.isArray(records) || records.length < 1 || records.length > limits.maxRecords) {
    throw new Error('Invalid record count');
  }
  const ids = new Set();
  for (const record of records) {
    if (!record || record.syntheticOnly !== true || record.tenantId !== context.tenantId
      || !validId(record.id) || !validId(record.runId) || record.kind !== context.sourceKind
      || !Object.hasOwn(record, 'payload')) throw new Error('Record scope or shape mismatch');
    if (ids.has(record.id)) throw new Error('Duplicate record id');
    ids.add(record.id);
  }
}
function asJsonLines(records, maxBytes) {
  const chunks = [];
  let size = 0;
  for (const record of records) {
    const chunk = Buffer.concat([encode(record), Buffer.from('\n')]);
    size += chunk.length;
    if (size > maxBytes) throw new Error('Uncompressed archive limit exceeded');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function archiveSyntheticRecords(store, context, records, options) {
  assertStore(store);
  validateContext(context);
  context = structuredClone(context);
  const limits = limitsFor(options);
  validateRecords(records, context, limits);
  // Sort a copy. Caller data is never mutated; input array order is not semantic.
  const ordered = [...records].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const plain = asJsonLines(ordered, limits.maxUncompressedBytes);
  const compressed = await compress(plain, { level: 6 });
  if (compressed.length > limits.maxCompressedBytes) throw new Error('Compressed archive limit exceeded');
  const compressedHash = sha256(compressed);
  const objectName = `${context.archiveId}.${compressedHash}.jsonl.gz`;
  const manifest = {
    format: FORMAT,
    context,
    objectName,
    recordCount: ordered.length,
    firstId: ordered[0].id,
    lastId: ordered.at(-1).id,
    recordIdsSha256: sha256(encode(ordered.map((row) => row.id))),
    compressedBytes: compressed.length,
    uncompressedBytes: plain.length,
    compressedSha256: compressedHash,
    uncompressedSha256: sha256(plain),
    cleanupEnabled: false,
  };
  // The manifest is the commit marker. Never publish it for an unverified data object.
  await store.putImmutable(objectName, compressed);
  const readback = await store.read(objectName, limits.maxCompressedBytes);
  if (!readback.equals(compressed)) throw new Error('Archive readback mismatch');
  const decoded = await decompress(readback, { maxOutputLength: limits.maxUncompressedBytes });
  if (!decoded.equals(plain)) throw new Error('Archive decompression mismatch');
  const manifestBytes = encode(manifest);
  const manifestSha256 = sha256(manifestBytes);
  const manifestName = `${context.archiveId}.${manifestSha256}.manifest.json`;
  await store.putImmutable(manifestName, manifestBytes);
  const descriptor = { manifestName, manifestSha256, tenantId: context.tenantId };
  await verifySyntheticArchive(store, descriptor, limits);
  return Object.freeze(descriptor);
}

export async function verifySyntheticArchive(store, descriptor, options) {
  assertStore(store);
  const limits = limitsFor(options);
  if (!descriptor || !HASH.test(descriptor.manifestSha256 ?? '') || !validId(descriptor.tenantId)) {
    throw new Error('Trusted manifest descriptor required');
  }
  const bytes = await store.read(descriptor.manifestName, 64 * 1024);
  if (sha256(bytes) !== descriptor.manifestSha256) throw new Error('Manifest checksum mismatch');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.format !== FORMAT || manifest.cleanupEnabled !== false) throw new Error('Unsupported archive format');
  validateContext(manifest.context);
  if (manifest.context.tenantId !== descriptor.tenantId) throw new Error('Manifest tenant mismatch');
  if (!HASH.test(manifest.compressedSha256 ?? '') || !HASH.test(manifest.uncompressedSha256 ?? '')
    || !HASH.test(manifest.recordIdsSha256 ?? '')) throw new Error('Invalid manifest hashes');
  if (manifest.objectName !== `${manifest.context.archiveId}.${manifest.compressedSha256}.jsonl.gz`) {
    throw new Error('Manifest object identity mismatch');
  }
  for (const [key, limit] of [['recordCount', limits.maxRecords],
    ['compressedBytes', limits.maxCompressedBytes], ['uncompressedBytes', limits.maxUncompressedBytes]]) {
    if (!Number.isSafeInteger(manifest[key]) || manifest[key] < 1 || manifest[key] > limit) {
      throw new Error('Manifest exceeds configured limits');
    }
  }
  const compressed = await store.read(manifest.objectName, limits.maxCompressedBytes);
  if (compressed.length !== manifest.compressedBytes || sha256(compressed) !== manifest.compressedSha256) {
    throw new Error('Compressed checksum or size mismatch');
  }
  const plain = await decompress(compressed, { maxOutputLength: limits.maxUncompressedBytes });
  if (plain.length !== manifest.uncompressedBytes || sha256(plain) !== manifest.uncompressedSha256) {
    throw new Error('Uncompressed checksum or size mismatch');
  }
  const text = plain.toString('utf8');
  if (!Buffer.from(text).equals(plain) || !text.endsWith('\n')) throw new Error('Invalid JSONL encoding');
  const records = text.slice(0, -1).split('\n').map((line) => JSON.parse(line));
  validateRecords(records, manifest.context, limits);
  const ids = records.map((row) => row.id);
  if (records.length !== manifest.recordCount || ids[0] !== manifest.firstId || ids.at(-1) !== manifest.lastId
    || sha256(encode(ids)) !== manifest.recordIdsSha256
    || ids.some((id, index) => index > 0 && id <= ids[index - 1])) throw new Error('Manifest record mismatch');
  return { manifest, records, jsonl: plain };
}

export async function restoreSyntheticArchive(source, descriptor, destination, outputName, options) {
  assertStore(destination);
  if (source.root === destination.root) throw new Error('Restore requires a separate local destination');
  const verified = await verifySyntheticArchive(source, descriptor, options);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.jsonl$/.test(outputName ?? '')) throw new Error('Invalid restore filename');
  const result = await destination.putImmutable(outputName, verified.jsonl);
  const readback = await destination.read(outputName, verified.jsonl.length);
  if (!readback.equals(verified.jsonl)) throw new Error('Restore readback mismatch');
  return { ...result, recordCount: verified.records.length, sha256: sha256(readback), cleanupEnabled: false };
}
