import { runProescInvoiceDiagnostic } from './diagnostic-invoices.ts';
import { createHandler } from './handler.ts';
import { ProescError } from './contract.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
const query = { action: 'internal_invoice_probe', unitId: '1', year: 2026, month: 9 };
const workerKey = 'b'.repeat(64);
const token = 'synthetic-private-v2-diagnostic-token';
const wafHeader = '00000000-0000-0000-0000-000000000007';
let fixtureNumber = 0;

function fixture(options: { authorized?: boolean; rotate?: boolean; dbFailure?: boolean } = {}) {
  const actorId = `invoice-diagnostic-actor-${++fixtureNumber}`;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let credentialReads = 0;
  const admin = {
    auth: { getUser() { throw new Error('Internal probe must not authenticate a public session'); } },
    from() { throw new Error('No direct tables or writes are allowed'); },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'proesc_internal_probe_service') {
        assert(args.p_action === 'authorize');
        assert(JSON.stringify(args.p_payload) === JSON.stringify({ key: workerKey }));
        return Promise.resolve(options.authorized === false ? { error: { message: token } } : { data: { actorId } });
      }
      assert(name === 'proesc_connection_service', `Unexpected RPC: ${name}`);
      assert(args.p_action === 'credential' && args.p_actor_id === actorId);
      assert(JSON.stringify(args.p_payload) === '{"version":"v2"}');
      credentialReads++;
      if (options.dbFailure) return Promise.resolve({ error: { message: `${token} ${wafHeader}` } });
      return Promise.resolve({ data: {
        token, wafHeader, revision: options.rotate ? `revision-${credentialReads}` : 'revision-1',
      } });
    },
  };
  return { admin, actorId, calls };
}

function page(rows: unknown[], lastPage = 1) {
  return Response.json({ data: rows, meta: { current_page: 1, last_page: lastPage },
    links: { next: 'https://never-follow.invalid/private' } });
}

const invoice = {
  invoice_id: 101, status: 'EM ABERTO', due_date: '2026-09-20', original_invoice_amount: '300.00',
  paid_invoice_amount: '4.00', payment_date: '2026-09-21',
  discounts: { paid_invoice_amount: '3.00', payment_date: '2026-09-19' },
};
const noNetwork: typeof fetch = () => { throw new Error('Network must not be called'); };
const request = (body: unknown, key: string | null = workerKey) => new Request('https://local.invalid/proesc-api', {
  method: 'POST', headers: key ? { 'X-Proesc-Worker-Secret': key } : { Authorization: 'Bearer public-session' },
  body: JSON.stringify(body),
});

async function rejects(action: () => unknown, status: number) {
  try { await action(); } catch (error) {
    assert(error instanceof ProescError && error.status === status);
    assert(!error.message.includes(token) && !error.message.includes(wafHeader) && !error.message.includes('https://'));
    return error;
  }
  throw new Error('Expected rejection');
}

Deno.test('invoice probe exige chave interna autorizada antes de credenciais ou rede', async () => {
  for (const key of [null, 'invalid', workerKey]) {
    const f = fixture({ authorized: false });
    const response = await createHandler(f.admin, noNetwork)(request(query, key));
    assert(response.status === 403);
    assert(f.calls.length === (key === workerKey ? 1 : 0));
    assert(!(await response.text()).includes(token));
  }
});

Deno.test('invoice probe aceita somente período/unidade explícitos e página1 antes da leitura V2', async () => {
  for (const invalid of [
    {}, { ...query, unitId: '' }, { ...query, unitId: 1 }, { ...query, unitId: '1&token=forged' },
    { ...query, year: '2026' }, { ...query, year: 1999 }, { ...query, year: 2100 },
    { ...query, month: 0 }, { ...query, month: 13 }, { ...query, month: 1.5 },
    { ...query, page: 2 }, { ...query, resource: 'people' }, { ...query, token: 'forged' },
    { ...query, p_actor_id: 'forged' }, { ...query, includeIdentities: true },
    { ...query, allUnits: true }, { ...query, allUnits: false }, { ...query, allUnits: 'true' },
    { action: query.action, year: 2026, month: 9 },
    { action: query.action, year: 2026, month: 9, allUnits: false },
    { ...query, unitId: null, allUnits: true },
    { ...query, unitId: '', allUnits: true },
  ]) {
    const f = fixture();
    await rejects(() => runProescInvoiceDiagnostic(f.admin, f.actorId, invalid, noNetwork), 400);
    assert(f.calls.length === 0);
  }
});

Deno.test('invoice probe usa GET V2, revisão da conexão, redirecionamento bloqueado e uma página', async () => {
  const f = fixture();
  let requests = 0;
  const transport: typeof fetch = (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert(url.origin === 'https://api.proesc.com' && url.pathname === '/api/v2/invoices');
    assert(url.searchParams.size === 4 && url.searchParams.get('page') === '1');
    assert(url.searchParams.get('unit_id') === '1' && url.searchParams.get('expiration_year') === '2026');
    assert(url.searchParams.get('expiration_month') === '9' && !url.searchParams.has('token'));
    assert(init?.method === 'GET' && init.redirect === 'error' && init.signal !== undefined);
    const headers = new Headers(init.headers);
    assert(headers.get('Authorization') === `Bearer ${token}` && headers.get('x-proesc-waf') === wafHeader);
    return Promise.resolve(page([invoice], 8));
  };
  const response = await createHandler(f.admin, transport)(request({ ...query, page: 1 }));
  const result = await response.json();
  assert(response.status === 200 && response.headers.get('Cache-Control') === 'no-store');
  assert(result.version === 'v2' && result.operation === 'invoices' && result.readOnly === true);
  assert(result.identityMapping === 'NOT_ASSESSED' && result.currentPage === 1 && result.lastPage === 8);
  assert(result.period === '2026-09' && result.hasMorePages === true && requests === 1);
  assert(result.unitFilter === 'EXACT');
  assert(f.calls.length === 3 && f.calls[0].name === 'proesc_internal_probe_service');
  assert(result.candidates[0].paid_invoice_amount === '4.00');
  assert(result.candidates[0].discounts.paid_invoice_amount === '3.00');
  assert(result.candidates[0].payment_date === '2026-09-21');
  assert(result.candidates[0].discounts.payment_date === '2026-09-19');
});

Deno.test('invoice probe consulta todas as unidades somente por opção explícita e omite unit_id', async () => {
  const f = fixture();
  let requests = 0;
  const transport: typeof fetch = (input, init) => {
    requests++;
    const url = new URL(String(input));
    assert(url.origin === 'https://api.proesc.com' && url.pathname === '/api/v2/invoices');
    assert(url.searchParams.size === 3 && !url.searchParams.has('unit_id'));
    assert(url.searchParams.get('page') === '1' && url.searchParams.get('expiration_year') === '2026');
    assert(url.searchParams.get('expiration_month') === '9');
    assert(init?.method === 'GET' && init.redirect === 'error');
    return Promise.resolve(page([invoice]));
  };
  const response = await createHandler(f.admin, transport)(request({
    action: 'internal_invoice_probe', allUnits: true, year: 2026, month: 9,
  }));
  const result = await response.json();
  assert(response.status === 200 && requests === 1 && f.calls.length === 3);
  assert(result.unitFilter === 'ALL_UNITS' && result.rowCount === 1 && result.identityMapping === 'NOT_ASSESSED');
  assert(result.currentPage === 1 && result.period === '2026-09' && result.readOnly === true);
  assert(!Object.hasOwn(result, 'unitId'));
});

Deno.test('invoice probe limita20 candidatos e não expõe nomes, documentos, boleto, Pix ou campos arbitrários', async () => {
  const f = fixture();
  const rows = Array.from({ length: 25 }, (_, index) => ({ ...invoice, invoice_id: 101 + index,
    status: ['VENCIDO', 'PAGA', 'EM ABERTO'][index % 3],
    name: 'PRIVATE_PERSON', cpf_number: 'PRIVATE_DOCUMENT', description: 'PRIVATE_DESCRIPTION',
    student_id: 998, person_id: 999, token, [token]: 'unexpected field',
    bank_slip: { external_gateway_url: `https://private.invalid/${token}`, barcode_line: 'PRIVATE_BARCODE',
      pix: { pix_text: 'PRIVATE_PIX', pix_qrcode: 'PRIVATE_IMAGE' } },
  }));
  const result = await runProescInvoiceDiagnostic(f.admin, f.actorId, query, () => Promise.resolve(page(rows)));
  assert(result.rowCount === 25 && result.candidateLimit === 20 && result.candidates.length === 20);
  assert(result.candidatesTruncated === true && result.hasMorePages === false);
  assert(result.statusCounts.VENCIDO === 9 && result.statusCounts.PAGA === 8 && result.statusCounts['EM ABERTO'] === 8);
  assert(result.fieldPresence.status === 25 && result.fieldPresence['discounts.paid_invoice_amount'] === 25);
  const output = JSON.stringify(result);
  for (const forbidden of [token, wafHeader, 'PRIVATE_', 'https://', '998', '999', 'cpf_number']) {
    assert(!output.includes(forbidden), `Unexpected content: ${forbidden}`);
  }
  assert(f.calls.length === 2);
});

Deno.test('invoice probe não ecoa conteúdo inesperado em campos financeiros nem assume status ausente', async () => {
  const f = fixture();
  const result = await runProescInvoiceDiagnostic(f.admin, f.actorId, query, () => Promise.resolve(page([
    { invoice_id: token, status: token, due_date: token, original_invoice_amount: token,
      paid_invoice_amount: token, payment_date: token, discounts: { paid_invoice_amount: token, payment_date: token } },
    { invoice_id: 102 },
  ])));
  assert(result.statusCounts.UNRECOGNIZED === 1 && result.statusCounts.MISSING === 1);
  assert(result.candidates.every((row) => row.status === null));
  assert(result.candidates[0].invoice_id === null && result.candidates[0].original_invoice_amount === null);
  assert(!JSON.stringify(result).includes(token));
});

Deno.test('invoice probe invalida mudança de revisão sem retornar candidatos', async () => {
  const f = fixture({ rotate: true });
  await rejects(() => runProescInvoiceDiagnostic(f.admin, f.actorId, query, () => Promise.resolve(page([invoice]))), 409);
  assert(f.calls.length === 2);
});

Deno.test('invoice probe sanitiza erros RPC, transporte, HTTP, JSON, envelope e paginação', async () => {
  const db = fixture({ dbFailure: true });
  await rejects(() => runProescInvoiceDiagnostic(db.admin, db.actorId, query, noNetwork), 409);
  for (const transport of [
    (() => { throw new Error(`https://private.invalid/?token=${token} ${wafHeader}`); }) as typeof fetch,
    (() => Promise.resolve(new Response(token, { status: 302, headers: { Location: `https://private.invalid/${token}` } }))) as typeof fetch,
    (() => Promise.resolve(new Response(token, { status: 502 }))) as typeof fetch,
    (() => Promise.resolve(new Response(token))) as typeof fetch,
    (() => Promise.resolve(Response.json({ status: 'error', message: token, data: [] }))) as typeof fetch,
    (() => Promise.resolve(Response.json({ data: [invoice], meta: { current_page: 2, last_page: 2 } }))) as typeof fetch,
  ]) {
    const f = fixture();
    await rejects(() => runProescInvoiceDiagnostic(f.admin, f.actorId, query, transport), 502);
  }
  const limited = fixture();
  await rejects(() => runProescInvoiceDiagnostic(limited.admin, limited.actorId, query,
    () => Promise.resolve(new Response(token, { status: 429 }))), 429);
});

Deno.test('invoice probe limita5 consultas por ator/minuto sem nova consulta após limite', async () => {
  const f = fixture();
  let requests = 0;
  const handler = createHandler(f.admin, () => { requests++; return Promise.resolve(page([])); });
  for (let index = 0; index < 6; index++) {
    const response = await handler(request(query));
    assert(response.status === (index < 5 ? 200 : 429));
  }
  assert(requests === 5);
  assert(f.calls.filter(({ name }) => name === 'proesc_connection_service').length === 10);
});

Deno.test('invoice probe distingue acesso403, transporte/prazo, serviço5xx e formato sem ecoar conteúdo', async () => {
  const cases: Array<{ transport: typeof fetch; message: string }> = [
    { transport: () => Promise.resolve(new Response(token, { status: 403 })), message: 'recusou o acesso (HTTP 403)' },
    { transport: () => { throw new globalThis.DOMException(`${token} ${wafHeader}`, 'TimeoutError'); }, message: 'não respondeu ou excedeu o prazo' },
    { transport: () => Promise.resolve(new Response(token, { status: 503 })), message: 'falhou (HTTP 503)' },
    { transport: () => Promise.resolve(Response.json({ data: [], meta: { current_page: 2, last_page: 2 } })), message: 'paginação' },
  ];
  for (const { transport, message } of cases) {
    const f = fixture();
    const error = await rejects(() => runProescInvoiceDiagnostic(f.admin, f.actorId, query, transport), 502);
    assert(error.message.includes(message));
  }
});
