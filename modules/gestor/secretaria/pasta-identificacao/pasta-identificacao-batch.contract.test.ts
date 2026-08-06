import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pasta em lote segue o seletor compacto da carteirinha e permite todo o polo', async () => {
  const [page, service] = await Promise.all([
    readFile(new URL('../shared/SecretariaDocumentoEmissionPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../shared/secretaria-documentos.service.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /supportsAllStudentsBatch = definition\.id === 'pasta_identificacao'/);
  assert.match(page, /<option value="todos">Todos os alunos deste polo<\/option>/);
  assert.match(page, /selectedTurmaId === 'todos'/);
  assert.match(page, /allStudentsInPolo:/);
  assert.match(page, /turmas\.filter\(\(turma\) => turma\.totalAlunos > 0\)/);
  assert.match(page, /alunos ativos no polo/);

  assert.match(service, /allStudentsInPolo\?: boolean/);
  assert.match(service, /if \(input\.allStudentsInPolo\)/);
  assert.match(service, /input\.documento !== 'pasta_identificacao'/);
  assert.match(service, /query = query\.eq\('turma_id', input\.turmaId\)/);
  assert.match(service, /input\.documento === 'pasta_identificacao' && input\.modo === 'lote'/);
  assert.match(service, /input\.activeEnrollmentOnly \|\| isActiveFolderBatch/);
});

test('lote geral não amplia silenciosamente outros documentos', async () => {
  const service = await readFile(
    new URL('../shared/secretaria-documentos.service.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    service,
    /A emissão para todo o polo não está disponível para este documento/,
  );
  assert.match(service, /Selecione uma turma para preparar a emissão em lote/);
});
