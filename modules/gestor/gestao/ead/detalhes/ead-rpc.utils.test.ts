import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRpcList, normalizeRpcRecord } from './ead-rpc.utils';

test('normaliza objeto RPC direto ou encapsulado em uma linha', () => {
  assert.deepEqual(normalizeRpcRecord<{ id: string }>({ id: '1' }, 'resumo'), { id: '1' });
  assert.deepEqual(normalizeRpcRecord<{ id: string }>([{ id: '1' }], 'resumo'), { id: '1' });
});

test('normaliza listas RPC e respostas vazias', () => {
  assert.deepEqual(normalizeRpcList<{ id: string }>([{ id: '1' }], 'alunos'), [{ id: '1' }]);
  assert.deepEqual(normalizeRpcList<{ id: string }>({ data: [{ id: '1' }] }, 'alunos'), [{ id: '1' }]);
  assert.deepEqual(normalizeRpcList(null, 'alunos'), []);
});

test('rejeita formatos RPC inesperados', () => {
  assert.throws(() => normalizeRpcRecord(null, 'resumo'), /Resposta inválida/);
  assert.throws(() => normalizeRpcList('erro', 'alunos'), /Resposta inválida/);
});
