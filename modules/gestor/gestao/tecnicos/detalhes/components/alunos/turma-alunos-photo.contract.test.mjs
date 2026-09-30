import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [service, table] = await Promise.all([
  readFile(new URL('../../academic-lifecycle.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./TurmaAlunosTable.tsx', import.meta.url), 'utf8'),
]);

test('contrato acadêmico transporta a foto retornada pela RPC', () => {
  assert.match(service, /foto_url: string \| null;/);
  assert.match(service, /rpc\('get_turma_alunos_academico'/);
});

test('lista da turma mostra a foto e preserva a inicial como fallback', () => {
  assert.match(table, /const StudentAvatar/);
  assert.match(table, /student\.foto_url && !imageFailed/);
  assert.match(table, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(table, /setImageFailed\(false\)/);
  assert.match(table, /student\.nome\.trim\(\)\.charAt\(0\)\.toUpperCase\(\) \|\| '\?'/);
  assert.match(table, /<StudentAvatar student=\{student\} \/>/);
});
