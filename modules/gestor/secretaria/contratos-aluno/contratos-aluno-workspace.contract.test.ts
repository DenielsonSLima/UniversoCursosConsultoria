import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Contratos de Aluno segue os três fluxos visuais da Pasta de Identificação', async () => {
  const workspace = await readFile(
    new URL('./components/ContratosAlunoEmissionWorkspace.tsx', import.meta.url),
    'utf8',
  );

  assert.match(workspace, /SecretariaAlunoSearchCard/);
  assert.match(workspace, /border-cyan-200 bg-cyan-50 text-cyan-800/);
  assert.match(workspace, /normalizeSecretariaSearch/);
  assert.match(workspace, /cpf=\{representative\.alunoCpf\}/);
  assert.match(workspace, /matricula=\{formatMatricula/);
  assert.match(workspace, /fotoUrl=\{representative\.alunoFotoUrl\}/);
  assert.match(workspace, /tone="blue"/);
  assert.match(workspace, /Contrato do Aluno individual/);
  assert.match(workspace, /Emissão em lote/);
  assert.match(workspace, /Montar lista personalizada/);
  assert.match(workspace, /Selecione a modalidade/);
  assert.match(workspace, /Todos os alunos da modalidade/);
  assert.match(workspace, /Adicionar à lista/);
  assert.match(workspace, /onReplaceSelection\(ids\)/);
  assert.match(workspace, /selectedCount > 100/);
  assert.match(workspace, /aria-pressed=\{active\}/);
  assert.match(workspace, /aria-label="Buscar aluno para contrato individual"/);
  assert.match(workspace, /htmlFor="contrato-lote-modalidade"/);
  assert.match(workspace, /<Printer size=\{16\}/);
  assert.doesNotMatch(workspace, /ContratosAlunoPreparedResult/);
  assert.doesNotMatch(workspace, /Selecionar visíveis/);
});

test('troca de modo limpa estado oculto e emissão abre a prévia canônica diretamente', async () => {
  const page = await readFile(
    new URL('./SecretariaContratosAlunoPage.tsx', import.meta.url),
    'utf8',
  );

  const changeMode = page.slice(
    page.indexOf('const changeMode'),
    page.indexOf('const toggleTarget'),
  );
  assert.match(changeMode, /setSearchTerm\(''\)/);
  assert.match(changeMode, /setBatchModality\(''\)/);
  assert.match(changeMode, /setTurmaId\(''\)/);
  assert.match(changeMode, /setSelectedEnrollmentIds\(\[\]\)/);
  assert.match(changeMode, /requestRef\.current = null/);
  assert.match(page, /setPreviewIndex\(prepared\.documents\.length \? 0 : null\)/);
  assert.match(page, /<CanonicalDocumentPreviewModal/);
});

test('Histórico reconstrói contrato somente do snapshot congelado e reutiliza o PDF vetorial', async () => {
  const [history, constants] = await Promise.all([
    readFile(new URL('../historico-emissoes/SecretariaHistoricoEmissoesPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../historico-emissoes/historico-emissoes.constants.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(constants, /key: 'contrato_aluno'/);
  assert.match(history, /normalizeCanonicalDocumentRenderPayload/);
  assert.match(history, /frozen\.templateSnapshot/);
  assert.match(history, /frozen\.contractSnapshot/);
  assert.match(history, /frozen\.renderedDocument/);
  assert.match(history, /createContratosAlunoPdf/);
  assert.match(history, /previewLoadTokenRef\.current !== loadToken/);
  assert.match(history, /vectorPreviewPdfRef\.current\?\.emissionKey === preparedEmissionKey/);
  assert.match(history, /const pdfBlob = previewBlob/);
  assert.match(history, /await printPdfBlob\(pdfBlob/);
});

test('editor do contrato respeita cabeçalho vazio e não repete a identidade institucional', async () => {
  const [canvas, service, documentHeader] = await Promise.all([
    readFile(new URL('../../cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoCanvas.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../cadastros/modelos-documentos/contrato-aluno/services/contrato-aluno-template.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../components/DocumentHeader.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(canvas, /normalizeContractSectionHeader\(cabecalho/);
  assert.match(canvas, /showLegalName=\{false\}/);
  assert.doesNotMatch(canvas, /cabecalho \|\| 'UNIVERSO CURSOS E CONSULTORIA'/);
  assert.match(service, /cabecalho: ''/);
  assert.match(service, /normalizeContractSectionHeader/);
  assert.match(documentHeader, /showLegalName && resolvedRazao/);
});
