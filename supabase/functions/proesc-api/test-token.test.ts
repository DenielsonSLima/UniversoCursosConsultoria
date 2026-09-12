import { testProescToken } from './test-token.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const now = new Date('2026-09-12T15:00:00Z');

Deno.test('teste usa somente GET fixo de pessoas e parcelas e devolve apenas diagnóstico', async () => {
  const requests: URL[] = [];
  const fetcher: typeof fetch = (input, options) => {
    const url = new URL(String(input)); requests.push(url);
    assert(url.origin === 'https://api.proesc.com');
    assert(options?.method === 'GET' && options.redirect === 'error');
    assert(new Headers(options.headers).get('Authorization') === 'Bearer synthetic-proesc-secret');
    return Promise.resolve(Response.json({ current_page: 1, last_page: 3,
      data: [{ id: 'private-fixture-id', name: 'PRIVATE_FIXTURE_NAME', token: 'SECRET_RESPONSE' }] }));
  };
  const result = await testProescToken('synthetic-proesc-secret', fetcher, now);
  assert(result.ok && result.checks.length === 2 && requests.length === 2);
  assert(requests[0].pathname === '/api/v2/people' && requests[0].searchParams.get('page') === '1');
  assert(requests[1].pathname === '/api/v2/invoices' && requests[1].searchParams.get('expiration_year') === '2026');
  assert(requests[1].searchParams.get('expiration_month') === '9');
  assert(!requests[1].searchParams.has('invoice_type_id'));
  const text = JSON.stringify(result);
  assert(!text.includes('PRIVATE') && !text.includes('SECRET') && !text.includes('synthetic-proesc-secret'));
});

Deno.test('401,403,429 e 5xx mantêm status real sem expor corpo externo ou afirmar token inválido no 403', async () => {
  for (const status of [401, 403, 429, 500]) {
    const fetcher: typeof fetch = () => Promise.resolve(new Response('SECRET_RESPONSE', { status }));
    const result = await testProescToken('synthetic-proesc-secret', fetcher, now);
    assert(!result.ok && result.checks.every((check) => check.status === status && !check.ok));
    assert(!JSON.stringify(result).includes('SECRET_RESPONSE'));
    if (status === 403) assert(!result.checks[0].message.includes('inválido'));
  }
});

Deno.test('erro lógico, HTML 200, rede, payload excessivo e permissão parcial não passam como sucesso', async () => {
  for (const make of [() => Response.json({ success: false, data: [] }),
    () => new Response('<html>SECRET_RESPONSE</html>'),
    () => new Response('x'.repeat(4_000_001))]) {
    const result = await testProescToken('synthetic-proesc-secret', () => Promise.resolve(make()), now);
    assert(!result.ok && !JSON.stringify(result).includes('SECRET_RESPONSE'));
  }
  const network = await testProescToken('synthetic-proesc-secret', () => Promise.reject(new Error('SECRET_RESPONSE')), now);
  assert(!network.ok && network.checks.every((check) => check.status === 0));
  const partial = await testProescToken('synthetic-proesc-secret', (url) => Promise.resolve(
    String(url).includes('/people?') ? Response.json([{ data: [] }]) : new Response('', { status: 403 })), now);
  assert(!partial.ok && partial.checks[0].ok && !partial.checks[1].ok);
});
