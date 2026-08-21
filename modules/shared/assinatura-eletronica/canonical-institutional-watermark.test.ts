import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanonicalInstitutionalWatermarkDataUri,
  isCanonicalInstitutionalWatermarkDataUri,
} from "./canonical-institutional-watermark";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const canonicalPng = `data:image/png;base64,${PNG_1X1}`;

test("aceita somente data URI canônica para a marca retrato", () => {
  assert.equal(isCanonicalInstitutionalWatermarkDataUri(canonicalPng), true);
  assert.equal(
    assertCanonicalInstitutionalWatermarkDataUri(canonicalPng),
    canonicalPng,
  );
});

test("rejeita URL, MIME não suportado, espaços e base64 não canônico", () => {
  for (
    const source of [
      "https://project.supabase.co/storage/v1/object/public/documentos/marca.png",
      `data:image/svg+xml;base64,${PNG_1X1}`,
      ` ${canonicalPng}`,
      `${canonicalPng}\n`,
      "data:image/png;base64,AB==",
    ]
  ) {
    assert.equal(isCanonicalInstitutionalWatermarkDataUri(source), false);
    assert.throws(
      () => assertCanonicalInstitutionalWatermarkDataUri(source),
      /marca.*retrato.*polo/u,
    );
  }
});
