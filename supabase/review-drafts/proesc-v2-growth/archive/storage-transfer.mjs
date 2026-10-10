import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { verifySyntheticArchive, restoreSyntheticArchive } from './archive.mjs';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const MAX_MANIFEST = 64 * 1024; // Independent ceilings for gzip bytes and decoded JSON.
const FORMAT = 'proesc-storage-transfer-v2';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const localNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.[a-f0-9]{64}\.manifest\.json$/;
const scopeFields = ['projectRef', 'bucket', 'namespace', 'tenantId', 'prefix'];
const sameScope = (a, b) => a && b && scopeFields
  .every((field) => typeof a[field] === 'string' && a[field] === b[field]);
const snapshot = (source, fields) => Object.fromEntries(fields.map((field) => [field, source?.[field]]));
const localFields = ['manifestName', 'manifestSha256', 'tenantId'];
const remoteFields = ['archiveId', 'tenantId', 'manifestObjectName', 'manifestCompressedSha256',
  'manifestCompressedBytes', 'manifestJsonSha256', 'manifestJsonBytes',
  'transferFormat', 'syntheticOnly', 'cleanupEnabled'];
const positiveWithin = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
const localManifestName = (descriptor) => `${descriptor.archiveId}.${descriptor.manifestJsonSha256}.manifest.json`;

function assertScope(remote, descriptor) {
  if (remote?.kind !== 'supabase-private-storage' || remote.cleanupEnabled !== false
    || descriptor?.tenantId !== remote.scope?.tenantId) throw new Error('Archive transfer scope mismatch');
}
function assertLocalDescriptor(descriptor) {
  if (!localNamePattern.test(descriptor.manifestName ?? '') || !HASH.test(descriptor.manifestSha256 ?? '')
    || !descriptor.manifestName.endsWith(`.${descriptor.manifestSha256}.manifest.json`)) {
    throw new Error('Trusted descriptor with canonical manifest filename required');
  }
}
function assertRemoteDescriptor(descriptor, remote) {
  if (descriptor.transferFormat !== FORMAT || descriptor.syntheticOnly !== true
    || descriptor.cleanupEnabled !== false || !sameScope(descriptor.storageScope, remote.scope)) {
    throw new Error('Remote descriptor destination mismatch');
  }
  if (typeof descriptor.archiveId !== 'string' || !ID.test(descriptor.archiveId)
    || !HASH.test(descriptor.manifestCompressedSha256 ?? '') || !HASH.test(descriptor.manifestJsonSha256 ?? '')
    || descriptor.manifestObjectName !== `${descriptor.archiveId}.${descriptor.manifestCompressedSha256}.manifest.json.gz`) {
    throw new Error('Trusted descriptor with canonical manifest filename required');
  }
  if (!positiveWithin(descriptor.manifestCompressedBytes, Math.min(MAX_MANIFEST, remote.maxObjectBytes))
    || !positiveWithin(descriptor.manifestJsonBytes, MAX_MANIFEST)) throw new Error('Manifest exceeds configured limits');
}

// Only the pre-existing, explicitly synthetic offline format is accepted.
// This does not select records or authorize/export real database records.
export async function publishSyntheticArchive(local, descriptor, remote, limits) {
  descriptor = Object.freeze(snapshot(descriptor, localFields));
  limits = limits === undefined ? undefined : Object.freeze({ ...limits });
  assertScope(remote, descriptor);
  assertLocalDescriptor(descriptor);
  const verified = await verifySyntheticArchive(local, descriptor, limits);
  const archiveId = verified.manifest.context.archiveId;
  if (verified.manifest.context.tenantId !== remote.scope.tenantId) throw new Error('Manifest tenant mismatch');
  if (descriptor.manifestName !== `${archiveId}.${descriptor.manifestSha256}.manifest.json`) {
    throw new Error('Manifest filename identity mismatch');
  }
  if (verified.manifest.compressedBytes > remote.maxObjectBytes) throw new Error('Split archive before upload');
  const object = await local.read(verified.manifest.objectName, verified.manifest.compressedBytes);
  if (hash(object) !== verified.manifest.compressedSha256) throw new Error('Local object changed after verification');
  const manifestBytes = await local.read(descriptor.manifestName, MAX_MANIFEST);
  if (hash(manifestBytes) !== descriptor.manifestSha256) throw new Error('Local manifest changed after verification');
  const compressed = await compress(manifestBytes, { level: 6, maxOutputLength: MAX_MANIFEST });
  if (compressed.length > remote.maxObjectBytes) throw new Error('Manifest exceeds storage limit');
  const compressedHash = hash(compressed);
  const receipt = Object.freeze({
    archiveId, tenantId: descriptor.tenantId,
    manifestObjectName: `${archiveId}.${compressedHash}.manifest.json.gz`,
    manifestCompressedSha256: compressedHash, manifestCompressedBytes: compressed.length,
    manifestJsonSha256: descriptor.manifestSha256, manifestJsonBytes: manifestBytes.length,
    storageScope: remote.scope, transferFormat: FORMAT, syntheticOnly: true, cleanupEnabled: false,
  });
  assertRemoteDescriptor(receipt, remote);
  // Data upload includes readback. Gzip manifest is always last, including retries.
  await remote.putImmutable(verified.manifest.objectName, object);
  await remote.putImmutable(receipt.manifestObjectName, compressed);
  return receipt;
}

export async function restoreStorageSyntheticArchive(remote, descriptor, staging, destination, filename, limits) {
  descriptor = Object.freeze({ ...snapshot(descriptor, remoteFields),
    storageScope: Object.freeze(snapshot(descriptor?.storageScope, scopeFields)),
  });
  limits = limits === undefined ? undefined : Object.freeze({ ...limits });
  assertScope(remote, descriptor);
  assertRemoteDescriptor(descriptor, remote);
  if (staging?.kind !== 'synthetic-filesystem-only' || destination?.kind !== 'synthetic-filesystem-only'
    || staging.root === destination.root) throw new Error('Separate local restore directories required');
  const compressed = await remote.read(descriptor.manifestObjectName, descriptor.manifestCompressedBytes);
  if (compressed.length !== descriptor.manifestCompressedBytes || hash(compressed) !== descriptor.manifestCompressedSha256) {
    throw new Error('Remote compressed manifest checksum or size mismatch');
  }
  // Bound expansion by the trusted declared size (itself capped at 64 KiB), before JSON.parse or payload GET.
  const manifestBytes = await decompress(compressed, { maxOutputLength: descriptor.manifestJsonBytes });
  if (manifestBytes.length !== descriptor.manifestJsonBytes || hash(manifestBytes) !== descriptor.manifestJsonSha256) {
    throw new Error('Remote JSON manifest checksum or size mismatch');
  }
  const text = manifestBytes.toString('utf8');
  if (!Buffer.from(text).equals(manifestBytes)) throw new Error('Invalid manifest JSON encoding');
  const manifest = JSON.parse(text);
  if (descriptor.archiveId !== manifest.context?.archiveId) throw new Error('Manifest filename identity mismatch');
  if (manifest.format !== 'proesc-synthetic-archive-v1' || manifest.cleanupEnabled !== false
    || manifest.context?.syntheticOnly !== true || manifest.context?.tenantId !== descriptor.tenantId
    || !HASH.test(manifest.compressedSha256 ?? '')
    || manifest.objectName !== `${descriptor.archiveId}.${manifest.compressedSha256}.jsonl.gz`
    || !positiveWithin(manifest.compressedBytes, remote.maxObjectBytes)) throw new Error('Remote manifest scope or size mismatch');
  const object = await remote.read(manifest.objectName, manifest.compressedBytes);
  if (object.length !== manifest.compressedBytes || hash(object) !== manifest.compressedSha256) {
    throw new Error('Remote object checksum mismatch');
  }
  // Reconstruct the original local manifest byte-for-byte; the offline format stays unchanged.
  await staging.putImmutable(manifest.objectName, object);
  await staging.putImmutable(localManifestName(descriptor), manifestBytes);
  const localDescriptor = {
    manifestName: localManifestName(descriptor), manifestSha256: descriptor.manifestJsonSha256, tenantId: descriptor.tenantId,
  };
  // Nothing goes to the final restore directory until the existing full verifier passes.
  return restoreSyntheticArchive(staging, localDescriptor, destination, filename, limits);
}
