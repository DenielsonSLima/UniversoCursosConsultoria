import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['modules/gestor/parceiros/components/viewparceiros/professor/professor-turmas.service.ts'], bundle: true,
  write: false, format: 'esm', platform: 'node', plugins: [{ name: 'isolated-client', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = {};', loader: 'js' }));
  } }] });
const { loadProfessorAssignments } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`);
function fixture(response) {
  const calls = [];
  const query = new Proxy({ then: (resolve) => Promise.resolve(response).then(resolve) }, { get(target, key) {
    if (key === 'then') return target.then;
    return (...args) => { calls.push([key, ...args]); return query; };
  } });
  return { calls, client: { from: (table) => { calls.push(['from', table]); return query; } } };
}

test('vínculos consultam professor exato, polo e conclusão no servidor com paginação estável', async () => {
  const { calls, client } = fixture({ data: [{ turma_id: 'turma' }], count: 17, error: null });
  const result = await loadProfessorAssignments({ professorId: 'teacher', poloId: 'unit', status: 'concluidas', page: 1, turmaSearch: 'Turma_100%' }, client);
  assert.equal(result.count, 17);
  assert.equal(result.items.length, 1);
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'professor_id' && value === 'teacher'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'turma.polo_id' && value === 'unit'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'concluida' && value === true));
  assert.deepEqual(calls.find(([method]) => method === 'range'), ['range', 12, 23]);
  assert.deepEqual(calls.find(([method]) => method === 'ilike'), ['ilike', 'turma.nome', '%Turma\\_100\\%%']);
  assert.deepEqual(calls.filter(([method]) => method === 'order').map((call) => call[1]), ['created_at', 'turma_id', 'disciplina_id']);
});

test('escopo global mantém RLS e ausência de contagem ou erro não vira lista vazia', async () => {
  const global = fixture({ data: [], count: 0, error: null });
  await loadProfessorAssignments({ professorId: 'teacher', status: 'todas', page: 0, turmaSearch: '' }, global.client);
  assert.ok(!global.calls.some(([method, column]) => method === 'eq' && column === 'turma.polo_id'));
  for (const response of [{ data: [], count: null, error: null }, { data: null, count: null, error: new Error('negado') }]) {
    await assert.rejects(loadProfessorAssignments({ professorId: 'teacher', status: 'todas', page: 0, turmaSearch: '' }, fixture(response).client));
  }
});
