import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMaceioDateBounds,
  getPageRange,
  maskCpf,
  normalizeEnrollmentStatus,
} from './matriculas.utils.ts';

test('calcula paginação limitada e baseada em um', () => {
  assert.deepEqual(getPageRange(2, 25), { from: 25, to: 49, page: 2, pageSize: 25 });
  assert.deepEqual(getPageRange(0, 200), { from: 0, to: 99, page: 1, pageSize: 100 });
});

test('converte intervalo local de Maceió para limites inclusivo e exclusivo', () => {
  assert.deepEqual(getMaceioDateBounds('2026-05-27', '2026-05-27'), {
    from: '2026-05-27T00:00:00-03:00',
    toExclusive: '2026-05-28T00:00:00-03:00',
  });
});

test('mascara CPF e normaliza situação acadêmica', () => {
  assert.equal(maskCpf('123.456.789-01'), '***.456.789-**');
  assert.equal(normalizeEnrollmentStatus('ativo'), 'ATIVO');
});
