import { collectProescV2Invoices, normalizeProescV2Invoice, parseProescV2InvoicePage,
  proescV2MoneyCents, readProescV2InvoicePage } from './v2-invoices.ts';
import { parseProescV2PeoplePage, readProescV2PeoplePage } from './v2-people.ts';

function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
async function rejects(operation: () => unknown | Promise<unknown>) {
  try { await operation(); } catch { return; }
  throw new Error('Expected rejection');
}
const query = { unitId: '1', year: 2026, month: 9, page: 1 };
const credential = { token: 'synthetic-v2-token', wafHeader: '11111111-1111-1111-1111-111111111111' };
const invoice = (id = 10) => ({
  invoice_id: id, person_id: 7, pessoa: { id: 7, cadastro_nacional: '01234567890', nome: 'DO_NOT_PERSIST' },
  matricula: { id: 8, turma_id: 9, ativa: false, data_saida: '2026-09-18' },
  due_date: '2026-09-15', original_invoice_amount: '279,90', updated_invoice_amount: '279,90',
  paid_invoice_amount: '260,00', payment_date: '2026-09-15', status: 'PAGA',
  invoice_group_id: 11, order: 2, invoice_group_total: 12,
  discounts: { fixed_discount_amount: '19,90', early_payment_discount: {
    early_payment_discount_amount: '19,90', early_payment_discount_percentage: '7.1',
  } }, late_payment_fees: { fine: '2', interest: '0.033' }, bank_slip: { barcode_line: 'DO_NOT_PERSIST' },
});
const envelope = (data: unknown[], page = 1, lastPage = 1, total = data.length) => ({
  data, meta: { current_page: page, last_page: lastPage, total },
});

Deno.test('V2 dinheiro PTBR/decimal exato preserva centavos e rejeita ambiguidades', async () => {
  assert(proescV2MoneyCents('279,90') === 27990);
  assert(proescV2MoneyCents('1.234,56') === 123456);
  assert(proescV2MoneyCents('279.90') === 27990);
  assert(proescV2MoneyCents(0) === 0);
  assert(proescV2MoneyCents('-19,90') === -1990);
  for (const value of [null, '', '1.234', '1,234.56', 'NaN', Infinity, 1.999, '99999999999999']) {
    await rejects(() => proescV2MoneyCents(value));
  }
});

Deno.test('V2 usa vínculo raiz real, documento comzero e configuração não é saldo ou desconto somado', () => {
  const result = normalizeProescV2Invoice(invoice(), query);
  assert(result.invoiceId === '10' && result.sourceEnrollmentId === '8' && result.sourceClassId === '9');
  assert(result.studentDocument === '01234567890' && result.personId === '7');
  assert(result.paidCents === 26000 && result.principalCents === 27990 && result.reviewReasons.length === 0);
  assert(result.financialConfiguration.fineRate === '2' && result.financialConfiguration.interestRate === '0.033');
  assert(result.financialConfiguration.fixedDiscountCents === 1990 && result.financialConfiguration.earlyDiscountCents === 1990);
  const text = JSON.stringify(result);
  assert(!text.includes('DO_NOT_PERSIST') && !text.includes('updated') && !text.includes('balance'));
  assert(!text.includes('CANCEL') && !text.includes('data_saida'));
});

Deno.test('V2 parcial/superior nunca viram baixa nem saldo e ausência não vira zero', () => {
  for (const status of ['PAGAMENTO PARCIAL', 'PAGAMENTO SUPERIOR']) {
    const result = normalizeProescV2Invoice({ ...invoice(), status, paid_invoice_amount: '286,12' }, query);
    assert(result.sourceStatus === status && result.paidCents === 28612 && result.reviewReasons.length === 1);
  }
  const missing = normalizeProescV2Invoice({ ...invoice(), paid_invoice_amount: null }, query);
  assert(missing.paidCents === null && missing.reviewReasons.includes('MISSING_PAID_AMOUNT'));
  const open = normalizeProescV2Invoice({ ...invoice(), status: 'VENCIDO', paid_invoice_amount: '0,00', payment_date: null }, query);
  assert(open.reviewReasons.length === 0 && open.sourceStatus === 'VENCIDO');
  const unknown = normalizeProescV2Invoice({ ...invoice(), status: 'FORNECEDOR_NOVO' }, query);
  assert(unknown.sourceStatus === 'UNKNOWN' && unknown.reviewReasons.includes('UNKNOWN_SOURCE_STATUS'));
});

Deno.test('V2 rejeita período/pessoa/identificador duplicado/data inválida e conserva conflitos para revisão', async () => {
  for (const patch of [{ due_date: '2026-08-15' }, { due_date: '2026-09-31' }, { invoice_id: 0 }]) {
    await rejects(() => normalizeProescV2Invoice({ ...invoice(), ...patch }, query));
  }
  await rejects(() => normalizeProescV2Invoice(invoice(), { ...query, personId: '99' }));
  await rejects(() => parseProescV2InvoicePage(envelope([invoice(), invoice()]), query));
  const conflict = normalizeProescV2Invoice({ ...invoice(), pessoa: { id: 99, cadastro_nacional: '01234567890' } }, query);
  assert(conflict.reviewReasons.includes('CONFLICTING_PERSON_IDENTITY'));
  await rejects(() => normalizeProescV2Invoice({ ...invoice(), discounts: { fixed_discount_amount: '-1,00' } }, query));
  await rejects(() => normalizeProescV2Invoice({ ...invoice(), original_invoice_amount: '1000000000000,00' }, query));
  await rejects(() => parseProescV2InvoicePage(envelope(Array.from({ length: 101 }, (_, i) => invoice(i + 1))), query));
});

Deno.test('V2 GET usa mês09 BearerWAF página própria e nunca segue URLremota', async () => {
  const result = await readProescV2InvoicePage({ ...query, ...credential, transport: ((input, init) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://api.proesc.com' && url.pathname === '/api/v2/invoices');
    assert(url.searchParams.get('expiration_month') === '09' && url.searchParams.get('unit_id') === '1');
    const headers = new Headers(init?.headers);
    assert(headers.get('authorization') === 'Bearer synthetic-v2-token' && headers.get('x-proesc-waf') === credential.wafHeader);
    assert(init?.redirect === 'error' && init.method === 'GET');
    return Promise.resolve(Response.json({ ...envelope([invoice()]), links: { next: 'https://evil.invalid/' } }));
  }) as typeof fetch });
  assert(result.records.length === 1);
});

Deno.test('V2 coletor só retorna inventário completo com totalestável e IDsúnicos entre páginas', async () => {
  const transport = ((input) => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    return Promise.resolve(Response.json(envelope([invoice(page)], page, 2, 2)));
  }) as typeof fetch;
  const result = await collectProescV2Invoices({ ...query, ...credential, transport });
  assert(result.complete && result.total === 2 && result.pages === 2);
  for (const mode of ['duplicate', 'drift', 'short', 'wrong_page', 'limit']) {
    await rejects(() => collectProescV2Invoices({ ...query, ...credential, maxPages: mode === 'limit' ? 1 : 2,
      transport: ((input) => {
        const page = Number(new URL(String(input)).searchParams.get('page'));
        return Promise.resolve(Response.json(envelope([invoice(mode === 'duplicate' ? 1 : page)],
          mode === 'wrong_page' ? 2 : page, 2, mode === 'drift' && page === 2 ? 3 : mode === 'short' ? 3 : 2)));
      }) as typeof fetch }));
  }
});

Deno.test('V2 erros de rede/HTTP/payload ficam sanitizados e não viram coleção vazia', async () => {
  for (const transport of [
    (() => { throw new Error('secret-token-provider'); }) as typeof fetch,
    (() => Promise.resolve(new Response('secret-token-provider', { status: 403 }))) as typeof fetch,
    (() => Promise.resolve(new Response('secret-token-provider'))) as typeof fetch,
    (() => Promise.resolve(Response.json(envelope([], 1, 2, 20)))) as typeof fetch,
  ]) {
    try { await readProescV2InvoicePage({ ...query, ...credential, transport }); }
    catch (error) { assert(error instanceof Error && !error.message.includes('secret-token-provider')); continue; }
    throw new Error('Expected rejection');
  }
});

Deno.test('V2 pessoas minimiza dados e prova matrículas sem deduzir estadoacadêmico', async () => {
  const payload = envelope([{ id: 7, cpf_number: '01234567890', name: 'DO_NOT_PERSIST',
    enrollments: [{ id: 8, class: { id: 9, name: 'DO_NOT_PERSIST' } }] }]);
  const result = await readProescV2PeoplePage({ ...credential, unitId: '1', page: 1,
    transport: ((input) => {
      const url = new URL(String(input));
      assert(url.pathname === '/api/v2/people' && url.searchParams.get('limit') === '50');
      return Promise.resolve(Response.json(payload));
    }) as typeof fetch });
  assert(result.records[0].studentDocument === '01234567890');
  assert(result.records[0].enrollments[0].sourceClassId === '9');
  assert(!JSON.stringify(result).includes('DO_NOT_PERSIST'));
  await rejects(() => parseProescV2PeoplePage(envelope([{ id: 7 }]), { unitId: '1', page: 1 }));
});
