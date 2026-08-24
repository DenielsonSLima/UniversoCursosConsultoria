import assert from 'node:assert/strict';
import test from 'node:test';
import { requiredUuid } from './assinatura-eletronica.service.shared.ts';

const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';

test('aceita o UUID PostgreSQL legado da matriz na fronteira das RPCs', () => {
  assert.equal(
    requiredUuid(MATRIZ_POLO_ID, 'O polo da caixa de assinaturas'),
    MATRIZ_POLO_ID,
  );
});

test('continua rejeitando UUID malformado na fronteira das RPCs', () => {
  assert.throws(
    () => requiredUuid(
      '44444444-4444-4444-z444-444444444444',
      'O polo da caixa de assinaturas',
    ),
    /não tem o formato autorizado/u,
  );
});
