import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('./useTechnicalEnrollmentConfirmation.ts', import.meta.url),
  'utf8',
);

test('matrícula técnica atualiza alunos e os cards oficiais de turmas', () => {
  const postPreLink = source.slice(
    source.indexOf('preLinkConfirmed = true'),
    source.indexOf('let effectiveMatricula'),
  );

  assert.match(postPreLink, /academicLifecycleKeys\.alunos\(turmaId\)/);
  assert.match(postPreLink, /gestaoQueryKeys\.classesByModality\("TECNICO"\)/);
  assert.match(postPreLink, /gestaoQueryKeys\.summaries\(\)/);
  assert.match(postPreLink, /gestaoQueryKeys\.activeClassesRoot\(\)/);
  assert.match(postPreLink, /await Promise\.all\(/);
});
