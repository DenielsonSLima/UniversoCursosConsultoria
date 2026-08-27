import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySettlementChannel,
} from './conciliacao-bancaria.utils.ts';

test('garante cálculo correto de paginação e fatiamento de dados', () => {
  const totalItems = 120;
  const pageSize = 20;
  const totalPages = Math.ceil(totalItems / pageSize);

  assert.equal(totalPages, 6);

  const getPageRange = (page: number, size: number) => {
    const from = (page - 1) * size;
    const to = from + size - 1;
    return { from, to };
  };

  assert.deepEqual(getPageRange(1, 20), { from: 0, to: 19 });
  assert.deepEqual(getPageRange(2, 20), { from: 20, to: 39 });
  assert.deepEqual(getPageRange(6, 20), { from: 100, to: 119 });
});

test('classificação de canais de liquidação em lote com paginação', () => {
  const items = [
    {
      status: 'PAGO',
      gatewayProvider: 'banese_card',
      gatewayStatus: 'PAID',
      origemPagamento: 'ONLINE',
    },
    {
      status: 'PAGO',
      gatewaySubmissionChannel: 'CNAB',
    },
    {
      status: 'PAGO',
      origemPagamento: 'PRESENCIAL',
    },
    {
      status: 'PENDENTE',
    },
  ];

  const classified = items.map((item) => classifySettlementChannel(item));

  assert.equal(classified[0], 'API_BANESE');
  assert.equal(classified[1], 'CNAB240');
  assert.equal(classified[2], 'CAIXA_MANUAL');
  assert.equal(classified[3], 'PENDENTE');
});
