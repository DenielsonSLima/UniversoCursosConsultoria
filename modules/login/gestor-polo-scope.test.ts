import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGestorPoloScope } from './gestor-polo-scope.ts';

const POLO_A = '11111111-1111-4111-8111-111111111111';
const POLO_B = '22222222-2222-4222-8222-222222222222';
const MATRIZ_POLO_ID = '44444444-4444-4444-4444-444444444444';

test('acesso global acompanha polos novos sem manter lista explicita', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: 'global',
    explicitPoloIds: [],
    allPolos: true,
    preferredPoloId: POLO_A,
  }), {
    isGlobal: true,
    allowedPoloIds: null,
    activePoloId: POLO_A,
  });
});

test('lista explicita prevalece sobre flag global e impede ampliacao acidental', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: 'global',
    explicitPoloIds: [POLO_A, POLO_A, POLO_B],
    allPolos: true,
    preferredPoloId: 'polo-fora-do-escopo',
  }), {
    isGlobal: false,
    allowedPoloIds: [POLO_A, POLO_B],
    activePoloId: POLO_A,
  });
});

test('usuario global sem flag nem polos permanece sem acesso', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: 'global',
    explicitPoloIds: [],
    allPolos: false,
  }), {
    isGlobal: false,
    allowedPoloIds: [],
    activePoloId: null,
  });
});

test('identificadores invalidos sao descartados e nao viram escopo operacional', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: 'GLOBAL',
    explicitPoloIds: ['nao-e-uuid'],
    allPolos: false,
    preferredPoloId: 'tambem-invalido',
  }), {
    isGlobal: false,
    allowedPoloIds: [],
    activePoloId: null,
  });
});

test('contexto de polo vira escopo restrito quando nao ha lista individual', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: POLO_B,
    explicitPoloIds: [],
    allPolos: false,
  }), {
    isGlobal: false,
    allowedPoloIds: [POLO_B],
    activePoloId: POLO_B,
  });
});

test('aceita o UUID legado da matriz conforme a forma lexical do PostgreSQL', () => {
  assert.deepEqual(resolveGestorPoloScope({
    context: MATRIZ_POLO_ID,
    explicitPoloIds: [],
    allPolos: false,
    preferredPoloId: MATRIZ_POLO_ID,
  }), {
    isGlobal: false,
    allowedPoloIds: [MATRIZ_POLO_ID],
    activePoloId: MATRIZ_POLO_ID,
  });
});
