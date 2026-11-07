import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('pasta em lote segue o seletor compacto da carteirinha e permite todo o polo', async () => {
  const [workspace, selection, service] = await Promise.all([
    readFile(new URL('../shared/useSecretariaDocumentoWorkspace.ts', import.meta.url), 'utf8'),
    readFile(new URL('../shared/SecretariaDocumentoBatchSelection.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../shared/secretaria-documentos.service.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(workspace, /supportsAllStudentsBatch = definition\.id === 'pasta_identificacao'/);
  assert.match(workspace, /supportsBatchModalidadeFilter/);
  assert.match(workspace, /mapModalidadeOptions\(definition\.id\)/);
  assert.match(selection, /Tipo de modalidade/);
  assert.match(selection, /selectedBatchModalidade/);
  assert.match(selection, /value: 'todos', label: 'Todos os alunos deste polo'/);
  assert.match(selection, /<InstitutionalSelect/);
  assert.doesNotMatch(selection, /<select\b/);
  assert.match(selection, /selectedTurmaId === 'todos'/);
  assert.match(workspace, /allStudentsInPolo:/);
  assert.match(workspace, /pastaBatchTurmas = turmas/);
  assert.match(selection, /alunos ativos no polo/);

  assert.match(service, /allStudentsInPolo\?: boolean/);
  assert.match(service, /if \(input\.allStudentsInPolo\)/);
  assert.match(service, /input\.documento !== 'pasta_identificacao'/);
  assert.match(service, /query = query\.eq\('turma_id', input\.turmaId\)/);
  assert.match(service, /input\.modo === 'lote' &&/);
  assert.match(service, /input\.activeEnrollmentOnly \|\| isActiveRegistrationBatch/);
  const catalog = await readFile(new URL('../shared/secretaria-documentos.catalogo.ts', import.meta.url), 'utf8');
  assert.match(catalog, /modalidadeFilter\?: string \| null/);
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
