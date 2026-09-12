import { buildQueryUrl, normalizeRecord, parsePage, ProescError, queryProesc, validateConsultation } from './contract.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}
function rejects(operation: () => unknown) {
  try { operation(); } catch (error) { assert(error instanceof ProescError); return; }
  throw new Error('Expected rejection');
}
const filters = { unitId: '12', start: '2025-12', end: '2026-01' };
const cursor = { year: 2025, month: 12, page: 1 };

Deno.test('consulta explicita todos os meses e não filtra somente pendentes ou mensalidades', () => {
  const spec = validateConsultation({ resource: 'invoices', filters });
  assert(spec.cursor.month === 12);
  const url = buildQueryUrl(spec.resource, spec.filters, spec.cursor);
  assert(url.origin === 'https://api.proesc.com');
  assert(url.searchParams.get('expiration_year') === '2025');
  assert(url.searchParams.get('expiration_month') === '12');
  assert(!url.searchParams.has('status') && !url.searchParams.has('invoice_type_id'));
  rejects(() => validateConsultation({ resource: 'debits/create', filters }));
  rejects(() => validateConsultation({ resource: 'invoices', filters: { ...filters, end: '2025-11' } }));
  rejects(() => validateConsultation({ resource: 'invoices', filters: { ...filters, end: '2035-01' } }));
});

Deno.test('percorre todas as páginas antes de mudar mês e termina somente no mês final', () => {
  const first = parsePage({ current_page: 1, last_page: 2, data: [] }, 'invoices', filters, cursor);
  assert(first.nextCursor?.page === 2 && first.nextCursor.year === 2025);
  const second = parsePage({ current_page: 2, last_page: 2, data: [] }, 'invoices', filters, first.nextCursor);
  assert(second.nextCursor?.year === 2026 && second.nextCursor.month === 1 && second.nextCursor.page === 1);
  const end = parsePage([{ current_page: 1, last_page: 1, data: [] }], 'invoices', filters, second.nextCursor);
  assert(end.nextCursor === null);
});

Deno.test('resposta vazia ambígua, página errada e erro lógico nunca viram consulta completa', () => {
  for (const payload of [{}, [], { data: [] }, { current_page: 2, last_page: 2, data: [] },
    { current_page: 1, last_page: 1, data: [], success: false }]) {
    rejects(() => parsePage(payload, 'invoices', filters, cursor));
  }
});

Deno.test('dados pessoais selecionados e cobrança preservam identidade sem executar vínculo presumido', () => {
  const person = normalizeRecord('people', { id: 1, name: 'Pessoa fictícia', password: 'never-store',
    enrollments: [{ id: 10, class: { id: 42, name: 'T42' } }, { id: 11, class: { id: 40, name: 'T40' } }] });
  assert(Array.isArray(person.enrollments) && person.enrollments.length === 2);
  assert(!JSON.stringify(person).includes('never-store'));
  const row = normalizeRecord('invoices', { invoice_id: 9, invoice_group_id: 2, status: 'PAGA',
    discounts: { paid_invoice_amount: '125.00', payment_date: '2025-12-10', bank_slip: { external_gateway_id: 'external-9' } },
    access_token: 'never-store', aluno_id: 1 });
  assert(row.invoice_id === 9 && row.aluno_id === 1);
  assert(!JSON.stringify(row).includes('never-store'));
  assert((row.discounts as Record<string, unknown>).paid_invoice_amount === '125.00');
});

Deno.test('GET fixo, sem redirecionamento, não segue URLs de paginação fornecidas pelo Proesc', async () => {
  const result = await queryProesc('synthetic-token', 'invoices', filters, cursor, ((url, options) => {
    assert(new URL(String(url)).hostname === 'api.proesc.com');
    assert(options?.method === 'GET' && options.redirect === 'error');
    assert(new Headers(options.headers).get('Authorization') === 'Bearer synthetic-token');
    return Promise.resolve(Response.json({ current_page: 1, last_page: 2, next_page_url: 'https://evil.example/steal', data: [] }));
  }) as typeof fetch);
  assert(result.nextCursor?.page === 2);
});

Deno.test('falhas externas não devolvem conteúdo com credenciais; limite e timeout mantêm pendência', async () => {
  for (const status of [401, 403, 429, 500]) {
    try {
      await queryProesc('synthetic-token', 'invoices', filters, cursor,
        (() => Promise.resolve(new Response('SECRET_PROVIDER_DIAGNOSTIC', { status }))) as typeof fetch);
      throw new Error('Expected rejection');
    } catch (error) {
      assert(error instanceof ProescError);
      assert(!error.message.includes('SECRET') && !error.message.includes('synthetic-token'));
      assert(error.status === (status === 429 ? 429 : 502));
    }
  }
});
