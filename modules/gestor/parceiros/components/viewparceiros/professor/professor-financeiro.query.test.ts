import assert from 'node:assert/strict';
import test from 'node:test';
import { queryProfessorFinance, type ProfessorFinanceFilters } from './professor-financeiro.query.ts';

const professorId = '11111111-1111-4111-8111-111111111111';
const poloId = '22222222-2222-4222-8222-222222222222';
const filters: ProfessorFinanceFilters = { professorId, poloId, source: 'despesas', status: 'todos', page: 1, pageSize: 10 };

function fixture(items: unknown[] = [], totalItems = 0, error: unknown = null, override = {}) {
  const calls: [string, ...unknown[]][] = [];
  let args: Record<string, unknown> = {};
  const query: any = {
    abortSignal: (signal: AbortSignal) => { calls.push(['abortSignal', signal]); return query; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ error, data: {
      professorId, poloId, source: args.p_source, page: args.p_page, pageSize: args.p_page_size,
      items, totalItems, ...override,
    } }).then(resolve),
  };
  return { calls, client: { rpc: (name: string, input: Record<string, unknown>) => {
    args = input; calls.push(['rpc', name, input]); return query;
  } } };
}

test('envia somente identidade, unidade e filtros canônicos com paginação no servidor', async () => {
  const { client, calls } = fixture();
  const signal = new AbortController().signal;
  await queryProfessorFinance(client, { ...filters, page: 3, status: 'abertos' }, ['despesas'], signal);
  assert.deepEqual(calls[0], ['rpc', 'parceiro_professor_financeiro_visualizacao', {
    p_professor_id: professorId, p_polo_id: poloId, p_source: 'despesas',
    p_status: 'abertos', p_page: 3, p_page_size: 10,
  }]);
  assert.equal(calls[1][1], signal);
});

test('não consulta fontes que o perfil verificado não autoriza', async () => {
  const { client, calls } = fixture();
  await assert.rejects(queryProfessorFinance(client, filters, ['outros-debitos']), /não autorizado/);
  assert.equal(calls.length, 0);
  await queryProfessorFinance(client, { ...filters, source: 'outros-debitos' }, ['outros-debitos']);
  assert.equal((calls[0][2] as Record<string, unknown>).p_source, 'outros-debitos');
});

test('cursos, serviços e outros créditos mantêm origens e permissões separadas', async () => {
  for (const [source, permission] of [['mensalidades', 'receber'], ['servicos', 'receber'], ['outros-creditos', 'outros-creditos']] as const) {
    const { client, calls } = fixture();
    await queryProfessorFinance(client, { ...filters, source }, [permission]);
    assert.equal((calls[0][2] as Record<string, unknown>).p_source, source);
  }
});

test('não converte valores ausentes em zero e preserva valor pago zero', async () => {
  const { client } = fixture([{ id: 'item', partner_id: professorId, polo_id: poloId,
    descricao: 'Honorários', valor: '260.50', valor_pago: 0, status: 'PENDENTE', multa_valor: null }], 17);
  const result = await queryProfessorFinance(client, filters, ['despesas']);
  assert.equal(result.totalItems, 17);
  assert.equal(result.items[0].value, 260.5);
  assert.equal(result.items[0].paidValue, 0);
  assert.equal(result.items[0].fine, null);
  assert.equal(result.items[0].paymentDate, null);
});

test('rejeita filtros inválidos antes da rede e respostas de outro parceiro ou unidade', async () => {
  const { client, calls } = fixture();
  await assert.rejects(queryProfessorFinance(client, { ...filters, poloId: '' }, ['despesas']), /unidade válida/);
  await assert.rejects(queryProfessorFinance(client, { ...filters, page: 0 }, ['despesas']), /Filtros financeiros inválidos/);
  assert.equal(calls.length, 0);
  const foreign = fixture([{ id: 'item', partner_id: poloId, polo_id: poloId }], 1);
  await assert.rejects(queryProfessorFinance(foreign.client, filters, ['despesas']), /outro parceiro ou unidade/);
  await assert.rejects(queryProfessorFinance(fixture([], 0, null, { poloId: professorId }).client, filters, ['despesas']), /Resposta financeira inválida/);
});

test('erros e contagem desconhecida não viram lista vazia nem totais inventados', async () => {
  await assert.rejects(queryProfessorFinance(fixture([], 0, new Error('indisponível')).client, filters, ['despesas']), /indisponível/);
  await assert.rejects(queryProfessorFinance(fixture([], 0, null, { totalItems: null }).client, filters, ['despesas']), /Resposta financeira inválida/);
});
