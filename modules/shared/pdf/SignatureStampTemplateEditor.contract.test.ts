// @ts-nocheck -- contrato de interação explícita do editor visual.

import assert from "node:assert/strict";

const source = await Deno.readTextFile(
  new URL("./SignatureStampTemplateEditor.tsx", import.meta.url),
);
const serviceSource = await Deno.readTextFile(
  new URL(
    "../assinatura-eletronica/assinatura-eletronica.service.ts",
    import.meta.url,
  ),
);

Deno.test("editor oferece tamanho visível para qualquer elemento", () => {
  assert.match(
    source,
    /const adjustSelectedElementSize = \(deltaBp: number\)/u,
  );
  assert.match(source, /Área: \{Math\.round\(selectedElement\.widthBp/u);
  assert.ok(source.includes("Aumentar área de ${"));
  assert.ok(source.includes("Diminuir área de ${"));
  assert.match(source, /h-11 w-11 touch-manipulation/u);
  assert.doesNotMatch(source, /adjustSelectedQrSize/u);
  assert.match(source, /getSignatureStampTemplateElementVisualBounds/u);
  assert.match(
    source,
    /selectedElement\.kind === "QR"\s*\? resizeSignatureStampTemplateElement/u,
  );
  assert.match(
    source,
    /const size = element\.widthBp \+ sizeDelta;\s*return resizeSignatureStampTemplateElement\(element, size, size\)/u,
  );
  assert.doesNotMatch(source, /40_000/u);
});

Deno.test("editor torna ocultação e bloqueio de QR explícitos", () => {
  assert.match(source, /Ocultar do carimbo/u);
  assert.match(source, /Restaurar no carimbo/u);
  assert.match(source, /Trash2/u);
  assert.match(
    source,
    /Este item é obrigatório no carimbo e não pode ser excluído/u,
  );
  assert.match(source, /getSignatureStampTemplateQrCollisionElementIds/u);
  assert.match(source, /role="status"/u);
});

Deno.test("QR não reposiciona código ou URL implicitamente", () => {
  const helperCalls = source.match(
    /placeSignatureStampVerificationBelowQr/g,
  ) || [];
  assert.equal(
    helperCalls.length,
    2,
    "o helper deve aparecer somente no import e no botão explícito",
  );

  const applyCandidateSource = source.slice(
    source.indexOf("const applyCandidate"),
    source.indexOf("const continueInteraction"),
  );
  const commitElementSource = source.slice(
    source.indexOf("const commitElement"),
    source.indexOf("const adjustSelectedElementSize"),
  );
  assert.doesNotMatch(
    applyCandidateSource,
    /placeSignatureStampVerificationBelowQr/,
  );
  assert.doesNotMatch(
    commitElementSource,
    /placeSignatureStampVerificationBelowQr/,
  );
  assert.match(source, /onClick=\{\(\) => onSelect\(element\.id\)\}/u);
  assert.match(source, /onClick=\{applyStandardVerificationLayout\}/u);
});

Deno.test("editor expõe tipografia segura sem liberar conteúdo", () => {
  assert.match(source, /const adjustSelectedTextFontSize/u);
  assert.match(source, /const toggleSelectedTextBold/u);
  assert.match(source, /const toggleSelectedTextOblique/u);
  assert.match(source, /const alignSelectedText/u);
  assert.match(source, /Alternar negrito/u);
  assert.match(source, /Alternar itálico/u);
  assert.match(source, /Alinhar à esquerda/u);
  assert.match(source, /Centralizar/u);
  assert.match(source, /Alinhar à direita/u);
  assert.match(source, /aria-pressed=\{isSignatureStampTemplateFontBold/u);
  assert.match(
    source,
    /aria-pressed=\{selectedElement\.style\.align === align\}/u,
  );
  assert.match(
    source,
    /Pick<[\s\S]*"font" \| "fontSizeBp" \| "align"/u,
  );
  assert.match(
    source,
    /Conteúdo, vínculo, rótulo e cor ficam protegidos/u,
  );
  assert.doesNotMatch(source, /set.*label/u);
  assert.doesNotMatch(source, /set.*binding/u);
  assert.doesNotMatch(source, /set.*color/u);
});

Deno.test("prévia usa texto atual e URL humana curta sem alterar o QR", () => {
  assert.match(source, /ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE/u);
  assert.doesNotMatch(source, /DISPLAY_TITLE: "Assinatura eletrônica"/u);
  assert.match(source, /element\.id === "signerName"\s*\? ""/u);
  assert.match(source, /formatDocumentValidationUrlForDisplay\(sampleValue\)/u);
  assert.match(
    source,
    /const SAMPLE_QR_URL =\s*"https:\/\/universocc\.com\.br\/validador\?code=/u,
  );
  assert.match(source, /fontStyle: isSignatureStampTemplateFontOblique/u);
  assert.match(source, /64px/u);
  assert.doesNotMatch(source, /18px/u);
});

Deno.test("modelo padrão corrente aceita somente o prefixo histórico conhecido", () => {
  assert.match(
    serviceSource,
    /normalizeElectronicSignatureStampTemplate\(source\.template, \{\s*allowLegacySignerNameLabel: true,\s*\}\)/u,
  );
});
