import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import {
  createResponsaveisLegaisScope,
  responsaveisLegaisQueryKeys,
} from './responsaveis/responsaveis.query-keys.ts';
import {
  coordenacoesQueryKeys,
  createCoordenacoesScope,
} from './coordenacoes/coordenacoes.query-keys.ts';
import { parceirosQueryKeys } from './parceiros.query-keys.ts';

test('responsáveis isolam listas, detalhes e opções pelo escopo ativo', () => {
  const matriz = { poloId: 'polo-matriz', includeGlobal: true };
  const polo = { poloId: 'polo-a', includeGlobal: false };
  assert.notDeepEqual(
    responsaveisLegaisQueryKeys.list(matriz, '', 'todos'),
    responsaveisLegaisQueryKeys.list(polo, '', 'todos'),
  );
  assert.deepEqual(
    responsaveisLegaisQueryKeys.detail(polo, 'responsavel-1').slice(-2),
    ['detail', 'responsavel-1'],
  );
  assert.equal(
    responsaveisLegaisQueryKeys.alunosParaVinculo(polo).at(-1),
    'alunos-para-vinculo',
  );
});

test('coordenações isolam listas e opções pelo escopo ativo', () => {
  const matriz = { poloId: 'polo-matriz', includeGlobal: true };
  const polo = { poloId: 'polo-a', includeGlobal: false };
  assert.notDeepEqual(
    coordenacoesQueryKeys.list(matriz, 'curso', 'ATIVA'),
    coordenacoesQueryKeys.list(polo, 'curso', 'ATIVA'),
  );
  assert.equal(coordenacoesQueryKeys.opcoes(polo).at(-1), 'opcoes');
});

test('troca entre dois polos nunca reutiliza a mesma chave e exige seleção explícita', () => {
  const poloA = createResponsaveisLegaisScope('polo-a', false);
  const poloB = createResponsaveisLegaisScope('polo-b', false);
  assert.ok(poloA);
  assert.ok(poloB);
  assert.notDeepEqual(
    responsaveisLegaisQueryKeys.list(poloA, '', 'todos'),
    responsaveisLegaisQueryKeys.list(poloB, '', 'todos'),
  );
  assert.equal(createResponsaveisLegaisScope(null, false), null);
  assert.equal(createCoordenacoesScope('todos', true), null);
});

test('invalidação por polo alcança variantes local/global sem invalidar outro polo', async () => {
  const poloALocal = { poloId: 'polo-a', includeGlobal: false };
  const poloAGlobal = { poloId: 'polo-a', includeGlobal: true };
  const poloBLocal = { poloId: 'polo-b', includeGlobal: false };
  for (const factory of [responsaveisLegaisQueryKeys, coordenacoesQueryKeys]) {
    const queryClient = new QueryClient();
    const keyALocal = factory.list(poloALocal, '', 'todos');
    const keyAGlobal = factory.list(poloAGlobal, '', 'todos');
    const keyBLocal = factory.list(poloBLocal, '', 'todos');

    queryClient.setQueryData(keyALocal, { items: ['a-local'] });
    queryClient.setQueryData(keyAGlobal, { items: ['a-global'] });
    queryClient.setQueryData(keyBLocal, { items: ['b-local'] });
    await queryClient.invalidateQueries({
      queryKey: factory.polo('polo-a'),
      refetchType: 'none',
    });

    assert.equal(queryClient.getQueryState(keyALocal)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(keyAGlobal)?.isInvalidated, true);
    assert.equal(queryClient.getQueryState(keyBLocal)?.isInvalidated, false);
  }
});

test('matrículas de parceiros usam chave exata por aluno', () => {
  assert.deepEqual(
    parceirosQueryKeys.matriculas('aluno-a'),
    ['parceiro', 'aluno-a', 'matriculas'],
  );
  assert.notDeepEqual(
    parceirosQueryKeys.matriculas('aluno-a'),
    parceirosQueryKeys.matriculas('aluno-b'),
  );
});
