import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [listSource, cardSource] = await Promise.all([
  readFile(new URL('./TurmaDiarios.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./TurmaDiarioCard.tsx', import.meta.url), 'utf8'),
]);

test('consulta os artefatos assinados da turma em lote e com paginação canônica', () => {
  assert.match(listSource, /electronicSignatureService\.listGestorArchive\(/);
  assert.match(listSource, /status:\s*'ASSINADO'/);
  assert.match(listSource, /documentType:\s*'diario_classe'/);
  assert.match(listSource, /turmaId,/);
  assert.match(listSource, /limit:\s*100/);
  assert.match(listSource, /cursor\s*=\s*page\.nextCursor/);
  assert.match(listSource, /while \(cursor\)/);
  assert.doesNotMatch(listSource, /getCurrentDiaryEnvelope/);
});

test('card oferece separadamente somente os artefatos autorizados pelo acervo', () => {
  assert.match(listSource, /item\.artifacts\.final \|\| item\.artifacts\.receipt/);
  assert.match(listSource, /signedDiariesQuery\.data\?\.get\(disciplina\.id\)/);
  assert.match(listSource, /onOpenSignedPdf=\{signedDiary[\s\S]*?\.artifacts\.final/);
  assert.match(listSource, /onOpenEvidenceReceipt=\{signedDiary[\s\S]*?\.artifacts\.receipt/);
  assert.match(cardSource, /\{onOpenSignedPdf \|\| onOpenEvidenceReceipt \? \(/);
  assert.match(cardSource, /'Diário assinado'/);
  assert.match(cardSource, /'Comprovante — 2 páginas'/);
});

test('abertura mantém classes e escopos separados na Edge canônica', () => {
  assert.match(listSource, /electronicSignatureService\.createArtifactDownloadUrl\(/);
  assert.match(listSource, /openSignedDiaryArtifact\(signedDiary, 'DOCUMENTO_FINAL'\)/);
  assert.match(listSource, /openSignedDiaryArtifact\(signedDiary, 'COMPROVANTE_EVIDENCIA'\)/);
  assert.match(listSource, /artifactClass,/);
  assert.match(listSource, /item\.envelopeId, artifactClass/);
  assert.match(listSource, /profile:\s*'GESTOR'/);
  assert.match(listSource, /clearElectronicSignatureRequestId\(/);
  assert.doesNotMatch(
    `${listSource}\n${cardSource}`,
    /\.storage\b|createSignedUrl|storage_path|storagePath/,
  );
});

test('reserva a aba no clique antes de aguardar a URL temporária', () => {
  const popupIndex = listSource.indexOf("const previewWindow = window.open('', '_blank')");
  const awaitIndex = listSource.indexOf(
    'await electronicSignatureService.createArtifactDownloadUrl',
    popupIndex,
  );
  assert.ok(popupIndex >= 0);
  assert.ok(awaitIndex > popupIndex);
  assert.match(listSource, /previewWindow\?\.close\(\)/);
  assert.match(listSource, /actionLabel:\s*'Abrir PDF'/);
});

test('cache isola gestor, contexto, polo e turma', () => {
  assert.match(
    listSource,
    /electronicSignatureQueryKeys\.archiveLists\('GESTOR', gestorContextId, poloId \|\| null\)/,
  );
  assert.match(listSource, /'turma-card-artifacts',\s*turma\.id/);
});
