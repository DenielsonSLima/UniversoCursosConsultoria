import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [pageSource, hookSource] = await Promise.all([
  readFile(new URL('./TurmasPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../hooks/useProfessorDisciplinas.ts', import.meta.url), 'utf8'),
]);

test('Professor reutiliza o Diário canônico da Gestão', () => {
  assert.match(
    pageSource,
    /import DiarioClasse from ['"]\.\.\/\.\.\/gestor\/gestao\/tecnicos\/detalhes\/components\/diarios\/DiarioClasse['"]/,
  );
  assert.match(pageSource, /<DiarioClasse/);
  assert.match(pageSource, /accessMode="PROFESSOR"/);
  assert.match(pageSource, /disciplina=\{selectedAssignment\.disciplinaForDiario\}/);
  assert.match(pageSource, /turma=\{selectedAssignment\.turmaForDiario\}/);
  assert.doesNotMatch(pageSource, /ProfessorDiario|diario-generico|Capa-Diario\.jpg/);
});

test('disciplinas do Professor vêm do RPC contextual e falham fechadas', () => {
  assert.match(hookSource, /get_professor_disciplinas_portal/);
  assert.match(hookSource, /p_polo_id:\s*poloId/);
  assert.match(hookSource, /if \(error\) throw error/);
  assert.match(pageSource, /O acesso ao diário foi bloqueado/);
});
