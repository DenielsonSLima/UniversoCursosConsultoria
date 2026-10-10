import { Buffer } from 'node:buffer';
// Preparation adapter: no default fetch, environment access, credential storage,
// bucket creation, signed/public URLs, overwrite, SQL or deletion operations.
import { createHash } from 'node:crypto';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.[a-f0-9]{64}\.(jsonl\.gz|manifest\.json\.gz)$/;
const MAX_STANDARD_BYTES = 6 * 1024 * 1024;
const DEFAULT_OBJECT_BYTES = 4 * 1024 * 1024;
const METADATA_BYTES = 64 * 1024;
const validId = (value) => typeof value === 'string' && ID.test(value);
const fault = (code, status) => Object.assign(new Error(`Storage adapter: ${code}`), {
  code, ...(Number.isInteger(status) ? { status } : {}),
});
const parseJson = (bytes) => {
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw fault('INVALID_JSON_RESPONSE'); }
};

async function boundedBody(response, maximum, signal) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel().catch(() => {});
    throw fault('RESPONSE_TOO_LARGE');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw fault('REQUEST_TIMEOUT');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw fault('RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createSupabasePrivateStore(config, dependencies = {}) {
  const allowed = new Set(['projectRef', 'bucket', 'namespace', 'tenantId', 'enabled', 'timeoutMs', 'maxObjectBytes']);
  // Reject accessors instead of validating one getter result then using another.
  // Only this scalar snapshot is used for validation, URLs and later operations.
  try {
    if (!config || ![Object.prototype, null].includes(Object.getPrototypeOf(config))) throw new Error();
    const descriptors = Object.getOwnPropertyDescriptors(config);
    const snapshot = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !allowed.has(key) || !Object.hasOwn(descriptor, 'value')) throw new Error();
      snapshot[key] = descriptor.value;
    }
    config = Object.freeze(snapshot);
  } catch { throw fault('INVALID_CONFIGURATION'); }
  if (typeof config.projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(config.projectRef)) {
    throw fault('INVALID_PROJECT_REF');
  }
  for (const field of ['bucket', 'namespace', 'tenantId']) {
    if (!validId(config[field])) throw fault('INVALID_SCOPE');
  }
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') throw fault('INVALID_ENABLED_FLAG');
  const enabled = config.enabled === true;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const maxObjectBytes = config.maxObjectBytes ?? DEFAULT_OBJECT_BYTES;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60_000
    || !Number.isSafeInteger(maxObjectBytes) || maxObjectBytes < 1 || maxObjectBytes > MAX_STANDARD_BYTES) {
    throw fault('INVALID_LIMITS');
  }
  const { transport, credentials } = dependencies;
  if (typeof transport !== 'function' || typeof credentials !== 'function') throw fault('DEPENDENCIES_REQUIRED');
  const scope = Object.freeze({
    projectRef: config.projectRef, bucket: config.bucket, namespace: config.namespace,
    tenantId: config.tenantId, prefix: `${config.namespace}/${config.tenantId}`,
  });
  const origin = `https://${scope.projectRef}.supabase.co`;
  const base = `${origin}/storage/v1`;

  async function request(path, method, { body, contentType, maximum = METADATA_BYTES } = {}) {
    if (!enabled) throw fault('DISABLED');
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(fault('REQUEST_TIMEOUT')); }, timeoutMs);
    });
    const operation = async () => {
      let apiKey;
      let accessToken;
      try {
        const credential = await credentials(scope);
        apiKey = credential?.apiKey;
        accessToken = credential?.accessToken;
      } catch { throw fault('CREDENTIALS_UNAVAILABLE'); }
      if (controller.signal.aborted) throw fault('REQUEST_TIMEOUT');
      const safe = (value) => typeof value === 'string' && value.length > 0 && value.length < 16_384
        && !/[\s\x00-\x1f\x7f]/.test(value);
      if (!safe(apiKey) || !safe(accessToken)) throw fault('INVALID_CREDENTIALS');
      const headers = {
        apikey: apiKey, Authorization: `Bearer ${accessToken}`,
        'cache-control': 'no-store',
        ...(body ? { 'content-type': contentType, 'x-upsert': 'false' } : {}),
      };
      let response;
      try {
        response = await transport(`${base}${path}`, {
          method, headers, body, redirect: 'error', cache: 'no-store', signal: controller.signal,
        });
      } catch { throw fault(controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'TRANSPORT_UNCONFIRMED'); }
      if (!(response instanceof Response)) throw fault('INVALID_HTTP_RESPONSE');
      if (response.redirected || response.status >= 300 && response.status < 400
        || response.url && response.url !== `${base}${path}`) {
        await response.body?.cancel().catch(() => {});
        throw fault('REDIRECT_REJECTED');
      }
      let bytes;
      try { bytes = await boundedBody(response, response.ok ? maximum : METADATA_BYTES, controller.signal); }
      catch (error) { throw fault(error?.code === 'RESPONSE_TOO_LARGE' ? error.code : 'BODY_UNCONFIRMED'); }
      return { status: response.status, bytes };
    };
    try { return await Promise.race([operation(), timeout]); }
    finally { clearTimeout(timer); }
  }

  async function checkPrivateBucket() {
    const result = await request(`/bucket/${scope.bucket}`, 'GET');
    if (result.status !== 200) throw fault('BUCKET_CHECK_FAILED', result.status);
    const bucket = parseJson(result.bytes);
    if (bucket?.id !== scope.bucket || bucket.public !== false
      || bucket.type !== undefined && bucket.type !== 'STANDARD') throw fault('PRIVATE_BUCKET_REQUIRED');
    return bucket;
  }
  function objectPath(name) {
    if (typeof name !== 'string' || !NAME.test(name)) throw fault('INVALID_OBJECT_NAME');
    return `/object/${scope.bucket}/${scope.prefix}/${name}`;
  }
  async function read(name, maximum) {
    const path = objectPath(name);
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > maxObjectBytes) throw fault('INVALID_READ_LIMIT');
    await checkPrivateBucket();
    const result = await request(path, 'GET', { maximum });
    if (result.status !== 200) throw fault('READ_FAILED', result.status);
    return result.bytes;
  }
  async function putImmutable(name, input) {
    const path = objectPath(name);
    if (!Buffer.isBuffer(input) || input.length < 1 || input.length > maxObjectBytes) throw fault('INVALID_OBJECT_SIZE');
    const bytes = Buffer.from(input); // Freeze bytes before awaiting credentials/network.
    if (createHash('sha256').update(bytes).digest('hex') !== name.split('.')[1]) throw fault('OBJECT_NAME_HASH_MISMATCH');
    const contentType = 'application/gzip';
    const bucket = await checkPrivateBucket();
    if (bucket.file_size_limit != null && (!Number.isSafeInteger(Number(bucket.file_size_limit))
      || Number(bucket.file_size_limit) < bytes.length)) throw fault('BUCKET_FILE_LIMIT');
    if (bucket.allowed_mime_types != null && (!Array.isArray(bucket.allowed_mime_types)
      || !bucket.allowed_mime_types.some((type) => [contentType, 'application/*', '*/*'].includes(type)))) {
      throw fault('BUCKET_MIME_LIMIT');
    }
    const result = await request(path, 'POST', { body: bytes, contentType });
    let reused = false;
    if (result.status !== 200 && result.status !== 201) {
      let code;
      if (result.status === 400 || result.status === 409) {
        const parsed = parseJson(result.bytes);
        code = parsed?.code ?? parsed?.error;
      }
      if (![400, 409].includes(result.status)
        || !['ResourceAlreadyExists', 'KeyAlreadyExists', 'already_exists', 'Duplicate', 'AssetAlreadyExists'].includes(code)) {
        throw fault('UPLOAD_UNCONFIRMED', result.status);
      }
      reused = true;
    } else {
      const uploaded = parseJson(result.bytes);
      if (uploaded?.Key !== `${scope.bucket}/${scope.prefix}/${name}`) throw fault('UPLOAD_IDENTITY_MISMATCH');
    }
    const readback = await read(name, bytes.length);
    if (!readback.equals(bytes)) throw fault('IMMUTABLE_READBACK_MISMATCH');
    return Object.freeze({ name, reused, verified: true });
  }
  return Object.freeze({
    kind: 'supabase-private-storage', scope, maxObjectBytes, read, putImmutable,
    cleanupEnabled: false, enabled,
  });
}
