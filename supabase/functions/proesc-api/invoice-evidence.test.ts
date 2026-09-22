import { collectInvoiceEvidence, invoiceScope } from './invoice-evidence.ts';
import type { SyncLink } from './sync-observation.ts';

const assert = (value: unknown, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const link: SyncLink = { linkId: 'link', classId: 'class', unitId: '1', sourceClassId: '2', externalKey: '3',
  receivableId: 'receivable', personHash: 'hash', dueDate: '2026-07-15', principalCents: 100,
  status: 'PENDENTE', paidCents: 0, paymentDate: null, expectedBefore: 'fingerprint' };
const credential = { token: 'synthetic-v2-token', revision: 'revision', wafHeader: null };
const admin = { rpc: async () => ({ error: null, data: credential }) };

Deno.test('V2 agrupa por unidade/mês e só publica escopo com todas as páginas', async () => {
  const urls: URL[] = [];
  const result = await collectInvoiceEvidence(admin, 'actor', [link, { ...link, linkId: 'other' }], async (input, init) => {
    const url = new URL(String(input)); urls.push(url);
    assert(init?.redirect === 'error' && init.method === 'GET');
    assert(url.searchParams.get('unit_id') === '1' && url.searchParams.get('expiration_month') === '7');
    const page = Number(url.searchParams.get('page'));
    return Response.json({ meta: { current_page: page, last_page: 2 }, data: [{ invoice_id: page === 1 ? 3 : 4 }] });
  }, new AbortController().signal);
  assert(urls.length === 2 && result.scopes.get(invoiceScope(link))?.length === 1);
});

Deno.test('falha na segunda página descarta até os candidatos encontrados na primeira', async () => {
  const result = await collectInvoiceEvidence(admin, 'actor', [link], async (input) =>
    new URL(String(input)).searchParams.get('page') === '1'
      ? Response.json({ current_page: 1, last_page: 2, data: [{ invoice_id: 3 }] })
      : new Response('provider error', { status: 503 }), new AbortController().signal);
  assert(result.scopes.size === 0);
});

Deno.test('rotação de conexão após a leitura invalida toda a evidência', async () => {
  let calls = 0;
  const changing = { rpc: async () => ({ error: null, data: { ...credential, revision: ++calls === 1 ? 'old' : 'new' } }) };
  const result = await collectInvoiceEvidence(changing, 'actor', [link], async () =>
    Response.json({ current_page: 1, last_page: 1, data: [{ invoice_id: 3 }] }), new AbortController().signal);
  assert(result.scopes.size === 0 && result.revision === '');
});

Deno.test('sem credencial ou com aborto não faz requisição nem revela erro bruto', async () => {
  let reads = 0;
  const transport: typeof fetch = async () => { reads++; throw new Error('secret-provider-token'); };
  const denied = { rpc: async () => ({ error: 'private', data: null }) };
  const a = await collectInvoiceEvidence(denied, 'actor', [link], transport, new AbortController().signal);
  const abort = new AbortController(); abort.abort();
  const b = await collectInvoiceEvidence(admin, 'actor', [link], transport, abort.signal);
  assert(reads === 0 && a.scopes.size === 0 && b.scopes.size === 0);
});
