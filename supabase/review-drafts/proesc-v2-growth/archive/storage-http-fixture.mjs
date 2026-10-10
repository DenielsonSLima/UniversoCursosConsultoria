// In-memory Fetch contract fixture. No listener, DNS, credentials or network calls.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalStore } from './local-store.mjs';
import { archiveSyntheticRecords } from './archive.mjs';
import { createSupabasePrivateStore } from './supabase-store.mjs';

export const CONFIG = Object.freeze({
  projectRef: 'abcdefghijklmnopqrst', bucket: 'synthetic-archive', namespace: 'proesc-v2',
  tenantId: 'synthetic-unit', enabled: true, maxObjectBytes: 4 * 1024 * 1024,
});
export const CONTEXT = Object.freeze({
  syntheticOnly: true, tenantId: CONFIG.tenantId, archiveId: 'synthetic-batch',
  sourceKind: 'invoice', normalizationVersion: 1,
  cutoff: '2026-10-08T00:00:00.000Z', createdAt: '2026-10-10T00:00:00.000Z',
});
export const RECORDS = Object.freeze([
  { syntheticOnly: true, id: 'synthetic-invoice', tenantId: CONFIG.tenantId,
    runId: 'synthetic-run', kind: 'invoice', payload: { amount: '10.00', state: 'OPEN' } },
]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

export function mockStorage(options = {}) {
  const objects = new Map();
  const calls = [];
  const credentialCalls = [];
  const bucket = { id: CONFIG.bucket, public: false, type: 'STANDARD',
    file_size_limit: 4 * 1024 * 1024, allowed_mime_types: ['application/gzip'], ...options.bucket };
  async function transport(url, request) {
    const target = new URL(url);
    const call = { method: request.method, pathname: target.pathname, url, request };
    calls.push(call);
    if (options.intercept) {
      const override = await options.intercept(call, { objects, bucket });
      if (override !== undefined) return override;
    }
    if (target.origin !== `https://${CONFIG.projectRef}.supabase.co`) throw new Error('Mock rejected host');
    if (request.redirect !== 'error') throw new Error('Mock requires no redirects');
    if (target.pathname === `/storage/v1/bucket/${CONFIG.bucket}` && request.method === 'GET') return json(bucket);
    const prefix = `/storage/v1/object/${CONFIG.bucket}/${CONFIG.namespace}/${CONFIG.tenantId}/`;
    if (!target.pathname.startsWith(prefix)) return json({ code: 'AccessDenied' }, 403);
    const name = target.pathname.slice(prefix.length);
    if (request.method === 'GET') {
      return objects.has(name) ? new Response(Buffer.from(objects.get(name))) : json({ code: 'NoSuchKey' }, 404);
    }
    if (request.method === 'POST') {
      if (request.headers['x-upsert'] !== 'false') throw new Error('Mock forbids upsert');
      if (request.body.length > bucket.file_size_limit) return json({ code: 'EntityTooLarge' }, 413);
      if (!bucket.allowed_mime_types.includes(request.headers['content-type'])) return json({ code: 'InvalidMimeType' }, 415);
      if (objects.has(name)) return json({ code: 'ResourceAlreadyExists' }, 409);
      objects.set(name, Buffer.from(request.body));
      return json({ Id: 'synthetic-object-id', Key: `${CONFIG.bucket}/${CONFIG.namespace}/${CONFIG.tenantId}/${name}` });
    }
    throw new Error('Mock forbids method');
  }
  async function credentials(scope) {
    credentialCalls.push(scope);
    return { apiKey: 'synthetic-api-key-not-real', accessToken: 'synthetic-access-token-not-real' };
  }
  return { transport, credentials, objects, calls, credentialCalls, bucket };
}

export async function transferFixture(options) {
  const root = await mkdtemp(join(tmpdir(), 'proesc-storage-mock-'));
  const local = await createLocalStore(join(root, 'source'));
  const descriptor = await archiveSyntheticRecords(local, CONTEXT, structuredClone(RECORDS));
  const mock = mockStorage(options);
  const remote = createSupabasePrivateStore(CONFIG, mock);
  return { root, local, descriptor, remote, mock };
}
