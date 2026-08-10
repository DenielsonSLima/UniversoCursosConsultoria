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
  assert.doesNotMatch(canvas, /showLegalName/);
  assert.doesNotMatch(canvas, /cabecalho \|\| 'UNIVERSO CURSOS E CONSULTORIA'/);
  assert.match(service, /cabecalho: ''/);
  assert.match(service, /normalizeContractSectionHeader/);
  assert.doesNotMatch(documentHeader, /showLegalName|resolvedRazao/);
});

test('prévia estrutural reaproveita a última página para assinaturas quando houver espaço', async () => {
  const canvas = await readFile(
    new URL('../../cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoCanvas.tsx', import.meta.url),
    'utf8',
  );

  assert.match(canvas, /completeLastPageBodyLineLimit = 38/u);
  assert.match(canvas, /isCompleteMinuta \? 125 : 90/u);
  assert.match(canvas, /estimateBodyLines\(lastPage\.body\) <= completeLastPageBodyLineLimit/u);
  assert.match(canvas, /lastPage\.footer = normalizedFooter/u);
  assert.match(canvas, /if \(!closingFitsLastPage\)/u);
  assert.match(canvas, /text-\[10\.5px\] leading-\[1\.45\]/u);
});

test('confirmação de ativação ocupa a viewport inteira por portal', async () => {
  const editor = await readFile(
    new URL('../../cadastros/modelos-documentos/contrato-aluno/components/ContratoAlunoTemplateEditor.tsx', import.meta.url),
    'utf8',
  );

  assert.match(editor, /import \{ createPortal \} from 'react-dom'/u);
  assert.match(editor, /createPortal\(\(/u);
  assert.match(editor, /fixed inset-0 z-\[9999\]/u);
  assert.match(editor, /min-h-\[100dvh\] w-screen/u);
  assert.match(editor, /document\.body/u);
});

test('minuta compacta remove subtítulo e filete vermelho sem afetar versões históricas', async () => {
  const [renderer, pdf] = await Promise.all([
    readFile(new URL('./components/ContratoAlunoDocumentRenderer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./contratos-aluno.pdf.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(renderer, /!isCompleteMinutaPresentation && pageIndex === 0 && sectionHeader/u);
  assert.match(renderer, /!isCompleteMinutaPresentation && \(isLegacyPresentation \|\| pageIndex === 0\)/u);
  assert.match(renderer, /text-\[11px\] leading-\[1\.25\]/u);
  assert.match(pdf, /V3_CONTINUATION_BODY_START = 60/u);
  assert.match(pdf, /CONTRACT_V3_BODY_FONT_SIZE = 8\.5/u);
  assert.match(pdf, /CONTRACT_V3_BODY_LINE_HEIGHT_FACTOR = 1\.22/u);
  assert.match(pdf, /sectionHeader && isFirstPage && presentationMode !== "V3"/u);
  assert.match(pdf, /shouldDrawAccent = presentationMode !== "V3"/u);
});

test('PDF vetorial numera todas as páginas dentro de cada contrato', async () => {
  const pdf = await readFile(
    new URL('./contratos-aluno.pdf.ts', import.meta.url),
    'utf8',
  );

  assert.match(pdf, /const drawContractPageNumber =/u);
  assert.match(pdf, /`Página \$\{currentPage\} de \$\{totalPages\}`/u);
  assert.match(pdf, /drawContractPageNumber\(pdf, currentPage, totalPages\)/u);
  assert.match(pdf, /visualPageIndex \+ 1,\s*visual\.pages\.length,/u);
});
