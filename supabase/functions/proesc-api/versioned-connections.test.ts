import { connectionToken, v2Headers } from './connection-contract.ts';
import { handleConnectionAction } from './connections.ts';
import { readProescOperation } from './operations.ts';
import { createProescV2Client } from './v2-client.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(action: () => unknown, expected: string) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && error.message.includes(expected)); return;
  }
  throw new Error('expected rejection');
}
const waf = '00000000-0000-0000-0000-000000000001';
const v1 = 'a'.repeat(32);
const v2 = 'synthetic-v2-bearer';
const filters = { unitId: '1', start: '2026-09', end: '2026-09' };
const cursor = { year: 2026, month: 9, page: 1 };
const noNetwork: typeof fetch = () => { throw new Error('network must not be called'); };
function fixture(result: Record<string, unknown> = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const admin = { rpc(name: string, args: Record<string, unknown>) {
    assert(name === 'proesc_connection_service');
    calls.push(args);
    return Promise.resolve({ data: result });
  } };
  return { admin, calls };
}

Deno.test('versões não aceitam a credencial da outra conexão; WAF só entra em headers V2', async () => {
  assert(connectionToken('v1', v1) === v1);
  assert(connectionToken('v2', `Bearer ${v2}`) === v2);
  await rejects(() => connectionToken('v1', v2), 'V1');
  await rejects(() => connectionToken('v2', v1), 'V2');
  await rejects(() => v2Headers(v2, 'unsafe\r\nheader'), 'liberação');
  const headers = v2Headers(v2, waf);
  assert(headers.Authorization === `Bearer ${v2}` && headers['x-proesc-waf'] === waf);
});

Deno.test('status e gravação projetam só metadados, isolam versão e ignoram intenção forjada', async () => {
  for (const version of ['v1', 'v2']) {
    const { admin, calls } = fixture({ configured: true, token: 'PRIVATE', revision: 'PRIVATE',
      wafHeader: 'PRIVATE', wafConfigured: true, updatedAt: '2026-09-18T00:00:00Z' });
    const status = await handleConnectionAction(admin, 'actor', { action: 'connection_status', version,
      p_action: 'credential', token: 'forged' }, noNetwork);
    assert(!JSON.stringify(status).includes('PRIVATE'));
    assert((status as { wafConfigured: boolean }).wafConfigured === (version === 'v2'));
    assert(calls[0].p_action === 'status' && calls[0].p_actor_id === 'actor');
    assert(JSON.stringify(calls[0].p_payload) === JSON.stringify({ version }));
    const saved = await handleConnectionAction(admin, 'actor', { action: 'save_connection', version,
      token: version === 'v1' ? v1 : v2, ...(version === 'v2' ? { wafHeader: waf } : {}) }, noNetwork);
    assert(JSON.stringify(saved) === JSON.stringify({ version, configured: true }));
    assert((calls[1].p_payload as { version: string }).version === version);
    await handleConnectionAction(admin, 'actor', { action: 'remove_connection', version }, noNetwork);
    assert(calls[2].p_action === 'remove');
  }
});

Deno.test('versão inválida, token cruzado e WAF na V1 são recusados antes da RPC', async () => {
  for (const body of [
    { action: 'connection_status', version: 'v3' },
    { action: 'save_connection', version: 'v1', token: v2 },
    { action: 'save_connection', version: 'v2', token: v1 },
    { action: 'save_connection', version: 'v1', token: v1, wafHeader: waf },
  ]) {
    const { admin, calls } = fixture();
    await rejects(() => handleConnectionAction(admin, 'actor', body, noNetwork), 'conexão');
    assert(calls.length === 0);
  }
});

Deno.test('teste V2 usa token e WAF do servidor, com ou sem WAF, sem revelar registros', async () => {
  for (const wafHeader of [waf, null]) {
    const { admin, calls } = fixture({ token: v2, wafHeader, revision: 'r1' });
    let requests = 0;
    const transport: typeof fetch = (input, init) => {
      requests++;
      const url = new URL(String(input));
      assert(url.origin === 'https://api.proesc.com' && !url.searchParams.has('token'));
      assert(init?.method === 'GET' && init.redirect === 'error');
      const headers = new Headers(init.headers);
      assert(headers.get('Authorization') === `Bearer ${v2}`);
      assert(headers.get('x-proesc-waf') === wafHeader);
      return Promise.resolve(Response.json({ data: [{ id: 'PRIVATE_STUDENT' }], meta: { current_page: 1, last_page: 1 } }));
    };
    const result = await handleConnectionAction(admin, 'actor', { action: 'test_connection', version: 'v2',
      token: 'forged', wafHeader: 'forged' }, transport);
    assert((result as { ok: boolean }).ok && requests === 1 && calls.length === 2);
    assert(!JSON.stringify(result).includes('PRIVATE') && !JSON.stringify(result).includes(v2));
    assert(calls.every((call) => (call.p_payload as { version: string }).version === 'v2'));
  }
});

Deno.test('mudança de credencial durante consulta invalida retorno e erro SQL é sanitizado', async () => {
  let revision = 0;
  const admin = { rpc: () => Promise.resolve({ data: { token: v2, revision: `r${++revision}` } }) };
  await rejects(() => handleConnectionAction(admin, 'actor', { action: 'test_connection', version: 'v2' },
    () => Promise.resolve(Response.json({ data: [] }))), 'mudou');
  const failed = { rpc: () => Promise.resolve({ error: { message: 'PRIVATE_SECRET' } }) };
  await rejects(() => handleConnectionAction(failed, 'actor', { action: 'connection_status', version: 'v2' }, noNetwork),
    'Não foi possível');
});

Deno.test('V2 interpreta meta, usa WAF e mantém paginação no host fixo', async () => {
  const client = createProescV2Client({ token: v2, wafHeader: waf, transport: (input, init) => {
    assert(new URL(String(input)).origin === 'https://api.proesc.com');
    assert(new Headers(init?.headers).get('x-proesc-waf') === waf);
    return Promise.resolve(Response.json({ data: [{ id: 1, name: 'Synthetic' }],
      links: { next: 'https://untrusted.invalid/steal' }, meta: { current_page: 1, last_page: 2 } }));
  } });
  const page = await client.readPage('people', filters, cursor);
  assert(page.nextCursor?.page === 2 && page.records.length === 1);
  const conflict = createProescV2Client({ token: v2, transport: () => Promise.resolve(Response.json({
    data: [], current_page: 1, last_page: 1, meta: { current_page: 1, last_page: 2 },
  })) });
  await rejects(() => conflict.readPage('people', filters, cursor), 'conflitante');
});

Deno.test('seleção de operação usa V1 para legado e V2 para pessoas sem fallback no 403', async () => {
  for (const operation of ['legacy_configuration', 'people'] as const) {
    const { admin, calls } = fixture({ token: operation === 'people' ? v2 : v1, revision: 'r1' });
    let networkCalls = 0;
    await rejects(() => readProescOperation(admin, 'actor', operation === 'people'
      ? { operation, filters, cursor } : { operation }, (input) => {
        networkCalls++;
        assert(String(input).startsWith(operation === 'people' ? 'https://api.proesc.com/api/v2/' : 'https://app.proesc.com/api/v1/'));
        return Promise.resolve(new Response('', { status: 403 }));
      }), 'Proesc');
    assert(networkCalls === 1 && calls.length === 1);
    assert((calls[0].p_payload as { version: string }).version === (operation === 'people' ? 'v2' : 'v1'));
  }
});
