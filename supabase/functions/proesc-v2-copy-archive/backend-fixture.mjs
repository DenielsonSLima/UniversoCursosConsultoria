import { copyExportFixture, createV2CopyHttpFixture, BATCH } from '../../review-drafts/proesc-v2-growth/archive/v2-copy-fixture.mjs';
import { COPY_PROJECT_REF } from './handler.mjs';

export const SECRET = 'a'.repeat(64), SERVICE_KEY = 'synthetic-service-role-not-real';
export const ORIGIN = `https://${COPY_PROJECT_REF}.supabase.co`;
export const requestFor = (body = JSON.stringify({ batchId: BATCH }), headers = {}, signal) => new Request('https://handler.invalid/', {
  method: 'POST', body, headers: { 'content-type': 'application/json', 'X-Proesc-Sync-Secret': SECRET, ...headers }, signal,
});
export function backendFixture(options = {}) {
  const storage = createV2CopyHttpFixture({ config: { projectRef: COPY_PROJECT_REF }, ...options.storage });
  const source = { ...copyExportFixture(), projectRef: COPY_PROJECT_REF }, rpcCalls = [];
  let catalog;
  async function fetchImpl(input, init) {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== ORIGIN || init.redirect !== 'error' || !init.signal) throw new Error('Mock transport guard');
    if (url.pathname.startsWith('/storage/v1/')) return storage.transport(input, init);
    const call = { name: url.pathname.split('/').at(-1), args: JSON.parse(init.body), init, url: url.href };
    rpcCalls.push(call);
    if (options.intercept) {
      const response = await options.intercept(call);
      if (response !== undefined) return response;
    }
    let result;
    if (call.name === 'proesc_v2_worker_service') {
      if (call.args.p_action !== 'authorize' || call.args.p_payload?.key !== SECRET) return new Response('{}', { status: 403 });
      result = { actorId: BATCH };
    } else if (call.name === 'proesc_v2_export_copy_service') {
      if (call.args.p_batch !== BATCH) return new Response('{}', { status: 400 });
      result = source;
    } else if (call.name === 'proesc_v2_record_copy_receipt_service') {
      if (call.args.p_batch !== BATCH || !storage.objects.has(call.args.p_receipt?.manifestObjectName)) return new Response('{}', { status: 400 });
      if (catalog && JSON.stringify(catalog) !== JSON.stringify(call.args.p_receipt)) return new Response('{}', { status: 409 });
      catalog = call.args.p_receipt;
      result = { batchId: BATCH, status: 'COPY_RECEIPT_RECORDED', copyOnly: true };
    } else throw new Error('Unexpected RPC');
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  }
  return { ...storage, source, rpcCalls, fetchImpl, get catalog() { return catalog; } };
}
// Used for local protocol tests only. The Deno SDK contract imports the real pinned SDK instead.
export function fakeCreateClient(url, key, options) {
  return { rpc(name, args) { return { async abortSignal(signal) {
    const response = await options.global.fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(args), signal,
    });
    const data = await response.json();
    return response.ok ? { data, error: null } : { data: null, error: { message: 'synthetic failure' } };
  } }; } };
}
