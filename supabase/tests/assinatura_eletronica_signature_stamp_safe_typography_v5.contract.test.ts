import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260821020000_enable_signature_stamp_safe_typography_v5.sql",
  import.meta.url,
);

Deno.test("tipografia v5 e incremental e preserva conteudo probatorio", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert.match(sql, /^BEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    sql,
    /assinatura_eletronica_template_carimbo_v5_estilo_valido/u,
  );
  assert.match(sql, /v_font_size NOT BETWEEN 4000 AND 16000/u);
  assert.match(sql, /v_font_size % 500 <> 0/u);
  assert.match(sql, /'LEFT', 'CENTER', 'RIGHT'/u);
  assert.match(sql, /'HELVETICA_BOLD_OBLIQUE'/u);
  assert.match(sql, /'COURIER_BOLD_OBLIQUE'/u);
  assert.match(sql, /v_label NOT IN \('', 'Assinante: '\)/u);
  assert.match(sql, /'label', 'Assinante: '/u);
  assert.match(sql, /'label', ''/u);

  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_envelopes/iu,
  );
  assert.doesNotMatch(sql, /DELETE\s+FROM/iu);
  assert.doesNotMatch(sql, /DROP\s+(?:FUNCTION|TABLE|COLUMN)/iu);
  assert.doesNotMatch(sql, /add_individual_signature_proofs_v1/u);
});

Deno.test("helper tipografico permanece fechado para labels cores e fontes livres", async () => {
  const sql = await Deno.readTextFile(migrationUrl);

  assert.match(
    sql,
    /v_style ->> 'color' IS DISTINCT FROM p_expected_style ->> 'color'/u,
  );
  assert.match(
    sql,
    /v_label IS DISTINCT FROM p_expected_style ->> 'label'/u,
  );
  assert.match(sql, /v_expected_font LIKE 'HELVETICA%'/u);
  assert.match(sql, /v_expected_font LIKE 'COURIER%'/u);
  assert.match(sql, /SECURITY DEFINER/u);
  assert.match(sql, /SET search_path = ''/u);
  assert.match(sql, /REVOKE ALL ON FUNCTION/u);
});
