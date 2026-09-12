/* global ReadableStream: readonly -- API Web disponível no runtime Deno dos testes. */
import { createProescV1Client, ProescV1ReadError } from './v1-client.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
const token = 'synthetic-general-secret';
const query = { unitId: '9001', year: 2030, month: 5 };
const configuration = () => ({ status: 'success', units: [{ id: 9001, unidade: 'UNIDADE SINTETICA' }],
  academic_years: [{ id: 2030, name: '2030' }], categories: [{ id: 1, name: 'Categoria sintética' }] });
const row = (overrides: Record<string, unknown> = {}) => ({
  unidade_id: 9001, chave_id: 8001, id: 2, valor: '100.29', turma_id: 7001, curso: 12,
  aluno_cpf: '01234567890', data_vencimento: '2030-02-01', data_pagamento: '2030-05-02',
  registro_cancelado: false, pagamento_renegociacao: false, ...overrides,
});
async function rejected(action: () => unknown | Promise<unknown>, code: string, upstreamStatus?: number) {
  try { await action(); } catch (error) {
    assert(error instanceof ProescV1ReadError && error.code === code, `expected ${code}`);
    if (upstreamStatus !== undefined) assert(error.upstreamStatus === upstreamStatus);
    const text = `${String(error)}${JSON.stringify(error)}${error.stack}`;
    assert(!text.includes(token) && !text.includes('SECRET_BODY') && !text.includes('https://'));
    return;
  }
  throw new Error('expected rejection');
}

Deno.test('V1 usa somente GET nos dois recursos fixos, token query e parâmetros documentados', async () => {
  const paths: string[] = [];
  const client = createProescV1Client({ token, transport: (input, options) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://app.proesc.com' && options?.method === 'GET' && options.redirect === 'error');
    assert(url.searchParams.get('token') === token && !new Headers(options.headers).has('Authorization'));
    paths.push(url.pathname);
    if (url.pathname === '/api/v1/configuration_data') {
      assert([...url.searchParams.keys()].length === 1);
      return Promise.resolve(Response.json(configuration()));
    }
    assert(url.pathname === '/api/v1/accounting_data');
    assert(url.searchParams.get('unidade_id') === '9001' && url.searchParams.get('ano_letivo') === '2030');
    assert(url.searchParams.get('mes') === '05' && url.searchParams.get('id_chave') === '8001');
    assert(!url.searchParams.has('page') && !url.searchParams.has('id'));
    return Promise.resolve(Response.json({ status: 'success', data: [row()] }));
  } });
  const config = await client.configurationData();
  const page = await client.accountingData({ ...query, externalKey: '8001' });
  assert(paths.length === 2 && config.units[0].name === 'UNIDADE SINTETICA');
  assert(page.rows.length === 1 && page.rows[0].dueDate === '2030-02-01');
  assert(!JSON.stringify({ config, page }).includes(token));
  assert(Object.keys(client).sort().join(',') === 'accountingData,configurationData');
});

Deno.test('query inválida falha antes de transportar, sem permitir host ou chave alternativa', async () => {
  let requests = 0;
  const client = createProescV1Client({ token, transport: () => { requests++; return Promise.resolve(Response.json({})); } });
  for (const input of [{ ...query, unitId: '../other' }, { ...query, month: 13 }, { ...query, year: 1 },
    { ...query, externalKey: 'https://other.invalid' }]) {
    await rejected(() => client.accountingData(input), 'INVALID_REQUEST');
  }
  assert(requests === 0);
  await rejected(() => createProescV1Client({ token: `${token}\n` }), 'INVALID_REQUEST');
});

Deno.test('HTTP 200 com status error nunca representa acesso confirmado nem lista vazia', async () => {
  const client = createProescV1Client({ token, transport: () => Promise.resolve(Response.json({
    status: 'error', description: `unit id required SECRET_BODY ${token}`, data: [],
  })) });
  await rejected(() => client.configurationData(), 'SEMANTIC_ERROR', 200);
  await rejected(() => client.accountingData(query), 'SEMANTIC_ERROR', 200);
});

Deno.test('HTTP recusado, redirecionamento e falha de transporte não vazam resposta, URL ou credencial', async () => {
  for (const status of [401, 403, 429, 500, 302]) {
    const client = createProescV1Client({ token, transport: () => Promise.resolve(new Response(`SECRET_BODY ${token}`, {
      status, headers: { Location: `https://other.invalid/?token=${token}` },
    })) });
    await rejected(() => client.configurationData(), status === 302 ? 'REDIRECT' : 'HTTP_ERROR', status);
  }
  const client = createProescV1Client({ token, transport: () => Promise.reject(new Error(`https://app.proesc.com/?token=${token}`)) });
  await rejected(() => client.configurationData(), 'TRANSPORT_ERROR');
});

Deno.test('HTML, corpo inválido, resposta parcial e envelope V2 são recusados', async () => {
  for (const response of [
    () => new Response('<html>SECRET_BODY</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{SECRET_BODY', { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ status: 'success', data: [] }, { status: 206 }),
    () => Response.json({ status: 'success', data: [] }, { headers: { 'Content-Range': 'items 0-1/20' } }),
    () => Response.json({ success: true, data: [] }),
    () => Response.json([{ status: 'success', data: [] }]),
  ]) {
    const client = createProescV1Client({ token, transport: () => Promise.resolve(response()) });
    const status = response().status;
    await rejected(() => client.accountingData(query), status === 206 ? 'HTTP_ERROR' : 'INVALID_RESPONSE', status);
  }
});

Deno.test('limites aplicam-se ao tamanho real, tamanho declarado e número de registros', async () => {
  for (const headers of [{}, { 'Content-Length': '99999' }] as Record<string, string>[]) {
    const client = createProescV1Client({ token, maxBytes: 40, transport: () => Promise.resolve(
      Response.json({ status: 'success', data: [row()] }, { headers }),
    ) });
    await rejected(() => client.accountingData(query), 'RESPONSE_LIMIT', 200);
  }
  const client = createProescV1Client({ token, maxRows: 1, transport: () => Promise.resolve(
    Response.json({ status: 'success', data: [row(), row()] }),
  ) });
  await rejected(() => client.accountingData(query), 'INVALID_RESPONSE', 200);
});

Deno.test('timeout abrange transporte e streaming, inclusive quando o mock ignora AbortSignal', async () => {
  const noResponse = createProescV1Client({ token, timeoutMs: 5, transport: () => new Promise(() => undefined) });
  await rejected(() => noResponse.configurationData(), 'TIMEOUT');
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() { cancelled = true; return new Promise(() => undefined); },
  });
  const noBody = createProescV1Client({ token, timeoutMs: 5, transport: () => Promise.resolve(
    new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
  ) });
  await rejected(() => noBody.configurationData(), 'TIMEOUT');
  assert(cancelled);
});

Deno.test('configuração exige coleções e IDs coerentes; sucesso não presume acesso contábil', async () => {
  for (const payload of [{ status: 'success', units: [] }, { ...configuration(), units: [{ id: 1, unidade: 'A' }, { id: 1, unidade: 'B' }] }]) {
    const client = createProescV1Client({ token, transport: () => Promise.resolve(Response.json(payload)) });
    await rejected(() => client.configurationData(), 'INVALID_RESPONSE', 200);
  }
  const client = createProescV1Client({ token, transport: (input) => Promise.resolve(String(input).includes('/configuration_data?')
    ? Response.json(configuration()) : new Response('SECRET_BODY', { status: 403 })) });
  assert((await client.configurationData()).units.length === 1);
  await rejected(() => client.accountingData(query), 'HTTP_ERROR', 403);
});

Deno.test('filtro de chave é conferido na resposta e cancelamento explícito interrompe antes do transporte', async () => {
  const client = createProescV1Client({ token, transport: () => Promise.resolve(Response.json({ status: 'success', data: [row()] })) });
  await rejected(() => client.accountingData({ ...query, externalKey: '8002' }), 'INVALID_RESPONSE', 200);
  const controller = new AbortController();
  controller.abort();
  const cancelled = createProescV1Client({ token, signal: controller.signal, transport: () => { throw new Error('não deve transportar'); } });
  await rejected(() => cancelled.configurationData(), 'ABORTED');
});
