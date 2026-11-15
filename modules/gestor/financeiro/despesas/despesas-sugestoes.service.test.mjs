import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const built = await build({
  entryPoints: [fileURLToPath(new URL('./despesas-sugestoes.service.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'authenticated-client-stub', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const supabase = { from: (...args) => globalThis.__despesaSuggestionClient.from(...args) };',
    }));
  } }],
});
const { getUltimaDespesaDoCredor, getUltimaTurmaDoProfessor } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);

function fakeClient(result) {
  const calls = [];
  const query = Object.fromEntries(['select', 'eq', 'in', 'is', 'not', 'neq', 'order', 'limit'].map((name) => [
    name, (...args) => { calls.push([name, ...args]); return query; },
  ]));
  query.maybeSingle = async () => result;
  globalThis.__despesaSuggestionClient = { from: (table) => {
    calls.push(['from', table]);
    return query;
  } };
  return calls;
}

test('leitura autenticada é limitada ao último cadastro do mesmo polo, tipo e credor', async () => {
  const calls = fakeClient({ data: {
    id: 'anterior', descricao: 'Serviço mensal', valor_base: '120.50', categoria_financeira_id: 'internet',
  }, error: null });
  assert.deepEqual(await getUltimaDespesaDoCredor('polo-a', 'DESPESA_FIXA', 'credor-a'), {
    id: 'anterior', descricao: 'Serviço mensal', valorBase: 120.5, categoriaId: 'internet',
  });
  assert.deepEqual(calls, [
    ['from', 'despesas_lancamentos'],
    ['select', 'id,descricao,valor_base,categoria_financeira_id'],
    ['eq', 'polo_id', 'polo-a'], ['eq', 'tipo', 'DESPESA_FIXA'], ['eq', 'fornecedor_id', 'credor-a'],
    ['is', 'excluido_em', null], ['neq', 'status', 'CANCELADO'],
    ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 1],
  ]);
});

test('não consulta escopo global, credor vazio ou outro débito', async () => {
  const calls = fakeClient({ data: null, error: null });
  for (const [polo, tipo, credor] of [
    ['todos', 'DESPESA_FIXA', 'a'], ['', 'DESPESA_FIXA', 'a'],
    ['polo', 'DESPESA_VARIAVEL', ''], ['polo', 'OUTRO_DEBITO', 'a'],
  ]) assert.equal(await getUltimaDespesaDoCredor(polo, tipo, credor), null);
  assert.equal(calls.length, 0);
});

test('histórico vazio e falha de leitura são distintos, permitindo preenchimento manual e retry', async () => {
  fakeClient({ data: null, error: null });
  assert.equal(await getUltimaDespesaDoCredor('polo', 'DESPESA_VARIAVEL', 'a'), null);
  const error = new Error('Consulta indisponível');
  fakeClient({ data: null, error });
  await assert.rejects(getUltimaDespesaDoCredor('polo', 'DESPESA_VARIAVEL', 'a'), error);
});

test('última turma do professor usa despesa vinculada dos dois tipos, somente no polo autenticado', async () => {
  const calls = fakeClient({ data: { turma_id: 'turma-anterior' }, error: null });
  assert.equal(await getUltimaTurmaDoProfessor('polo-a', 'professor-a'), 'turma-anterior');
  assert.deepEqual(calls, [
    ['from', 'despesas_lancamentos'], ['select', 'turma_id'],
    ['eq', 'polo_id', 'polo-a'], ['eq', 'fornecedor_id', 'professor-a'],
    ['in', 'tipo', ['DESPESA_FIXA', 'DESPESA_VARIAVEL']],
    ['is', 'excluido_em', null], ['neq', 'status', 'CANCELADO'], ['not', 'turma_id', 'is', null],
    ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 1],
  ]);
});

test('sugestão de turma não consulta polo global nem identificadores vazios', async () => {
  const calls = fakeClient({ data: null, error: null });
  for (const [polo, professor] of [['todos', 'professor'], ['', 'professor'], ['polo', '']]) {
    assert.equal(await getUltimaTurmaDoProfessor(polo, professor), null);
  }
  assert.equal(calls.length, 0);
});

test('sugestão de turma distingue histórico vazio de erro sem criar dados', async () => {
  fakeClient({ data: null, error: null });
  assert.equal(await getUltimaTurmaDoProfessor('polo', 'professor'), null);
  const error = new Error('Histórico de turmas indisponível');
  fakeClient({ data: null, error });
  await assert.rejects(getUltimaTurmaDoProfessor('polo', 'professor'), error);
});

test.after(() => { delete globalThis.__despesaSuggestionClient; });
