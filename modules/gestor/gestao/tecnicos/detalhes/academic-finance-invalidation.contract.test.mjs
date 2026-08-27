import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8');

const [table, classMutations, partnerEnrollments] = await Promise.all([
  readSource('./components/alunos/TurmaAlunosTable.tsx'),
  readSource('./hooks/useTurmaAlunosMutations.ts'),
  readSource('../../../parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculas.tsx'),
]);

test('tabela descreve a ausência de frequência sem sugerir ausência financeira', () => {
  assert.match(table, /Sem frequência lançada/);
  assert.doesNotMatch(table, />Sem lançamentos</);
});

test('movimentação pela turma invalida os read models financeiros canônicos', () => {
  assert.match(classMutations, /financeiroQueryKeys\.receivablesRoot/);
  assert.match(classMutations, /financeiroQueryKeys\.resumoKpis/);
  assert.match(classMutations, /financeiroQueryKeys\.alunoReceivables/);
  assert.doesNotMatch(classMutations, /financeiro-tecnico-recebiveis/);
});

test('movimentação pelo cadastro do aluno invalida os mesmos read models', () => {
  assert.match(partnerEnrollments, /financeiroQueryKeys\.receivablesRoot/);
  assert.match(partnerEnrollments, /financeiroQueryKeys\.resumoKpis/);
  assert.match(partnerEnrollments, /financeiroQueryKeys\.alunoReceivables/);
  assert.doesNotMatch(partnerEnrollments, /financeiro-tecnico-recebiveis/);
});
