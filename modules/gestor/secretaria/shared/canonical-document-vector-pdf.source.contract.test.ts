import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readContractPdfSource = async () => (await Promise.all([
  '../contratos-aluno/contratos-aluno.pdf.ts',
  ...['model', 'assets', 'body', 'closing', 'page'].map((name) => `../contratos-aluno/pdf/${name}.ts`),
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))).join('\n');

test("preview oficial recebe um Blob PDF nativo, sem conversor de página em canvas", async () => {
  const [modal, contractPdf, preceptorPdf, verticalPreceptorPdf] = await Promise.all([
    readFile(
      new URL("./CanonicalDocumentPreviewModal.tsx", import.meta.url),
      "utf8",
    ),
    readContractPdfSource(),
    readFile(
      new URL(
        "../carteirinhas-preceptor/carteirinhas-preceptor.pdf.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../carteirinhas-preceptor/carteirinhas-preceptor-vertical.pdf.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(modal, /<iframe/);
  assert.match(modal, /createPdfRef\.current\(currentItems/);
  assert.match(modal, /createPortal\(modal, document\.body\)/);
  assert.match(modal, /id="canonical-document-preview-modal"/);
  assert.doesNotMatch(
    modal,
    /dom-to-selectable-pdf|createSelectablePdfBuilder|html2canvas/,
  );
  assert.doesNotMatch(
    contractPdf,
    /html2canvas|createElement\('canvas'\)|toDataURL\(/,
  );
  assert.doesNotMatch(
    preceptorPdf,
    /html2canvas|createElement\('canvas'\)|toDataURL\(/,
  );
  assert.doesNotMatch(
    verticalPreceptorPdf,
    /html2canvas|createElement\('canvas'\)|toDataURL\(/,
  );
  assert.match(contractPdf, /contrato-qr-\$\{document\.emissionId\}/);
  assert.match(contractPdf, /visualPageIndex === visual\.pages\.length - 1/);
  assert.match(contractPdf, /visualPageIndex === 0/);
  assert.match(contractPdf, /const shouldDrawAccent = presentationMode !== "V3"[\s\S]*?presentationMode === "LEGACY" \|\| isFirstPage/u);
  assert.match(contractPdf, /const hasClosing = isFinalPage/);
  assert.match(contractPdf, /drawContractClosing/);
  assert.match(contractPdf, /normalizeContractClosingPositions/);
  assert.match(contractPdf, /template\.layoutEncerramento/);
  assert.match(contractPdf, /visual\.closingPositions/);
  assert.match(contractPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(contractPdf, /drawContractInstitutionalHeaderLegacy/);
  assert.match(contractPdf, /drawContractWatermarkLegacy/);
  assert.match(contractPdf, /x: 25/);
  assert.match(contractPdf, /y: 62/);
  assert.match(contractPdf, /width: 160/);
  assert.match(contractPdf, /height: 172/);
  assert.match(contractPdf, /rotate: 35/);
  assert.doesNotMatch(contractPdf, /drawContractInstitutionalHeaderV2/);
  assert.match(contractPdf, /resolveContractPresentationMode/);
  assert.match(contractPdf, /watermark\.rotate \? -45 : 0/);
  assert.match(contractPdf, /normalizeContractSectionHeader\(page\.header/);
  assert.doesNotMatch(contractPdf, /showLegalName/);
  assert.match(contractPdf, /drawCanonicalPdfText\(pdf, sectionHeader/);
  assert.match(contractPdf, /resolveCanonicalPdfPhoto/);
  assert.doesNotMatch(contractPdf, /align: 'justify'/);
  assert.match(preceptorPdf, /preceptor-qr-\$\{card\.source\.emissionId\}/);
  assert.match(preceptorPdf, /CARDS_PER_SHEET = 10/);
  assert.match(verticalPreceptorPdf, /const CARD_HEIGHT = 85\.6/);
  assert.match(verticalPreceptorPdf, /PRECEPTOR_NOME/);
  assert.match(verticalPreceptorPdf, /snapshot\.emissao/);
  assert.match(
    verticalPreceptorPdf,
    /template\.cargoPadrao, template\.textoFrente, renderedFront\.role/,
  );
});
