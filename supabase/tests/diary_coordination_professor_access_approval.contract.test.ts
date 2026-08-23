// @ts-nocheck -- contratos estáticos das migrations incrementais.

import assert from "node:assert/strict";

const [
  signersSql,
  portalSql,
  approvalSql,
  legacySourceUuidSql,
  optionalEmailSql,
  mergedProfileFixSql,
] = await Promise.all([
  Deno.readTextFile(new URL(
    "../migrations/20260823170000_require_distinct_diary_professor_coordinator.sql",
    import.meta.url,
  )),
  Deno.readTextFile(new URL(
    "../migrations/20260823170100_merge_coordination_into_professor_portal.sql",
    import.meta.url,
  )),
  Deno.readTextFile(new URL(
    "../migrations/20260823170200_approve_matriz_diary_signature_policy.sql",
    import.meta.url,
  )),
  Deno.readTextFile(new URL(
    "../migrations/20260823170300_allow_legacy_source_uuids_in_diary_snapshot.sql",
    import.meta.url,
  )),
  Deno.readTextFile(new URL(
    "../migrations/20260823170400_allow_missing_institutional_email_in_diary_snapshot.sql",
    import.meta.url,
  )),
  Deno.readTextFile(new URL(
    "../migrations/20260823170900_fix_merged_professor_profile_scope_ambiguity.sql",
    import.meta.url,
  )),
]);

const functionBlock = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${name} ausente.`);
  return sql.slice(start, end);
};

const assertAtomic = (sql: string) => {
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
};

Deno.test("migrations são atômicas e permanecem abaixo do teto operacional", () => {
  for (const sql of [
    signersSql,
    portalSql,
    approvalSql,
    legacySourceUuidSql,
    optionalEmailSql,
    mergedProfileFixSql,
  ]) {
    assertAtomic(sql);
    assert.ok(sql.split("\n").length <= 500);
  }
});

Deno.test("mescla do Professor qualifica o escopo correlacionado sem ambiguidade", () => {
  const profiles = functionBlock(mergedProfileFixSql, "portal_listar_perfis");

  assert.match(
    profiles,
    /FROM coordenacao_scopes AS coordenacao_scope[\s\S]*?WHERE coordenacao_scope\."contextId" = perfil\."contextId"/u,
  );
  assert.doesNotMatch(
    profiles,
    /FROM coordenacao_scopes\s+WHERE\s+"contextId"/u,
  );
});

Deno.test("Diário exige professor atribuído e outro professor coordenador", () => {
  const resolver = functionBlock(
    signersSql,
    "assinatura_eletronica_signatarios_diario_v6_canonicos",
  );

  assert.match(resolver, /public\.turmas_disciplinas AS vinculo/u);
  assert.match(resolver, /vinculo\.bloqueio_diario = 'PROFESSOR'/u);
  assert.match(resolver, /public\.professores_coordenacoes AS coordenacao/u);
  assert.match(resolver, /coordenacao\.curso_id = p_curso_id/u);
  assert.match(resolver, /coordenacao\.polo_id = p_polo_id/u);
  assert.match(resolver, /coordenacao\.status = 'ATIVA'/u);
  assert.match(
    resolver,
    /coordenador\.auth_user_id <> v_professor\.auth_user_id/u,
  );
  assert.match(resolver, /v_coordenadores_distintos = 0/u);
  assert.match(resolver, /v_coordenadores_distintos <> 1/u);
  assert.match(resolver, /ASSINATURA_COORDENADOR_DISTINTO_OBRIGATORIO/u);
  assert.match(resolver, /RETURN jsonb_build_array\(/u);
  assert.match(
    resolver,
    /'role', 'PROFESSOR'[\s\S]*?'role', 'COORDENADOR'/u,
  );
  assert.match(
    resolver,
    /'type', 'TURMA_DISCIPLINA'[\s\S]*?'type', 'COORDENACAO_CURSO'/u,
  );
  assert.doesNotMatch(
    resolver,
    /DISTINCT ON\s*\([^)]*auth_user_id|NOT BETWEEN 1 AND 6/iu,
  );
  assert.doesNotMatch(
    resolver,
    /\bp_signatarios\b|\bp_signers\b|\bp_participantes\b|\bp_nome\b|\bp_cpf\b/iu,
  );
});

Deno.test("portal incorpora coordenação no Professor e não devolve Coordenador", () => {
  const profiles = functionBlock(portalSql, "portal_listar_perfis");

  assert.match(
    profiles,
    /public\.portal_listar_perfis_base_20260821234000\(\)/u,
  );
  assert.match(
    profiles,
    /upper\(coordenacao\.role\) = 'COORDENADOR'/u,
  );
  assert.match(
    profiles,
    /upper\(perfil\.role\) <> 'COORDENADOR'/u,
  );
  assert.match(profiles, /'ASSINATURAS_COORDENADOR'/u);
  assert.match(profiles, /'DIARIO_REVISAR_COORDENACAO'/u);
  assert.match(profiles, /coordenacao_scopes/u);
  assert.match(profiles, /coordenacao_polos/u);
  assert.match(profiles, /perfil\."homeRoute"/u);
  assert.doesNotMatch(profiles, /'\/coordenador'/u);
  assert.match(
    profiles,
    /portal_identidade_institucional_acesso_liberado\([\s\S]*?v_actor, 'PROFESSOR'/u,
  );
  assert.match(
    portalSql,
    /REVOKE ALL ON FUNCTION public\.portal_listar_perfis\(\)[\s\S]*?GRANT EXECUTE[\s\S]*?TO authenticated/u,
  );
});

Deno.test("aprovação jurídica é escopada, idempotente e não altera o modelo", () => {
  assert.match(
    approvalSql,
    /autorizado pelo Jurídico[\s\S]*?Nenhum número de parecer/u,
  );
  assert.match(
    approvalSql,
    /9a8aa1b4-468b-4bfe-92fb-b34787ffd627/u,
  );
  assert.match(approvalSql, /politica\.versao = 4/u);
  assert.match(approvalSql, /coalesce\(polo\.is_matriz, false\)/u);
  assert.match(
    approvalSql,
    /1dbe055aeb4d519ac8938aeb709c3e4ceb35f98148bad7c13b754e5c658e2ce0/u,
  );
  assert.match(
    approvalSql,
    /f1b17c6731802734cf4dee81693798cb5c9d5b586f1c587e373278bb5a238c18/u,
  );
  assert.match(approvalSql, /FOR UPDATE OF politica/u);
  assert.match(approvalSql, /FOR KEY SHARE/u);
  assert.match(approvalSql, /IF v_policy\.habilitada[\s\S]*?THEN\s+NULL;/u);
  assert.match(approvalSql, /GET DIAGNOSTICS v_rows = ROW_COUNT/u);
  assert.match(approvalSql, /v_rows <> 1/u);
  assert.match(
    approvalSql,
    /SET habilitada = true,[\s\S]*?status_juridico = 'APROVADA',[\s\S]*?certificado = v_target_certificate/u,
  );
  assert.match(approvalSql, /'metodo', 'SENHA_REAUTENTICADA'/u);
  assert.match(approvalSql, /'cadeiaEvidencias', true/u);
  assert.match(
    approvalSql,
    /assinatura_eletronica_geometria_snapshot_valida/u,
  );
  assert.match(approvalSql, /FROM storage\.objects/u);
  assert.doesNotMatch(approvalSql, /SET[\s\S]{0,300}?politica\s*=/u);
  assert.doesNotMatch(approvalSql, /aprovada_por|protocolo_juridico|parecer_id/iu);
});

Deno.test("snapshot aceita UUIDs canônicos legados sem alterar o documento persistido", () => {
  assert.match(
    legacySourceUuidSql,
    /ARRAY\['courseId', 'poloId', 'companyId'\]::text\[\]/u,
  );
  assert.match(
    legacySourceUuidSql,
    /v_normalized := overlay\(v_value PLACING '4' FROM 15 FOR 1\)/u,
  );
  assert.match(
    legacySourceUuidSql,
    /v_normalized PLACING '8' FROM 20 FOR 1/u,
  );
  assert.match(
    legacySourceUuidSql,
    /assinatura_eletronica_normalizar_source_uuids_legados\(p_snapshot\)/u,
  );
  assert.match(
    legacySourceUuidSql,
    /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/u,
  );
  assert.doesNotMatch(
    legacySourceUuidSql,
    /v_value := lower\(btrim\(/u,
  );
  assert.match(
    legacySourceUuidSql,
    /DROP CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check/u,
  );
  assert.match(
    legacySourceUuidSql,
    /ADD CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check[\s\S]*?assinatura_eletronica_snapshot_academico_diario_valido\([\s\S]*?documento_snapshot[\s\S]*?academico_snapshot_sha256[\s\S]*?source,turmaId[\s\S]*?source,disciplinaId[\s\S]*?imprimirValidacaoContracapa[\s\S]*?assinatura_eletronica_geometria_snapshot_valida/u,
  );
  assert.match(legacySourceUuidSql, /\) NOT VALID;/u);
  assert.match(
    legacySourceUuidSql,
    /VALIDATE CONSTRAINT assinatura_eletronica_envelopes_snapshot_diario_check/u,
  );
  assert.doesNotMatch(
    legacySourceUuidSql,
    /UPDATE public\.assinatura_eletronica_envelopes|UPDATE public\.turmas/u,
  );
});

Deno.test("e-mail institucional vazio permanece opcional somente na cópia de validação", () => {
  assert.match(
    optionalEmailSql,
    /v_normalized #>> '\{institutionalIdentity,institution,email\}' = ''/u,
  );
  assert.match(
    optionalEmailSql,
    /ARRAY\['institutionalIdentity', 'institution', 'email'\]/u,
  );
  assert.match(optionalEmailSql, /to_jsonb\('nao-informado'::text\)/u);
  assert.match(
    optionalEmailSql,
    /assinatura_eletronica_normalizar_source_uuids_legados\(p_snapshot\)/u,
  );
  assert.doesNotMatch(
    optionalEmailSql,
    /UPDATE public\.empresas|UPDATE public\.polos|@invalid/u,
  );
});
