import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('./SecretariaAlunosPage.tsx', import.meta.url),
  'utf8',
);

test('Secretaria não apresenta status cadastral como status da matrícula', () => {
  assert.match(
    source,
    /const matriculaStatus = selectedAluno\.matriculaStatus \|\| matriculas\[0\]\?\.status/,
  );
  assert.match(source, /Matrícula: \{matriculaFormatada\}[\s\S]*?\{matriculaStatus\}/);
  assert.match(source, /Cadastro:[\s\S]*?\{cadastroStatus\}/);
  assert.doesNotMatch(
    source,
    /Matrícula: \{matriculaFormatada\}[\s\S]{0,250}\{selectedAluno\.status\}/,
  );
});

test('resultado de busca sinaliza o status da matrícula', () => {
  assert.match(source, /statusLabel=\{aluno\.matriculaStatus \|\| 'SEM MATRÍCULA'\}/);
  assert.match(source, /statusTone=\{enrollmentStatusTone\(aluno\.matriculaStatus\)\}/);
  assert.doesNotMatch(source, /statusLabel=\{aluno\.status\}/);
});
