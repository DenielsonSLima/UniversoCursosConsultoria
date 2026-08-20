// @ts-nocheck -- contrato estático da migration/Edge/validador público.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820130912_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const artifactsUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/artifacts.ts",
  import.meta.url,
);
const adapterUrl = new URL(
  "../functions/assinatura-eletronica-diario-artefatos/supabase-adapter.ts",
  import.meta.url,
);
const cpfValidatorUrl = new URL(
  "../migrations/20260718211109_enforce_valid_student_cpf.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const artifacts = await Deno.readTextFile(artifactsUrl);
const adapter = await Deno.readTextFile(adapterUrl);
const cpfValidator = await Deno.readTextFile(cpfValidatorUrl);

const functionBlock = (signature: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${signature} ausente.`);
  return sql.slice(start, end);
};

Deno.test("migration é incremental, atômica e valida CPF real sem congelar PII bruta", () => {
  const trigger = functionBlock(
    "public.assinatura_eletronica_congelar_cpf_participante()",
  );
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(trigger, /public\.is_valid_cpf\(v_cpf_original\)/i);
  assert.match(trigger, /pg_catalog\.length\(v_cpf_digitos\) <> 11/i);
  assert.match(cpfValidator, /digits !~ '\^\[0-9\]\{11\}\$'/i);
  assert.match(cpfValidator, /digits ~ '\^\(\[0-9\]\)\\1\{10\}\$'/i);
  assert.match(trigger, /'cpfMasked',\s*v_cpf_mascarado/i);
  assert.doesNotMatch(trigger, /jsonb_build_object\([^)]*'cpf(?:Cnpj|Raw)'/i);
  assert.match(
    sql,
    /VALIDATE CONSTRAINT assinatura_eletronica_participantes_cpf_mascarado_check/i,
  );
  assert.match(
    sql,
    /identidade_snapshot \? 'cpfMasked'[\s\S]*?jsonb_typeof\(identidade_snapshot -> 'cpfMasked'\) = 'string'[\s\S]*?coalesce\([\s\S]*?identidade_snapshot ->> 'cpfMasked'[\s\S]*?~ '\^\[\*\]\{3\}[\s\S]*?false[\s\S]*?\)/i,
  );
  assert.doesNotMatch(
    sql,
    /UPDATE\s+public\.assinatura_eletronica_participantes/i,
  );
});

Deno.test("SQL alinha o carimbo em 38000x14000 e preserva snapshots imutáveis", () => {
  const normalizer = functionBlock(
    "public.assinatura_eletronica_normalizar_editor(",
  );
  const expander = functionBlock(
    "public.assinatura_eletronica_expandir_editor_carimbo_individual(",
  );
  assert.match(normalizer, /widthBp'\)::integer < 38000/i);
  assert.match(normalizer, /heightBp'\)::integer < 14000/i);
  assert.match(expander, /greatest\([^;]*?widthBp[^;]*?, 38000\)/i);
  assert.match(expander, /greatest\([^;]*?heightBp[^;]*?, 14000\)/i);
  assert.match(expander, /least\([^;]*?xBp[^;]*?100000 - v_width\)/i);
  assert.match(expander, /least\([^;]*?yBp[^;]*?100000 - v_height\)/i);
  assert.match(
    sql,
    /UPDATE public\.assinatura_eletronica_politicas AS politica/i,
  );
  assert.match(
    sql,
    /UPDATE public\.assinatura_eletronica_politicas AS politica[\s\S]*?WHERE politica\.documento = 'diario_classe'[\s\S]*?jsonb_typeof\(politica\.politica -> 'editor'\) = 'object'/i,
  );
  assert.match(
    sql,
    /FROM public\.assinatura_eletronica_politicas AS politica[\s\S]*?WHERE politica\.documento = 'diario_classe'[\s\S]*?ASSINATURA_POLITICA_GEOMETRIA_INVALIDA/i,
  );
  assert.match(sql, /ASSINATURA_ENVELOPE_GEOMETRIA_LEGADA/i);
  assert.doesNotMatch(sql, /UPDATE public\.assinatura_eletronica_envelopes/i);
});

Deno.test("migration aborta se houver participante legado sem máscara imutável", () => {
  assert.match(sql, /ASSINATURA_PARTICIPANTE_LEGADO_SEM_CPF_MASCARADO/i);
  assert.match(
    sql,
    /EXISTS[\s\S]*?papel IN \('PROFESSOR', 'COORDENADOR'\)[\s\S]*?cpfMasked/i,
  );
});

Deno.test("prova histórica v1 mantém hash individual; Edge v5 exige uma prova distinta por signatário", () => {
  const chain = functionBlock(
    "public.assinatura_eletronica_cadeia_eventos_valida(",
  );
  const proofs = functionBlock(
    "public.assinatura_eletronica_provas_individuais_diario(",
  );
  assert.match(chain, /pg_catalog\.lag\(evento\.hash_evento\)/i);
  assert.match(chain, /'previousHash',\s*hash_anterior/i);
  assert.match(
    chain,
    /hash_evento\s*=\s*public\.assinatura_eletronica_sha256_json/i,
  );
  assert.match(chain, /pg_catalog\.min\(sequencia\) = 1/i);
  assert.match(
    chain,
    /pg_catalog\.max\(sequencia\) = pg_catalog\.count\(\*\)/i,
  );
  assert.match(proofs, /evento\.tipo = 'ASSINATURA_CONCLUIDA'/i);
  assert.match(proofs, /'signatureEventId',\s*evento\.id/i);
  assert.match(proofs, /'signatureHash',\s*evento\.hash_evento/i);
  assert.match(proofs, /'verificationCode',\s*'SIG-'/i);
  // A migration v1 já aplicada permanece com o contrato histórico de duas
  // provas. O template global v5 amplia apenas a capacidade da Edge, sem
  // alterar nem reaplicar esta migration.
  assert.match(proofs, /v_total_valido <> 2/i);
  assert.match(
    artifacts,
    /preflight\.participants\.length < 1[\s\S]*?ELECTRONIC_SIGNATURE_STAMP_MAX_SIGNERS/,
  );
  assert.match(
    artifacts,
    /new Set\(preflight\.participants\.map\(\(item\) => item\.signatureEventId\)\)[\s\S]*?\.size !== preflight\.participants\.length/,
  );
  assert.match(
    artifacts,
    /event\.signatureHash === participant\.signatureHash/,
  );
  assert.match(
    adapter,
    /signatureHash:\s*requiredSha256\(event, "signatureHash"\)/,
  );
});

Deno.test("RPC pública SIG é dedicada, mínima e sem caminho Storage/PII bruta", () => {
  const validator = functionBlock(
    "public.validar_assinatura_eletronica_por_codigo(",
  );
  const publicShape = validator.slice(
    validator.indexOf("SELECT jsonb_build_object("),
    validator.indexOf("INTO v_resultado"),
  );
  assert.match(validator, /\^SIG-\[0-9A-F\]/i);
  assert.match(validator, /pg_catalog\.substr\(v_codigo, 5\)::uuid/i);
  assert.doesNotMatch(validator, /pg_catalog\.substring\([^)]*\sFROM\s/i);
  assert.match(validator, /evento\.tipo = 'ASSINATURA_CONCLUIDA'/i);
  assert.match(
    validator,
    /assinatura_eletronica_cadeia_eventos_valida\(envelope\.id\)/i,
  );
  assert.match(validator, /desafio\.metodo = 'SENHA_REAUTENTICADA'/i);
  assert.match(validator, /artefato_final\.classe = 'DOCUMENTO_FINAL'/i);
  assert.match(validator, /JOIN storage\.objects AS objeto_final/i);
  assert.match(publicShape, /'proofKind',\s*'SIGNATURE_EVENT'/i);
  assert.match(publicShape, /'signerNameMasked',\s*nome\.nome_mascarado/i);
  assert.match(publicShape, /'signerCpfMasked'/i);
  assert.doesNotMatch(publicShape, /cpf_cnpj|storage_path|'signerName'|'cpf'/i);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.validar_assinatura_eletronica_por_codigo\(text\)\s+TO anon, authenticated/i,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_provas_individuais_diario/i,
  );
});

Deno.test("wrapper Edge continua service-only e cruza evento/hash no preflight", () => {
  const wrapper = functionBlock(
    "public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(",
  );
  assert.match(wrapper, /assinatura_eletronica_provas_individuais_diario/i);
  assert.match(wrapper, /'eventId',\s*prova -> 'signatureEventId'/i);
  assert.match(wrapper, /'signatureHash',\s*prova -> 'signatureHash'/i);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.assinatura_eletronica_rpc_iniciar_finalizacao_diario\([\s\S]*?\) TO service_role/i,
  );
});
