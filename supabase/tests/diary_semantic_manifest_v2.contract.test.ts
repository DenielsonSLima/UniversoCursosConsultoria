// @ts-nocheck -- contrato estático da migration executado pelo Deno.

import assert from "node:assert/strict";
import test from "node:test";

const sql = await Deno.readTextFile(new URL(
  "../migrations/20260823171000_allow_diary_back_cover_semantic_manifest_v2.sql",
  import.meta.url,
));

test("manifesto do Diário preserva v1 e aceita a contracapa v2 na página 2", () => {
  assert.match(sql, /v_schema_version = 1/i);
  assert.match(sql, /v_schema_version <> 2/i);
  assert.match(sql, /DIARIO_LAST_CONTENT_PAGE/i);
  assert.match(sql, /DIARIO_BACK_COVER/i);
  assert.match(sql, /v_target_page_index <> 1/i);
  assert.match(sql, /backCoverPageIndex'\)::integer <> 1/i);
});

test("manifesto v2 fecha os dois slots por papel, campo e geometria", () => {
  assert.match(sql, /jsonb_array_length\(p_manifest -> 'signatureSlots'\) <> 2/i);
  assert.match(sql, /contracapaAssinaturaProfessor/i);
  assert.match(sql, /contracapaAssinaturaCoordenador/i);
  assert.match(sql, /v_width NOT BETWEEN 38000 AND 90000/i);
  assert.match(sql, /v_height NOT BETWEEN 14000 AND 25000/i);
  assert.match(sql, /v_x \+ v_width > 100000/i);
  assert.match(sql, /v_first_slot[\s\S]*RETURN false/i);
});

test("target congelado precisa repetir o alvo semântico do manifesto", () => {
  assert.match(
    sql,
    /p_target ->> 'semanticTarget' IS DISTINCT FROM p_manifest ->> 'semanticTarget'/i,
  );
  assert.match(sql, /p_target -> 'manifest' IS DISTINCT FROM p_manifest/i);
  assert.match(sql, /REVOKE ALL[\s\S]*FROM PUBLIC/i);
});
