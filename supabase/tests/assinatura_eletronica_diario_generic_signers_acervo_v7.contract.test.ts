// @ts-nocheck -- contrato estático da migration incremental v7.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820202142_enable_diario_generic_signers_acervo_v7.sql",
  import.meta.url,
);
const dryRunMigrationUrl = new URL(
  "../migrations/20260820202132_dry_run_enable_diario_generic_signers_acervo_v7.sql",
  import.meta.url,
);
const individualProofsV1Url = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const genericSignersV6Url = new URL(
  "../migrations/20260820200000_enable_diario_generic_signers_v6.sql",
  import.meta.url,
);
const archiveEdgeAdapterUrl = new URL(
  "../functions/assinatura-eletronica-acervo/supabase-adapter.ts",
  import.meta.url,
);

const [sql, dryRunSql, individualProofsV1, genericSignersV6, archiveEdgeAdapter] =
  await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(dryRunMigrationUrl),
    Deno.readTextFile(individualProofsV1Url),
    Deno.readTextFile(genericSignersV6Url),
    Deno.readTextFile(archiveEdgeAdapterUrl),
  ]);

const occurrences = (source: string, fragment: string) =>
  source.split(fragment).length - 1;

const migrationBlock = (needle: string) => {
  const needleIndex = sql.indexOf(needle);
  assert.ok(needleIndex >= 0, `Bloco ${needle} ausente.`);
  const start = sql.lastIndexOf("DO $migration$", needleIndex);
  const end = sql.indexOf("$migration$;", needleIndex);
  assert.ok(start >= 0 && end > needleIndex, `Bloco ${needle} inválido.`);
  return sql.slice(start, end);
};

const LISTAR_REGPROCEDURE =
  "public.assinatura_eletronica_listar_acervo_gestor(uuid,uuid,text,text,text,uuid,timestamp with time zone,timestamp with time zone,integer,timestamp with time zone,uuid)";
const OPCOES_REGPROCEDURE =
  "public.assinatura_eletronica_opcoes_acervo_gestor(uuid,uuid)";
const PHYSICAL_V6_VALIDATOR =
  "assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val";

Deno.test("v7 é incremental, atômica e não toca nas provas v1 nem na v6 aplicada", () => {
  assert.match(
    migrationUrl.pathname,
    /20260820202142_enable_diario_generic_signers_acervo_v7\.sql$/u,
  );
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/DO \$migration\$/gu) ?? []).length, 2);
  assert.match(individualProofsV1, /assinatura_eletronica_congelar_cpf_participante/u);
  assert.match(genericSignersV6, /maxSigners', 6/u);
  assert.doesNotMatch(individualProofsV1, /ACERVO_V7|GENERIC_SIGNERS_ACERVO_V7/u);
  assert.doesNotMatch(genericSignersV6, /ACERVO_V7|GENERIC_SIGNERS_ACERVO_V7/u);
});

Deno.test("o registro do dry-run é um marcador sem efeito para manter o ledger reconstruível", () => {
  assert.match(
    dryRunMigrationUrl.pathname,
    /20260820202132_dry_run_enable_diario_generic_signers_acervo_v7\.sql$/u,
  );
  assert.match(dryRunSql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(dryRunSql, /COMMIT;\s*$/u);
  assert.equal((dryRunSql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((dryRunSql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.match(dryRunSql, /encerrada por ROLLBACK/u);
  assert.match(
    dryRunSql,
    /intencionalmente sem efeito para manter a cadeia reconstruível/u,
  );
  assert.doesNotMatch(dryRunSql, /ASSINATURA_ACERVO_V7_LISTAR_/u);
});

Deno.test("v7 resolve exatamente os dois RPCs de acervo e exige os helpers físicos v6", () => {
  for (const [sentinel, regprocedure] of [
    ["ASSINATURA_ACERVO_V7_LISTAR_REGPROCEDURE_AUSENTE", LISTAR_REGPROCEDURE],
    ["ASSINATURA_ACERVO_V7_OPCOES_REGPROCEDURE_AUSENTE", OPCOES_REGPROCEDURE],
  ] as const) {
    const block = migrationBlock(sentinel);
    assert.match(block, new RegExp(regprocedure.replace(/[()]/gu, "\\$&"), "u"));
    assert.match(block, /pg_catalog\.to_regprocedure\(/u);
    assert.match(block, /pg_catalog\.pg_get_functiondef\(/u);
    assert.match(block, /ASSINATURA_ACERVO_V7_HELPER_V6_AUSENTE/u);
    assert.match(
      block,
      /assinatura_eletronica_politica_diario_signatarios_v6_valida\(jsonb\)/u,
    );
    assert.match(
      block,
      /assinatura_eletronica_validacao_publica_diario_v6_ou_legado_val\(uuid\)/u,
    );
  }

  assert.equal(occurrences(sql, LISTAR_REGPROCEDURE), 7);
  assert.equal(occurrences(sql, OPCOES_REGPROCEDURE), 7);
  assert.match(sql, new RegExp(`\\b${PHYSICAL_V6_VALIDATOR}\\(`, "u"));
  assert.doesNotMatch(
    sql,
    /assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida\(uuid\)/u,
    "v7 deve chamar o identificador físico truncado, não o sufixo lógico longo.",
  );
});

Deno.test("cada RPC escolhe v6 por politica_snapshot e mantém literalmente P/C=2 no ELSE", () => {
  for (const sentinel of [
    "ASSINATURA_ACERVO_V7_LISTAR_PREDICADO_DRIFT",
    "ASSINATURA_ACERVO_V7_OPCOES_PREDICADO_DRIFT",
  ]) {
    const block = migrationBlock(sentinel);
    const predicateStart = block.indexOf("v_legacy_predicate :=");
    const predicateEnd = block.indexOf("v_occurrences :=", predicateStart);
    const predicate = block.slice(predicateStart, predicateEnd);
    assert.ok(predicateStart >= 0 && predicateEnd > predicateStart);
    assert.match(predicate, /participante_shape\.papel IN \(\\'PROFESSOR\\', \\'COORDENADOR\\'\)/u);
    assert.match(predicate, /participante_shape\.status = \\'ASSINADO\\'/u);
    assert.match(predicate, /identidade_snapshot ->> \\'name\\'/u);
    assert.match(predicate, /\) = 2';/u);
    assert.match(predicate, /v_old\x20:=\x20E'\x20{6}AND\x20'\x20\|\|\x20v_legacy_predicate/u);
    assert.match(predicate, /CASE/u);
    assert.match(
      predicate,
      /WHEN coalesce\([\s\S]*?assinatura_eletronica_politica_diario_signatarios_v6_valida\([\s\S]*?envelope\.politica_snapshot[\s\S]*?false[\s\S]*?\) THEN/u,
    );
    assert.match(
      predicate,
      new RegExp(`${PHYSICAL_V6_VALIDATOR}\\([\\s\\S]*?envelope\\.id`, "u"),
    );
    assert.match(predicate, /ELSE[\s\S]*?v_legacy_predicate/u);

    const v6Branch = predicate.slice(
      predicate.indexOf("WHEN coalesce("),
      predicate.indexOf("ELSE", predicate.indexOf("WHEN coalesce(")),
    );
    assert.doesNotMatch(v6Branch, /=\s*2|PROFESSOR|COORDENADOR/u);
    assert.match(block, /v_occurrences <> 1/u);
    assert.match(block, /pg_catalog\.replace\(v_definition, v_old, v_new\)/u);
    assert.match(block, /pg_catalog\.strpos\([\s\S]*?v_patched/u);
    assert.doesNotMatch(block, /pg_catalog\.position\(/u);
    assert.match(block, /PATCH_INCOMPLETO/u);
  }
});

Deno.test("a substituição preserva SECURITY DEFINER, search_path vazio e ACL mínima", () => {
  for (const sentinel of [
    "ASSINATURA_ACERVO_V7_LISTAR_ACL_DRIFT",
    "ASSINATURA_ACERVO_V7_OPCOES_ACL_DRIFT",
  ]) {
    const block = migrationBlock(sentinel);
    assert.match(block, /procedimento\.prosecdef/u);
    assert.match(block, /procedimento\.proconfig/u);
    assert.match(block, /procedimento\.proacl/u);
    assert.match(block, /ARRAY\['search_path=""'\]::text\[\]/u);
    assert.match(block, /has_function_privilege\([\s\S]*?'authenticated'/u);
    assert.match(block, /has_function_privilege\([\s\S]*?'anon'/u);
    assert.match(block, /has_function_privilege\([\s\S]*?'service_role'/u);
    assert.match(block, /v_acl_after IS DISTINCT FROM v_acl_before/u);
    assert.match(block, /ACL_ALTERADA/u);
  }
  assert.doesNotMatch(
    sql,
    /(?:REVOKE ALL|GRANT EXECUTE) ON FUNCTION public\.assinatura_eletronica_(?:listar|opcoes)_acervo_gestor/u,
    "CREATE OR REPLACE preserva as ACLs capturadas; não reabra grants no patch.",
  );
});

Deno.test("o caminho Edge do acervo não fixa cardinalidade e não é alterado pela v7", () => {
  assert.match(
    archiveEdgeAdapter,
    /assinatura_eletronica_internal_resolver_acervo/u,
  );
  assert.doesNotMatch(archiveEdgeAdapter, /PROFESSOR.*COORDENADOR.*=\s*2/su);
  assert.doesNotMatch(
    sql,
    /assinatura_eletronica_internal_resolver_acervo|assinatura_eletronica_autorizar_artefato|validar_documento_por_codigo/u,
    "Somente os dois RPCs com o guard P/C=2 entram no patch mínimo.",
  );
});
