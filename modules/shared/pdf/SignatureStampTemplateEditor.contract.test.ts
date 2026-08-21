// @ts-nocheck -- contrato de interação explícita do editor visual.

import assert from "node:assert/strict";

const source = await Deno.readTextFile(
  new URL("./SignatureStampTemplateEditor.tsx", import.meta.url),
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
