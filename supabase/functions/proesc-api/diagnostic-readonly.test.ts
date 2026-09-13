import { runProescReadOnlyDiagnostic } from './diagnostic-readonly.ts';
import { ProescError } from './contract.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value { if (!value) throw new Error(message); }
const token = 'a'.repeat(32);
const revision = 'revision-one';
const query = { unitId: '1', year: 2026, month: 9, externalKey: '8001' };
const config = () => ({ status: 'success', units: [{ id: 1, unidade: 'INSTITUTION_NAME' }],
  academic_years: [], categories: [{ id: 1, name: 'Principal' }, { id: 2, name: 'Recebimento' },
    { id: 10482, name: 'Desconto' }, { id: 999, name: 'OTHER_CATEGORY' }] });
const row = (block = 2, amount = '100.00', date: string | null = '2025-09-10') => ({
  chave_id: '8001', id: block, valor: amount, unidade_id: 1, turma_id: 2, curso: 3,
  aluno_nome: 'STUDENT_NAME', aluno_cpf: '12345678901', data_vencimento: '2026-09-10',
  data_pagamento: date, data_cricao: '2025-01-01', registro_cancelado: false,
  pagamento_renegociacao: false, forma_pagamento: 1,
});

function makeAdmin(change = false) {
  const actions: string[] = [];
  return {
    actions,
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert(name === 'proesc_workspace_service');
      assert(args.p_action === 'token', 'Diagnostic attempted a mutation');
      actions.push(String(args.p_action));
      return { data: { token, revision: change && actions.length > 1 ? 'revision-two' : revision }, error: null };
    },
  };
}

const successfulTransport = (rows = [row(1, '279.90', null), row(), row(10482, '179.90', null)]): typeof fetch => (
  async (input, init) => {
    const url = new URL(String(input));
    assert(url.origin === 'https://app.proesc.com');
    assert(init?.method === 'GET' && init.redirect === 'error');
    assert(url.searchParams.get('token') === token);
    if (url.pathname.endsWith('/configuration_data')) return Response.json(config());
    assert(url.pathname === '/api/v1/accounting_data');
    assert(url.searchParams.get('id_chave') === query.externalKey);
    return Response.json({ status: 'success', data: rows });
  }
);

async function rejected(task: () => Promise<unknown>, expected?: string) {
  try { await task(); throw new Error('Expected failure'); }
  catch (error) {
    assert(error instanceof ProescError);
    const text = String(error);
    assert(!text.includes(token) && !text.includes('SECRET_BODY') && !text.includes('https://'));
    if (expected) assert(text.includes(expected));
  }
}

Deno.test('diagnóstico individual conserva blocos e data fora do mês sem mutar nem expor identidade', async () => {
  const admin = makeAdmin();
  const result = await runProescReadOnlyDiagnostic(admin, 'actor', { periods: [query] }, successfulTransport());
  assert(admin.actions.join(',') === 'token,token');
  assert(result.readOnly && result.summaries.length === 1);
  assert(result.categories.map((category) => category.id).join(',') === '1,2,10482');
  const summary = result.summaries[0];
  assert(summary.index === 0 && summary.rowCount === 3);
  assert(summary.blockCounts['2'] === 1 && summary.blockAmountCents['2'] === '10000');
  assert(summary.paymentDateCounts['2025-09-10'] === 1 && summary.missingPaymentDateCount === 2);
  assert(summary.identityCoherent && summary.queryKeysMatch);
  const serialized = JSON.stringify(result);
  for (const secret of [token, 'STUDENT_NAME', '12345678901', 'INSTITUTION_NAME', 'OTHER_CATEGORY', '8001', 'https://']) {
    assert(!serialized.includes(secret), 'Diagnostic exposed a forbidden field');
  }
});

Deno.test('diagnóstico conserva multiplicidade e sinaliza identidade e flags sem classificá-las como pagamento', async () => {
  const result = await runProescReadOnlyDiagnostic(makeAdmin(), 'actor', { periods: [query] }, successfulTransport([
    row(), row(), { ...row(), turma_id: 99, registro_cancelado: true, pagamento_renegociacao: true },
  ]));
  const summary = result.summaries[0];
  assert(summary.blockCounts['2'] === 3 && summary.blockAmountCents['2'] === '30000');
  assert(!summary.identityCoherent && summary.cancelledCount === 1 && summary.renegotiationCount === 1);
});

Deno.test('limite e parâmetros inválidos falham antes de buscar credencial', async () => {
  for (const periods of [Array.from({ length: 5 }, () => query), [{ ...query, month: 13 }],
    [{ ...query, externalKey: 'https://other.invalid' }], [{ ...query, endpoint: 'https://other.invalid' }]]) {
    const admin = makeAdmin();
    await rejected(() => runProescReadOnlyDiagnostic(admin, 'actor', { periods }, successfulTransport()));
    assert(admin.actions.length === 0);
  }
});

Deno.test('unidade estranha e chave ignorada pelo provedor não geram diagnóstico válido', async () => {
  await rejected(() => runProescReadOnlyDiagnostic(makeAdmin(), 'actor', {
    periods: [{ ...query, unitId: '2' }],
  }, successfulTransport()), 'unidade');
  await rejected(() => runProescReadOnlyDiagnostic(makeAdmin(), 'actor', { periods: [query] },
    successfulTransport([{ ...row(), chave_id: '9000' }])));
});

Deno.test('mudança de revisão impede retorno dos agregados observados', async () => {
  await rejected(() => runProescReadOnlyDiagnostic(makeAdmin(true), 'actor', {
    periods: [query],
  }, successfulTransport()), 'credencial mudou');
});

Deno.test('redirecionamento, erro lógico e falhas RPC nunca expõem segredo ou corpo externo', async () => {
  for (const transport of [
    () => Promise.resolve(new Response(`SECRET_BODY ${token}`, {
      status: 302, headers: { Location: `https://other.invalid/?token=${token}` },
    })),
    () => Promise.resolve(Response.json({ status: 'error', description: `SECRET_BODY ${token}`, data: [] })),
    () => Promise.reject(new Error(`https://app.proesc.com/?token=${token}`)),
  ] as typeof fetch[]) {
    await rejected(() => runProescReadOnlyDiagnostic(makeAdmin(), 'actor', { periods: [query] }, transport));
  }
  await rejected(() => runProescReadOnlyDiagnostic({ rpc: async () => {
    throw new Error(`SECRET_BODY ${token}`);
  } }, 'actor', {}, successfulTransport()));
});

Deno.test('consulta sem períodos retorna só categorias e credencial V2 não é enviada para V1', async () => {
  const result = await runProescReadOnlyDiagnostic(makeAdmin(), 'actor', {}, successfulTransport());
  assert(result.summaries.length === 0 && result.categories.length === 3);
  let transported = false;
  await rejected(() => runProescReadOnlyDiagnostic({ rpc: async () => ({
    data: { token: 'jwt-token-test', revision }, error: null,
  }) }, 'actor', {}, async () => { transported = true; return Response.json(config()); }));
  assert(!transported);
});

Deno.test('extrato opcional não segue redirecionamento nem expõe Location', async () => {
  let statementCalls = 0;
  const result = await runProescReadOnlyDiagnostic(makeAdmin(), 'actor', { includeStatement: true }, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/configuration_data')) return Response.json(config());
    assert(url.origin === 'https://app.proesc.com' && url.pathname === '/api/v1/financial_statement');
    assert(init?.method === 'GET' && init.redirect === 'manual');
    assert(url.searchParams.get('unidade_id') === '1' && url.searchParams.get('token') === token);
    statementCalls++;
    return new Response(`SECRET_BODY ${token}`, { status: 302,
      headers: { Location: `https://other.invalid/?token=${token}`, 'Content-Type': 'text/html' } });
  });
  assert(statementCalls === 1 && result.statement?.result === 'REDIRECT_BLOCKED');
  assert(result.statement?.httpStatus === 302);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes(token) && !serialized.includes('SECRET_BODY') && !serialized.includes('https://'));
});

Deno.test('extrato devolve apenas estrutura e contagens de datas, inclusive em erro semântico', async () => {
  for (const status of ['success', 'error']) {
    const result = await runProescReadOnlyDiagnostic(makeAdmin(), 'actor', { includeStatement: true }, async (input) => {
      if (new URL(String(input)).pathname.endsWith('/configuration_data')) return Response.json(config());
      return Response.json({ status, token, [`${token}`]: token, data: [
        { student_id: 9999, student_name: 'STUDENT_NAME', installment_payment_date: '2026-09-12', token },
        { student_id: 8888, installment_payment_date: null },
      ] });
    });
    const statement = result.statement;
    assert(statement?.result === 'JSON_OBSERVED' && statement.logicalStatus === status);
    assert(statement.rowCount === 2 && statement.paymentDatePresentCount === 1 && statement.paymentDateMissingCount === 1);
    const serialized = JSON.stringify(statement);
    for (const forbidden of [token, 'STUDENT_NAME', '9999', '8888', '2026-09-12']) assert(!serialized.includes(forbidden));
  }
});

Deno.test('categoria que ecoa segredo ou URL não é devolvida', async () => {
  for (const name of [token, `https://other.invalid/?token=${token}`]) {
    await rejected(() => runProescReadOnlyDiagnostic(makeAdmin(), 'actor', {}, async () =>
      Response.json({ ...config(), categories: [{ id: 10482, name }] })));
  }
});
