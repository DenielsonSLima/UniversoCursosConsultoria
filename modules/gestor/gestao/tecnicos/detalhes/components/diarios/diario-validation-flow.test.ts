import assert from "node:assert/strict";
import {
  createDocumentValidationQrDataUrl,
} from "../../../../../../shared/document-validation/document-validation.qr";
import { loadPdfImage } from "./diario-pdf-image";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

Deno.test("prévia, download e impressão do Diário reutilizam o mesmo Blob canônico", async () => {
  const [hookSource, modalSource, diarioClasseSource] = await Promise.all([
    Deno.readTextFile(
      new URL("./hooks/useDiarioPdfDownload.ts", import.meta.url),
    ),
    Deno.readTextFile(
      new URL("./export/DiarioExportModal.tsx", import.meta.url),
    ),
    Deno.readTextFile(new URL("./DiarioClasse.tsx", import.meta.url)),
  ]);

  assert.match(hookSource, /emitir_diario_validacao_portal/);
  assert.match(hookSource, /p_idempotency_key/);
  assert.match(hookSource, /createDocumentReissueKey/);
  assert.match(hookSource, /if\s*\(error\)\s*throw error/);
  assert.match(hookSource, /row\?\.documento !== 'diario_classe'/);
  assert.match(
    hookSource,
    /if \(!row\.validacao_publica\) \{[\s\S]*?O modelo oficial não será alterado silenciosamente/,
  );
  assert.doesNotMatch(hookSource, /documentos_templates/);
  assert.doesNotMatch(hookSource, /validation_\$\{/);
  assert.equal((hookSource.match(/buildDiarioPdf\(/g) || []).length, 1);
  assert.match(hookSource, /preparedPdfRef\.current\?\.source === printProps/);
  assert.match(hookSource, /const blob = await preparePdfBlob\(\)/);
  assert.match(hookSource, /downloadPdfBlob\(\s*blob,/);
  assert.match(hookSource, /await printPdfBlob\(blob,/);
  assert.doesNotMatch(
    modalSource,
    /buildDiarioPdf|DIARIO_PREVIEW_VALIDATION_CODE/,
  );
  assert.match(modalSource, /void preparePdfBlob\(\)/);
  assert.match(modalSource, /URL\.createObjectURL\(blob\)/);
  assert.match(diarioClasseSource, /preparePdfBlob=\{preparePdfBlob\}/);
  assert.doesNotMatch(
    diarioClasseSource,
    /DiarioPrintDocument|diario-print-document/,
  );
  assert.match(diarioClasseSource, /const watermarkQuery = useQuery\(/);
  assert.match(
    diarioClasseSource,
    /completeDiaryQueries = \[[\s\S]*?watermarkQuery,[\s\S]*?\]/,
  );
  assert.match(
    diarioClasseSource,
    /blankExportQueries = \[[\s\S]*?watermarkQuery,[\s\S]*?\]/,
  );
});

Deno.test("adaptador web resolve a identidade do polo e não usa a turma como instituição", async () => {
  const [adapterSource, institutionalTypeSource, migrationSource] =
    await Promise.all([
      Deno.readTextFile(new URL("./diario-pdf.browser.ts", import.meta.url)),
      Deno.readTextFile(
        new URL(
          "../../../../../../shared/polo-institutional/polo-institutional.types.ts",
          import.meta.url,
        ),
      ),
      Deno.readTextFile(
        new URL(
          "../../../../../../../supabase/migrations/20260823170600_expand_polo_institutional_data_for_official_documents.sql",
          import.meta.url,
        ),
      ),
    ]);

  assert.match(
    adapterSource,
    /poloInstitutionalService\.getByPoloId\(poloId\)/,
  );
  assert.doesNotMatch(adapterSource, /\.from\('polos'\)/);
  assert.match(
    adapterSource,
    /normalizeCanonicalInstitutionalHeader\(\s*institutionalSource/,
  );
  assert.doesNotMatch(
    adapterSource,
    /\|\| props\.turma\) as Record<string, unknown>/,
  );
  assert.match(adapterSource, /O polo emissor do Diário não foi identificado/);
  assert.match(
    adapterSource,
    /A identidade institucional do polo emissor não foi encontrada/,
  );
  assert.match(
    institutionalTypeSource,
    /endereco:[\s\S]*numero:[\s\S]*complemento:[\s\S]*bairro:[\s\S]*cidade:[\s\S]*estado:[\s\S]*cep:[\s\S]*is_matriz:[\s\S]*logo_url:[\s\S]*watermark_url:/,
  );
  assert.match(
    migrationSource,
    /CREATE OR REPLACE FUNCTION public\.get_dados_institucionais_polo/,
  );
  assert.match(migrationSource, /SET search_path = ''/);
  assert.doesNotMatch(migrationSource, /SET search_path = public/);
  for (
    const field of [
      "endereco",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "estado",
      "cep",
      "is_matriz",
      "logo_url",
      "watermark_url",
    ]
  ) {
    assert.match(migrationSource, new RegExp(`'${field}'`));
  }
});

Deno.test("PDF e contracapa usam somente o código retornado pelo backend", async () => {
  const [pdfSource, backCoverSource, utilitySource, editorCanvasSource] =
    await Promise.all([
      Deno.readTextFile(new URL("./diario-pdf.ts", import.meta.url)),
      Deno.readTextFile(
        new URL("./diario-pdf-cover-pages.ts", import.meta.url),
      ),
      Deno.readTextFile(new URL("./diario-classe.utils.ts", import.meta.url)),
      Deno.readTextFile(
        new URL(
          "../../../../../cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx",
          import.meta.url,
        ),
      ),
    ]);

  assert.match(pdfSource, /props\.validationCode\?\.trim\(\)/);
  assert.match(
    backCoverSource,
    /const validationCode = props\.validationCode\?\.trim\(\)/,
  );
  assert.doesNotMatch(pdfSource, /getDiarioValidationCode/);
  assert.doesNotMatch(backCoverSource, /getDiarioValidationCode/);
  assert.doesNotMatch(utilitySource, /DIA-\$\{/);
  assert.match(editorCanvasSource, /www\.universocc\.com\.br\/validador/);
  assert.doesNotMatch(editorCanvasSource, /universocock/);
});

Deno.test("QR local do Diário vira bytes PNG sem depender de fetch(data:)", async () => {
  const dataUrl = await createDocumentValidationQrDataUrl(
    "DIA-TECNICO-TESTE-SAFARI",
    { size: 120 },
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("fetch não deve receber a imagem base64 local");
  }) as typeof fetch;

  try {
    const image = await loadPdfImage(dataUrl);
    assert.equal(image?.format, "PNG");
    assert.deepEqual(
      [...(image?.bytes.subarray(0, 8) || [])],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("impressão do Diário aguarda o helper seguro antes de liberar a operação", async () => {
  const [hookSource, exportHookSource, diarioClasseSource] = await Promise.all([
    Deno.readTextFile(
      new URL("./hooks/useDiarioPdfDownload.ts", import.meta.url),
    ),
    Deno.readTextFile(new URL("./hooks/useDiarioExport.ts", import.meta.url)),
    Deno.readTextFile(new URL("./DiarioClasse.tsx", import.meta.url)),
  ]);

  assert.match(
    hookSource,
    /import \{ printPdfBlob \} from '@\/modules\/gestor\/secretaria\/shared\/pdf-blob-print'/,
  );
  assert.doesNotMatch(hookSource, /document\.createElement\('iframe'\)/);

  const printCall = hookSource.indexOf("await printPdfBlob(blob");
  assert.ok(printCall >= 0, "a impressão deve aguardar o helper compartilhado");
  assert.match(hookSource, /const blob = await preparePdfBlob\(\)/);
  assert.doesNotMatch(hookSource, /printPdfBlob\(pdf\.output\('blob'\)/);
  assert.match(
    hookSource,
    /printProps\?\.template\?\.imprimirValidacaoContracapa/,
  );
  assert.doesNotMatch(
    hookSource,
    /printProps\.template\.imprimirValidacaoContracapa,\s*\n\s*printProps\.turma/,
  );
  assert.match(exportHookSource, /if \(!template\) return null;/);
  assert.match(diarioClasseSource, /\{diarioTemplate && printProps && \(/);
  assert.doesNotMatch(hookSource, /contracapaUrl:\s*null/);
  assert.doesNotMatch(hookSource, /imprimirValidacaoContracapa:\s*false/);
});

Deno.test("editor e compositor consomem a mesma geometria, polo e marca configurados", async () => {
  const [
    settingsSource,
    editorSource,
    editorHookSource,
    serviceSource,
    coverSource,
    contentPagesSource,
  ] = await Promise.all([
    Deno.readTextFile(
      new URL(
        "../../../../../cadastros/modelos-documentos/diarios/components/DiarioBackCoverSettingsPanel.tsx",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../../../cadastros/modelos-documentos/diarios/components/DiarioEditorCanvas.tsx",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../../../cadastros/modelos-documentos/diarios/hooks/useDiarioTemplateEditor.ts",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(
      new URL(
        "../../../../../cadastros/modelos-documentos/diarios/diarios.service.ts",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(new URL("./diario-pdf-cover-pages.ts", import.meta.url)),
    Deno.readTextFile(new URL("./diario-pdf-pages.ts", import.meta.url)),
  ]);

  assert.match(
    settingsSource,
    /field\.id === 'contracapaQrCode' \? \{ \.\.\.field, width \}/,
  );
  assert.match(
    serviceSource,
    /sanitized\.qrCodeSize = Math\.max\([\s\S]*?Math\.min\(50, Math\.round\(\(qrField\.width \/ 100\) \* 297\)\)/,
  );
  assert.match(serviceSource, /injectEditorDefaults = true/);
  assert.match(serviceSource, /sanitizeDiarioTemplate\(content, false\)/);
  assert.match(
    serviceSource,
    /A página 2 de validação e assinaturas é obrigatória/,
  );
  assert.match(
    serviceSource,
    /As áreas de assinatura do Professor e do Coordenador não podem se sobrepor/,
  );
  assert.match(
    serviceSource,
    /O QR Code e seu rótulo precisam estar visíveis, medir entre 20 mm e 70 mm/,
  );
  assert.match(serviceSource, /field\.x \+ field\.width > 100/);
  assert.match(
    serviceSource,
    /qrField\.y \+ qrHeightPercent \+ qrLabelHeightPercent > 100/,
  );
  assert.equal(
    (serviceSource.match(/return loadLandscapeWatermark\(poloId\)/g) || [])
      .length,
    2,
  );
  assert.doesNotMatch(
    serviceSource,
    /poloData\?\.watermark_url|watermark_opacity \?\? 0\.1/,
  );
  assert.match(serviceSource, /SUPPORTED_IMAGE_MIME_TYPES/);
  assert.match(serviceSource, /detectSupportedImageMimeType/);
  assert.match(
    serviceSource,
    /detectedMimeType !== file\.type\.toLowerCase\(\)/,
  );
  assert.match(
    editorSource,
    /<WatermarkLayer watermark=\{props\.previewWatermark\} \/>/,
  );
  assert.doesNotMatch(
    editorSource,
    /activeTab === 'capa' \|\| !props\.form\.contracapaUrl/,
  );
  assert.doesNotMatch(editorSource, /border p-1 transition-colors/);
  assert.match(editorSource, /whiteSpace: singleLine \? 'nowrap' : 'normal'/);
  assert.match(
    editorHookSource,
    /sessionStorage\.getItem\('current_polo_id'\)/,
  );
  assert.match(editorHookSource, /\.eq\('id', previewPoloId\)/);
  assert.doesNotMatch(editorHookSource, /\.limit\(1\)/);
  assert.match(
    coverSource,
    /const baseline = y \+ \(field\.fontSize \|\| 10\) \* 0\.3528/,
  );
  assert.match(coverSource, /pdf\.line\(x, y, x \+ width, y\)/);
  assert.match(coverSource, /drawPageWatermark\(pdf, props, watermark\);/);
  assert.doesNotMatch(coverSource, /Capa-Diario\.jpg|capaDiarioPadrao/);
  assert.doesNotMatch(contentPagesSource, /ASSINATURA DO PROFESSOR/);
  assert.doesNotMatch(contentPagesSource, /ASSINATURA DO COORDENADOR DO CURSO/);
});
