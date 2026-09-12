import { groupProescV1Accounting, parseProescV1Accounting, proescV1MoneyCents } from './v1-accounting.ts';

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => unknown) {
  try { action(); } catch (error) {
    assert(error instanceof Error && error.message === 'Resposta contábil Proesc V1 inválida ou incompleta.');
    return;
  }
  throw new Error('expected rejection');
}

const source = { unitId: '9001', year: 2030, month: 5 };
const row = (overrides: Record<string, unknown> = {}) => ({
  chave_id: '008001', id: 2, valor: '210.29', unidade_id: 9001, turma_id: 8002, curso: 17,
  aluno_cpf: '01234567890', data_vencimento: '2030-02-15', data_pagamento: '2030-05-20',
  data_cricao: '2029-12-01', forma_pagamento: 'Boleto', registro_cancelado: false,
  pagamento_renegociacao: false, competencia_ano: 2030, competencia_mes: 5, ...overrides,
});
const parse = (data: unknown[]) => parseProescV1Accounting({ status: 'success', data }, source);

Deno.test('normaliza centavos exatos, identidade e datas sem perder pagamento de vencimento anterior', () => {
  const result = parse([row({ aluno_nome: 'NOME_SINTETICO_NAO_PROJETADO' })]);
  const item = result.rows[0];
  assert(result.rows.length === 1 && item.amountCents === 21029 && item.blockId === '2');
  assert(item.externalKey === '008001' && item.identity.studentDocument === '01234567890');
  assert(item.identity.unitId === '9001' && item.identity.classId === '8002');
  assert(item.source.month === 5 && item.source.rowIndex === 0 && item.dueDate === '2030-02-15');
  assert(item.paymentDate === '2030-05-20' && item.createdDate === '2029-12-01');
  assert(item.issues.length === 0 && !JSON.stringify(result).includes('NOME_SINTETICO'));
  assert(!('paid' in item) && !('status' in item) && !('settledAmount' in item));
});

Deno.test('cada bloco e cada repetição permanecem observáveis, sem somar ou resolver baixa', () => {
  const rows = parse([row({ id: 1 }), row({ id: 2 }), row({ id: 2 }), row({ id: 3, valor: '1.20' }),
    row({ id: 4, valor: '0.50' }), row({ id: 5, valor: '210.29' })]).rows;
  const [group] = groupProescV1Accounting(rows);
  assert(group.rows.length === 6 && group.blockCounts['2'] === 2 && group.issues.includes('REPEATED_BLOCK'));
  assert(group.rows[1].source.rowIndex === 1 && group.rows[2].source.rowIndex === 2);
  assert(!('total' in group) && !('paid' in group));
  assert(!group.issues.includes('CANCELLED_RECORD'), 'bloco 5 sozinho não comprova flag de cancelamento');
});

Deno.test('grupos mantêm unidade e chave separadas e apontam conflito de identidade e vencimento', () => {
  const one = parse([row(), row({ turma_id: 8003, aluno_cpf: '12345678901', data_vencimento: '2030-03-15' })]).rows;
  const anotherUnit = parseProescV1Accounting({ status: 'success', data: [row({ unidade_id: 9002 })] },
    { ...source, unitId: '9002' }).rows;
  const groups = groupProescV1Accounting([...one, ...anotherUnit]);
  assert(groups.length === 2);
  assert(groups[0].issues.includes('CONFLICTING_IDENTITY') && groups[0].issues.includes('CONFLICTING_DUE_DATE'));
  assert(groups[1].rows.length === 1);
});

Deno.test('identidade e flags ausentes exigem revisão; CPF numérico curto não recebe zeros inventados', () => {
  const [item] = parse([row({ aluno_cpf: 1234567890, turma_id: null, registro_cancelado: undefined })]).rows;
  assert(item.identity.studentDocument === null && item.identity.classId === null);
  assert(item.issues.includes('MISSING_STUDENT_DOCUMENT') && item.issues.includes('MISSING_CLASS_ID'));
  assert(item.issues.includes('UNCONFIRMED_FLAGS'));
  const masked = parse([row({ aluno_cpf: '012.345.678-90', data_pagamento: '', forma_pagamento: 0 })]).rows[0];
  assert(masked.identity.studentDocument === '01234567890' && masked.paymentDate === null && masked.paymentMethod === '0');
});

Deno.test('cancelamento e renegociação explícitos permanecem separados dos blocos contábeis', () => {
  const [item] = parse([row({ registro_cancelado: true, pagamento_renegociacao: true })]).rows;
  assert(item.cancelled && item.renegotiationPayment);
  assert(item.issues.includes('CANCELLED_RECORD') && item.issues.includes('RENEGOTIATION_RECORD'));
});

Deno.test('valores não sofrem arredondamento binário nem aceitam formato ambíguo', () => {
  for (const [value, expected] of [['0.29', 29], ['-10.21', -1021], ['7', 700], ['0.01', 1], [1.23, 123]] as const) {
    assert(proescV1MoneyCents(value) === expected);
  }
  for (const value of ['1.234', '1,23', '1e2', 'NaN', Infinity, null, {}, '90071992547409.92']) {
    rejects(() => proescV1MoneyCents(value));
  }
});

Deno.test('falha semântica, limite e linhas inválidas impedem aceitar uma página parcial', () => {
  rejects(() => parseProescV1Accounting({ status: 'error', description: 'unit id required', data: [] }, source));
  rejects(() => parseProescV1Accounting([], source));
  rejects(() => parseProescV1Accounting({ status: 'success' }, source));
  rejects(() => parseProescV1Accounting({ status: 'success', data: [row(), row()] }, source, 1));
  for (const bad of [row({ chave_id: null }), row({ id: 0 }), row({ unidade_id: 9002 }),
    row({ data_vencimento: '2030-02-30' }), row({ valor: '210.291' }), row({ registro_cancelado: 'false' })]) {
    rejects(() => parse([row(), bad]));
  }
  assert(parse([]).rows.length === 0, 'coleção vazia confirmada é diferente de erro');
});

Deno.test('datas publicadas em dia/mês/ano são validadas sem reinterpretar timestamps', () => {
  const item = parse([row({ data_vencimento: '15/02/2030', data_pagamento: '00/00/0000' })]).rows[0];
  assert(item.dueDate === '2030-02-15' && item.paymentDate === null);
  rejects(() => parse([row({ data_pagamento: '2030-05-20T00:00:00Z' })]));
});
