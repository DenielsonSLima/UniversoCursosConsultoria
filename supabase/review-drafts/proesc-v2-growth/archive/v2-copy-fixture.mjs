// Invented data and an in-memory Fetch transport only. No server, DNS or real credentials.
import { createHash } from 'node:crypto';
import { createSupabasePrivateStore } from './supabase-store.mjs';

export const COPY_CONFIG = Object.freeze({ projectRef: 'abcdefghijklmnopqrst', bucket: 'proesc-history',
  namespace: 'proesc-v2-copy', tenantId: '3145', maxObjectBytes: 4194304, enabled: true });
export const BATCH = '00000000-0000-0000-0000-000000000001';
const RUN = '00000000-0000-0000-0000-000000000002';
const OBS = '00000000-0000-0000-0000-000000000003';
export const NORMALIZED = '{"large":9007199254740993,"decimal":1234567890.12345678901234567890,"text":"ação"}';
export function copyExportFixture() {
  const payloadText = JSON.stringify({ format: 'proesc-v2-copy-v1', normalizationVersion: 1,
    run: { id: RUN, actor_id: RUN, credential_revision: RUN, mode: 'FULL', status: 'COMPLETE',
      created_at: '2026-10-01T00:00:00Z', finished_at: '2026-10-01T01:00:00Z' },
    unitId: COPY_CONFIG.tenantId, rows: [{ normalizedJson: NORMALIZED, observation: {
      id: OBS, run_id: RUN, task_id: RUN, unit_id: COPY_CONFIG.tenantId, invoice_id: '901',
      link_id: null, snapshot_id: null, source_status: 'OPEN', result: 'UNLINKED', reason: null,
      observed_at: '2026-10-01T00:30:00Z', recorded_at: '2026-10-01T00:31:00Z', normalized_payload_id: null,
    } }] });
  return { format: 'proesc-v2-copy-v1', batchId: BATCH, projectRef: COPY_CONFIG.projectRef,
    bucket: COPY_CONFIG.bucket, namespace: COPY_CONFIG.namespace, tenantId: COPY_CONFIG.tenantId,
    runId: RUN, observationIds: [OBS], rowCount: 1, payloadText,
    payloadSha256: createHash('sha256').update(payloadText).digest('hex'), rawBytes: Buffer.byteLength(payloadText) };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
export function createV2CopyHttpFixture(options = {}) {
  const config = { ...COPY_CONFIG, ...options.config };
  const objects = new Map(), calls = [], credentialCalls = [];
  const bucket = { id: config.bucket, type: 'STANDARD', public: false,
    file_size_limit: 4194304, allowed_mime_types: ['application/gzip'], ...options.bucket };
  async function transport(url, request) {
    const parsed = new URL(url), call = { url, request, pathname: parsed.pathname, method: request.method };
    calls.push(call);
    if (parsed.origin !== `https://${config.projectRef}.supabase.co` || request.redirect !== 'error') throw new Error('Mock origin gate');
    if (options.intercept) {
      const result = await options.intercept(call, { objects, bucket });
      if (result !== undefined) return result;
    }
    if (parsed.pathname === `/storage/v1/bucket/${config.bucket}` && request.method === 'GET') return json(bucket);
    const prefix = `/storage/v1/object/${config.bucket}/${config.namespace}/${config.tenantId}/`;
    if (!parsed.pathname.startsWith(prefix)) return json({ code: 'AccessDenied' }, 403);
    const name = parsed.pathname.slice(prefix.length);
    if (request.method === 'GET') return objects.has(name) ? new Response(Buffer.from(objects.get(name))) : json({}, 404);
    if (request.method !== 'POST' || request.headers['x-upsert'] !== 'false') throw new Error('Mock forbidden method');
    if (request.body.length > bucket.file_size_limit) return json({}, 413);
    if (!bucket.allowed_mime_types.includes(request.headers['content-type'])) return json({}, 415);
    if (objects.has(name)) return json({ code: 'ResourceAlreadyExists' }, 409);
    objects.set(name, Buffer.from(request.body));
    return json({ Key: `${config.bucket}/${config.namespace}/${config.tenantId}/${name}` });
  }
  async function credentials(scope) {
    credentialCalls.push(scope);
    return { apiKey: 'synthetic-key-not-real', accessToken: 'synthetic-token-not-real' };
  }
  const remote = createSupabasePrivateStore(config, { transport, credentials });
  return { remote, transport, credentials, objects, calls, credentialCalls, bucket, config };
}
