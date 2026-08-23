// @ts-nocheck -- contrato estático da migration incremental.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260823171100_separate_diary_receipt_watermark_snapshot.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test("migration separa snapshots sem backfill histórico", () => {
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS comprovante_marca_snapshot jsonb/u,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public[.]assinatura_eletronica_envelopes/iu,
  );
  assert.match(
    sql,
    /comprovante_marca_snapshot IS NULL[\s\S]*?assinatura_eletronica_comprovante_marca_v1_valida/iu,
  );
  assert.match(
    sql,
    /IF NOT FOUND OR v_marca IS NULL THEN[\s\S]*?rpc_iniciar_finalizacao_diario_v5_legacy/iu,
  );
});

Deno.test("trigger falha sem capa, contracapa e página 2 configuradas", () => {
  for (
    const required of [
      "capaUrl",
      "contracapaUrl",
      "capaCampos",
      "contracapaCampos",
      "imprimirValidacaoContracapa",
      "contracapaAssinaturaProfessor",
      "contracapaAssinaturaCoordenador",
      "contracapaQrCode",
    ]
  ) {
    assert.match(sql, new RegExp(`'${required}'`, "u"));
  }
  assert.match(
    sql,
    /ASSINATURA_DIARIO_MODELO_CONFIGURADO_INCOMPLETO/u,
  );
  assert.doesNotMatch(
    sql,
    /Documento Oficial — Diário de Classe emitido eletronicamente|Este diário de classe eletrônico foi gerado/iu,
  );
});

Deno.test("Diário congela landscape e comprovante congela portrait", () => {
  assert.match(
    sql,
    /watermark_landscape_' \|\| NEW[.]polo_id::text/iu,
  );
  assert.match(
    sql,
    /'source', 'POLO_PORTRAIT_WATERMARK_V1'[\s\S]*?'url', pole[.]watermark_url[\s\S]*?'opacity', pole[.]watermark_opacity[\s\S]*?'scale', pole[.]watermark_scale[\s\S]*?'rotate', pole[.]watermark_rotate/iu,
  );
  assert.match(
    sql,
    /\{assetSources,watermarkUrl\}'[\s\S]*?v_landscape -> 'url'/iu,
  );
  assert.match(
    sql,
    /NEW[.]comprovante_marca_snapshot := v_portrait/iu,
  );
  assert.match(sql, /ASSINATURA_COMPROVANTE_MARCA_IMUTAVEL/u);
});

Deno.test("finalizador v6 transporta somente a referência portrait nova", () => {
  assert.match(
    sql,
    /RENAME TO assinatura_eletronica_rpc_iniciar_finalizacao_diario_v5_legacy/u,
  );
  assert.match(
    sql,
    /CREATE FUNCTION public[.]assinatura_eletronica_rpc_finalizacao_diario_v6_marcas/u,
  );
  assert.match(sql, /'receiptWatermarkSnapshot', v_marca/u);
  assert.match(sql, /'sourceRef', 'receiptWatermarkSnapshot[.]url'/u);
});

Deno.test("migration respeita o teto manual do repositório", () => {
  assert.ok(sql.split(/\r?\n/u).length <= 500);
});
