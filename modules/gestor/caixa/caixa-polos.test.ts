import assert from 'node:assert/strict';
import test from 'node:test';
import { orderCaixaPolosByCreation } from './caixa-polos';
import type { CaixaPolo } from './caixa-polos';

const makePolo = (
  id: string,
  nome: string,
  createdAt: string | null,
): CaixaPolo => ({
  id,
  nome,
  cidade: nome,
  estado: 'SE',
  is_matriz: false,
  created_at: createdAt,
});

test('mantem os polos do Caixa na ordem cronologica de cadastro', () => {
  const polos = [
    makePolo('polo-3', 'Aquidaba Novo', '2026-07-31T12:00:00.000Z'),
    makePolo('polo-1', 'Japoata', '2026-01-01T12:00:00.000Z'),
    makePolo('polo-2', 'Porto da Folha', '2026-03-01T12:00:00.000Z'),
  ];

  assert.deepEqual(
    orderCaixaPolosByCreation(polos).map((polo) => polo.id),
    ['polo-1', 'polo-2', 'polo-3'],
  );
  assert.deepEqual(
    polos.map((polo) => polo.id),
    ['polo-3', 'polo-1', 'polo-2'],
    'a ordenacao nao deve alterar o cache original do TanStack Query',
  );
});

test('coloca registros sem data depois dos polos com data conhecida', () => {
  const polos = [
    makePolo('polo-sem-data', 'Sem data', null),
    makePolo('polo-com-data', 'Com data', '2026-07-31T12:00:00.000Z'),
  ];

  assert.deepEqual(
    orderCaixaPolosByCreation(polos).map((polo) => polo.id),
    ['polo-com-data', 'polo-sem-data'],
  );
});
