import assert from 'node:assert/strict';
import test from 'node:test';
import { isRelatoriosRealtimeSource } from './relatorios.realtime.ts';

test('aceita somente eventos que alteram os relatórios acadêmicos', () => {
  assert.equal(isRelatoriosRealtimeSource('matriculas'), true);
  assert.equal(isRelatoriosRealtimeSource('turmas'), true);
  assert.equal(isRelatoriosRealtimeSource('parceiros'), true);
  assert.equal(isRelatoriosRealtimeSource('cursos'), true);
  assert.equal(isRelatoriosRealtimeSource('polos'), true);
  assert.equal(isRelatoriosRealtimeSource('turmas_disciplinas'), false);
  assert.equal(isRelatoriosRealtimeSource('contas_receber'), false);
  assert.equal(isRelatoriosRealtimeSource(undefined), false);
});
