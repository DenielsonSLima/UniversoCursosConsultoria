import assert from 'node:assert/strict';
import {
  createDocumentValidationQrDataUrl,
} from '../../../../../../shared/document-validation/document-validation.qr';
import {
  loadPdfImage,
} from './diario-pdf-image';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test('Diário emite pela RPC canônica e não grava validation_* em templates', async () => {
  const [hookSource, modalSource] = await Promise.all([
    Deno.readTextFile(
      new URL('./hooks/useDiarioPdfDownload.ts', import.meta.url),
    ),
    Deno.readTextFile(
      new URL('./export/DiarioExportModal.tsx', import.meta.url),
    ),
  ]);

  assert.match(hookSource, /emitir_diario_validacao_portal/);
  assert.match(hookSource, /p_idempotency_key/);
  assert.match(hookSource, /createDocumentReissueKey/);
  assert.match(hookSource, /if\s*\(error\)\s*throw error/);
  assert.match(hookSource, /row\?\.documento !== 'diario_classe'/);
  assert.match(hookSource, /if \(!row\.validacao_publica\) \{\s*return null;/);
  assert.doesNotMatch(
    hookSource,
    /A validação pública de novas emissões do Diário está desativada/,
  );
  assert.doesNotMatch(hookSource, /documentos_templates/);
  assert.doesNotMatch(hookSource, /validation_\$\{/);
  assert.doesNotMatch(modalSource, /prepareValidationCode/);
  assert.match(
    modalSource,
    /A prévia não emite no backend[\s\S]*DIARIO_PREVIEW_VALIDATION_CODE/,
  );
  assert.match(modalSource, /validationPreview:\s*!isBlank/);
  assert.doesNotMatch(
    modalSource,
    /validationCode:\s*null,[\s\S]*imprimirValidacaoContracapa:\s*false/,
  );
});

Deno.test('PDF e contracapa usam somente o código retornado pelo backend', async () => {
  const [pdfSource, backCoverSource, utilitySource, editorCanvasSource] = await Promise.all([
    Deno.readTextFile(new URL('./diario-pdf.ts', import.meta.url)),
    Deno.readTextFile(new URL('./DiarioPrintBackCover.tsx', import.meta.url)),
    Deno.readTextFile(new URL('./diario-classe.utils.ts', import.meta.url)),
    Deno.readTextFile(
      new URL(
        '../../../../../cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx',
        import.meta.url,
      ),
    ),
  ]);

  assert.match(pdfSource, /props\.validationCode\?\.trim\(\)/);
  assert.match(backCoverSource, /canonicalValidationCode/);
  assert.doesNotMatch(pdfSource, /getDiarioValidationCode/);
  assert.doesNotMatch(backCoverSource, /getDiarioValidationCode/);
  assert.doesNotMatch(utilitySource, /DIA-\$\{/);
  assert.match(editorCanvasSource, /www\.universocc\.com\.br\/validador/);
  assert.doesNotMatch(editorCanvasSource, /universocock/);
});

Deno.test('QR local do Diário vira bytes PNG sem depender de fetch(data:)', async () => {
  const dataUrl = await createDocumentValidationQrDataUrl(
    'DIA-TECNICO-TESTE-SAFARI',
    { size: 120 },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('fetch não deve receber a imagem base64 local');
  }) as typeof fetch;

  try {
    const image = await loadPdfImage(dataUrl);
    assert.equal(image?.format, 'PNG');
    assert.deepEqual(
      [...(image?.bytes.subarray(0, 8) || [])],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('impressão do Diário aguarda o helper seguro antes de liberar a operação', async () => {
  const [hookSource, diarioClasseSource] = await Promise.all([
    Deno.readTextFile(
      new URL('./hooks/useDiarioPdfDownload.ts', import.meta.url),
    ),
    Deno.readTextFile(new URL('./DiarioClasse.tsx', import.meta.url)),
  ]);

  assert.match(
    hookSource,
    /import \{ printPdfBlob \} from '@\/modules\/gestor\/secretaria\/shared\/pdf-blob-print'/,
  );
  assert.doesNotMatch(hookSource, /document\.createElement\('iframe'\)/);

  const printCall = hookSource.indexOf("await printPdfBlob(pdf.output('blob')");
  const operationRelease = hookSource.indexOf(
    'validationOperationRef.current = null;',
    printCall,
  );
  assert.ok(printCall >= 0, 'a impressão deve aguardar o helper compartilhado');
  assert.ok(
    operationRelease > printCall,
    'a chave idempotente só pode ser liberada depois da impressão segura',
  );
  assert.match(hookSource, /printProps\?\.template\?\.imprimirValidacaoContracapa/);
  assert.doesNotMatch(
    hookSource,
    /printProps\.template\.imprimirValidacaoContracapa,\s*\n\s*printProps\.turma/,
  );
  assert.match(diarioClasseSource, /if \(!diarioTemplate\) return null;/);
  assert.match(diarioClasseSource, /\{diarioTemplate && printProps && \(/);
  assert.match(hookSource, /contracapaUrl:\s*null/);
});
