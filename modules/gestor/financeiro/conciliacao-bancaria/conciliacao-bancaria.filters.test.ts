import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConciliacaoStatusFilter } from './conciliacao-bancaria.filters.ts';

test('TODOS inclui os estados bancários monitorados', () => {
  assert.deepEqual(resolveConciliacaoStatusFilter('TODOS'), {
    operator: 'in',
    statuses: [
      'PENDENTE',
      'VENCIDO',
      'AGUARDANDO_CONFIRMACAO',
      'AGUARDANDO_PAGAMENTO',
      'PAGO',
    ],
  });
});

test('PAGO e VENCIDO usam igualdade exclusiva', () => {
  assert.deepEqual(resolveConciliacaoStatusFilter('PAGO'), {
    operator: 'eq',
    statuses: ['PAGO'],
  });
  assert.deepEqual(resolveConciliacaoStatusFilter('VENCIDO'), {
    operator: 'eq',
    statuses: ['VENCIDO'],
  });
});

test('PENDENTE inclui esperas de pagamento, mas exclui vencidos e pagos', () => {
  const definition = resolveConciliacaoStatusFilter('pendente');

  assert.deepEqual(definition, {
    operator: 'in',
    statuses: ['PENDENTE', 'AGUARDANDO_CONFIRMACAO', 'AGUARDANDO_PAGAMENTO'],
  });
  assert.equal(definition.statuses.includes('VENCIDO'), false);
  assert.equal(definition.statuses.includes('PAGO'), false);
});
