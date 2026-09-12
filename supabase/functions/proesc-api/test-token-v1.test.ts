import { testProescToken } from './test-token.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const token = '0123456789abcdef0123456789abcdef';
const now = new Date('2030-05-12T15:00:00Z');
const configuration = (units = [{ id: 9001, unidade: 'UNIDADE SINTETICA' }]) => ({
  status: 'success', units, academic_years: [{ id: 2030, name: '2030' }], categories: [],
});
const accounting = () => ({ status: 'success', data: [{
  chave_id: 7001, id: 2, unidade_id: 9001, turma_id: 8001, aluno_cpf: '01234567890',
  valor: '199.29', data_vencimento: '2030-02-10', data_pagamento: '2030-05-11',
  registro_cancelado: false, pagamento_renegociacao: false,
}] });

Deno.test('token geral 32hex usa V1 configuração e contabilidade sequenciais, sem prometer acesso a pessoas', async () => {
  const requests: string[] = [];
  const result = await testProescToken(token, (input, options) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://app.proesc.com' && options?.method === 'GET' && options.redirect === 'error');
    assert(url.searchParams.get('token') === token && !new Headers(options.headers).has('Authorization'));
    requests.push(url.pathname);
    if (url.pathname.endsWith('/configuration_data')) return Promise.resolve(Response.json(configuration()));
    assert(requests.join(',') === '/api/v1/configuration_data,/api/v1/accounting_data');
    assert(url.searchParams.get('unidade_id') === '9001' && url.searchParams.get('ano_letivo') === '2030');
    assert(url.searchParams.get('mes') === '05');
    return Promise.resolve(Response.json(accounting()));
  }, now);
  assert(result.ok && requests.length === 2 && result.checks.length === 1);
  assert(result.checks[0].resource === 'invoices' && result.checkedAt === now.toISOString());
  const text = JSON.stringify(result);
  assert(!text.includes('people') && !text.includes('pessoas'));
  assert(!text.includes(token) && !text.includes('01234567890') && !text.includes('UNIDADE SINTETICA'));
});

Deno.test('configuração com erro lógico HTTP200 interrompe teste financeiro e omite corpo externo', async () => {
  let calls = 0;
  const result = await testProescToken(token, () => {
    calls++;
    return Promise.resolve(Response.json({ status: 'error', description: `unit id required ${token}` }));
  }, now);
  assert(!result.ok && calls === 1 && result.checks[0].status === 200);
  assert(result.message.includes('não foi executada') && !JSON.stringify(result).includes(token));
});

Deno.test('unidade ausente ou ambígua não autoriza escolher uma unidade automaticamente', async () => {
  for (const units of [[], [{ id: 9001, unidade: 'A' }, { id: 9002, unidade: 'B' }]]) {
    let calls = 0;
    const result = await testProescToken(token, () => { calls++; return Promise.resolve(Response.json(configuration(units))); }, now);
    assert(!result.ok && calls === 1 && result.message.includes('única unidade'));
  }
});

Deno.test('sucesso de configuração não oculta erro semântico nem recusa HTTP da contabilidade', async () => {
  for (const response of [
    () => Response.json({ status: 'error', description: `SECRET_BODY ${token}`, data: [] }),
    () => new Response(`SECRET_BODY ${token}`, { status: 403 }),
  ]) {
    let calls = 0;
    const result = await testProescToken(token, () => {
      calls++;
      return Promise.resolve(calls === 1 ? Response.json(configuration()) : response());
    }, now);
    assert(!result.ok && calls === 2 && result.checks.length === 1);
    assert(result.message.includes('não confirmou acesso às cobranças'));
    assert(!JSON.stringify(result).includes('SECRET_BODY') && !JSON.stringify(result).includes(token));
  }
});

Deno.test('coleção contábil vazia confirmada valida acesso sem declarar pagamentos ou importação', async () => {
  let calls = 0;
  const result = await testProescToken(token.toUpperCase(), () => Promise.resolve(++calls === 1
    ? Response.json(configuration()) : Response.json({ status: 'success', data: [] })), now);
  assert(result.ok && calls === 2 && !result.message.includes('pagamento') && !result.message.includes('importa'));
});

Deno.test('credencial fora do formato geral mantém as duas leituras V2', async () => {
  const paths: string[] = [];
  const result = await testProescToken('synthetic-jwt-like-token', (input, options) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert(url.origin === 'https://api.proesc.com');
    assert(new Headers(options?.headers).get('Authorization') === 'Bearer synthetic-jwt-like-token');
    assert(!url.searchParams.has('token'));
    return Promise.resolve(Response.json({ data: [] }));
  }, now);
  assert(result.ok && result.checks.length === 2 && paths.includes('/api/v2/people') && paths.includes('/api/v2/invoices'));
});
