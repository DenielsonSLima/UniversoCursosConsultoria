// @ts-nocheck -- contrato estático da migration incremental de CPF probatório.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260821002333_adopt_signature_cpf_mask_v2.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("máscara CPF v2 é forward-only e preserva snapshots históricos", () => {
  assert.match(sql, /^-- .*\n(?:-- .*\n)*\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.doesNotMatch(
    sql,
    /(?:UPDATE|DELETE\s+FROM)\s+public\.assinatura_eletronica_participantes/iu,
  );
  assert.match(
    sql,
    /VALIDATE CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check/iu,
  );
  assert.match(sql, /\[0-9\]\{2\}\[\*\]\[\.\]\[\*\]\{3\}/u);
  assert.match(sql, /\[\*\]\{3\}\[\.\]\[\*\]\{3\}\[\.\]\[\*\]\{3\}/u);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_cpf_mascarado_prova_valido_v2\(text\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/u,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.assinatura_eletronica_congelar_cpf_participante\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/u,
  );
});

Deno.test("novos participantes congelam exatamente dois dígitos iniciais e três finais", () => {
  const trigger = functionBlock(
    "public.assinatura_eletronica_congelar_cpf_participante()",
  );

  assert.match(trigger, /pg_catalog\.left\(v_cpf_digitos, 2\)/u);
  assert.match(trigger, /pg_catalog\.substr\(v_cpf_digitos, 9, 1\)/u);
  assert.match(trigger, /pg_catalog\.right\(v_cpf_digitos, 2\)/u);
  assert.match(trigger, /\|\| '\*\.\*\*\*\.\*\*'/u);
  assert.match(trigger, /public\.is_valid_cpf\(v_cpf_original\)/u);
  assert.doesNotMatch(trigger, /UPDATE\s+public\./iu);
});

Deno.test("patch SQL falha fechado e cobre as três funções consumidoras atuais", () => {
  for (
    const signature of [
      "assinatura_eletronica_provas_individuais_diario(uuid)",
      "validar_assinatura_eletronica_por_codigo(text)",
      "assinatura_eletronica_eventos_assinatura_diario_v5_validados(uuid)",
    ]
  ) {
    assert.ok(
      sql.includes(`public.${signature}`),
      `Alvo ausente: ${signature}`,
    );
  }

  assert.match(sql, /v_occurrences <> 1/u);
  assert.match(sql, /ASSINATURA_CPF_MASK_V2_PATCH_INSEGURO/u);
  assert.match(
    sql,
    /public\.assinatura_eletronica_cpf_mascarado_prova_valido_v2/u,
  );
});
