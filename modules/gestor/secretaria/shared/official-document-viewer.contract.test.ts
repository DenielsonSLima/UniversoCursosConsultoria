import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('boletim usa o visualizador oficial emitido com download e impressão', async () => {
  const [emissionPage, issuedModal, viewer, constants] = await Promise.all([
    readFile(new URL('./SecretariaDocumentoEmissionPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaIssuedDocumentModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../historico-emissoes/components/ReprintModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../historico-emissoes/historico-emissoes.constants.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(emissionPage, /SecretariaAcademicDocumentPreview/);
  assert.doesNotMatch(emissionPage, /setIsAcademicPreviewOpen/);
  assert.match(emissionPage, /setIssuedEmissions\(data\.emissions\)/);
  assert.match(emissionPage, /setIsIssuedDocumentOpen\(true\)/);
  assert.match(emissionPage, /<SecretariaIssuedDocumentModal/);
  assert.match(issuedModal, /downloadEmissionPdf\(/);
  assert.match(issuedModal, /isOfficialVectorDocument/);
  assert.match(constants, /'boletim'/);
  assert.match(issuedModal, /CanonicalDocumentPreviewModal/);
  assert.match(issuedModal, /createEmissionDocumentsPdf\(sources, \{[\s\S]*?\.\.\.options,[\s\S]*?onProgress:/);
  assert.match(viewer, /Download PDF/);
  assert.match(viewer, /printLabel = 'Imprimir/);
  assert.match(viewer, /src=\{pdfUrl\}/);
});

test('download oficial é bloqueado durante carregamento ou falha do documento', async () => {
  const [viewer, issuedModal] = await Promise.all([
    readFile(new URL('../historico-emissoes/components/ReprintModal.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./SecretariaIssuedDocumentModal.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(viewer, /disabled=\{isDownloading \|\| isReissuing \|\| isLoading \|\| isBlocked\}/);
  assert.match(viewer, /disabled=\{isReissuing \|\| isDownloading \|\| isLoading \|\| isBlocked\}/);
  assert.match(issuedModal, /Documento emitido indisponível/);
});

test('histórico reutiliza na segunda via o mesmo Blob vetorial aberto na prévia', async () => {
  const historyPage = await readFile(
    new URL('../historico-emissoes/SecretariaHistoricoEmissoesPage.tsx', import.meta.url),
    'utf8',
  );

  assert.match(historyPage, /const previewBlob = vectorPreviewPdfRef\.current\?\.blob/);
  assert.match(historyPage, /const pdfBlob = previewBlob \|\| \(await createEmissionDocumentsPdf/);
  assert.match(historyPage, /if \(!previewBlob\) replaceVectorPreviewPdf\(pdfBlob\)/);
});
