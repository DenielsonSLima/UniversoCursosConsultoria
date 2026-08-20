// @ts-nocheck -- contrato estático da migration incremental v6.

import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../migrations/20260820200000_enable_diario_generic_signers_v6.sql",
  import.meta.url,
);
const previousMigrationUrl = new URL(
  "../migrations/20260820190000_fix_partner_access_trigger_order.sql",
  import.meta.url,
);
const individualProofsV1Url = new URL(
  "../migrations/20260820010500_add_individual_signature_proofs_v1.sql",
  import.meta.url,
);
const globalStampV5Url = new URL(
  "../migrations/20260820113000_add_signature_editor_v5_global_stamp_template.sql",
  import.meta.url,
);

const sql = await Deno.readTextFile(migrationUrl);
const previousMigration = await Deno.readTextFile(previousMigrationUrl);
const individualProofsV1 = await Deno.readTextFile(individualProofsV1Url);
const globalStampV5 = await Deno.readTextFile(globalStampV5Url);

const functionBlock = (name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(start >= 0 && end > start, `Função ${name} ausente.`);
  return sql.slice(start, end);
};

const migrationDoBlock = (needle: string) => {
  const needleIndex = sql.indexOf(needle);
  assert.ok(needleIndex >= 0, `Bloco da migration para ${needle} ausente.`);
  const start = sql.lastIndexOf("DO $migration$", needleIndex);
  const end = sql.indexOf("$migration$;", needleIndex);
  assert.ok(start >= 0 && end > needleIndex, `DO da migration para ${needle} inválido.`);
  return sql.slice(start, end);
};

const assertPrivateHelper = (name: string) => {
  assert.match(
    sql,
    new RegExp(
      `REVOKE ALL ON FUNCTION\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+FROM PUBLIC, anon, authenticated, service_role`,
      "u",
    ),
  );
  assert.doesNotMatch(
    sql,
    new RegExp(
      `GRANT EXECUTE ON FUNCTION\\s+public\\.${name}\\(`,
      "u",
    ),
  );
};

Deno.test("v6 é incremental após o estado local atual, atômica e não reescreve provas v1", () => {
  assert.match(
    migrationUrl.pathname,
    /20260820200000_enable_diario_generic_signers_v6\.sql$/u,
  );
  assert.match(previousMigration, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/mu);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.match(individualProofsV1, /assinatura_eletronica_congelar_cpf_participante/u);
  assert.match(individualProofsV1, /validar_assinatura_eletronica_por_codigo/u);
  assert.doesNotMatch(individualProofsV1, /SIGNATARIOS_V6|GENERIC_SIGNERS_V6/u);
  assert.match(globalStampV5, /'maxSigners', 6/u);
  assert.doesNotMatch(
    sql,
    /ALTER\s+TABLE\s+public\.assinatura_eletronica_participantes[\s\S]*?DROP\s+COLUMN[\s\S]*?(identidade_snapshot|vinculo_snapshot)/iu,
  );
});

Deno.test("política v6 guarda somente um selector server-side 1..6 e conserva o contrato histórico", () => {
  const policy = functionBlock(
    "assinatura_eletronica_politica_diario_signatarios_v6_valida",
  );
  const envelopeSigners = functionBlock(
    "assinatura_eletronica_envelope_signatarios_v6",
  );

  assert.match(policy, /p_politica\s*->\s*'signerContract'/u);
  assert.match(
    policy,
    /'selector',\s*'ASSIGNED_PROFESSOR_AND_ACTIVE_COURSE_COORDINATORS_V1'/u,
  );
  assert.match(policy, /'minSigners',\s*1/u);
  assert.match(policy, /'maxSigners',\s*6/u);
  assert.doesNotMatch(
    policy,
    /'(?:papel|role|layout|template|slot)'/iu,
  );

  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS assinatura_eletronica_politicas_diario_signatarios_v1/u,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT assinatura_eletronica_politicas_diario_signatarios_v6/u,
  );
  assert.match(
    sql,
    /'signatarios'[\s\S]{0,700}?'PROFESSOR'[\s\S]{0,700}?'(?:ordem|order)',\s*1[\s\S]{0,700}?'COORDENADOR'[\s\S]{0,700}?'(?:ordem|order)',\s*2/u,
  );
  assert.match(envelopeSigners, /assinatura_eletronica_politica_diario_signatarios_v6_valida/u);
  assert.match(envelopeSigners, /assinatura_eletronica_signatarios_diario_v6_canonicos/u);

  assert.match(
    sql,
    /FROM public\.assinatura_eletronica_envelopes AS envelope[\s\S]*?envelope\.politica_id\s*=\s*politica\.id/u,
  );
  assert.match(
    sql,
    /MESSAGE\s*=\s*'ASSINATURA_(?:DIARIO_)?SIGNATARIOS_V6_[A-Z_]+'/u,
  );
  assert.match(
    sql,
    /'signerContract'[\s\S]*?'ASSIGNED_PROFESSOR_AND_ACTIVE_COURSE_COORDINATORS_V1'[\s\S]*?'minSigners',\s*1[\s\S]*?'maxSigners',\s*6/u,
  );
  assert.match(sql, /arquivada_em\s*=\s*v_now/u);
  assert.match(sql, /versao\s*\+\s*1/u);
});

Deno.test("a seleção de 1..6 é derivada no servidor, determinística e sem payload de pessoas do navegador", () => {
  const resolver = functionBlock(
    "assinatura_eletronica_signatarios_diario_v6_canonicos",
  );

  assert.match(
    resolver,
    /LANGUAGE plpgsql[\s\S]*?SECURITY DEFINER\s+SET search_path = ''/u,
  );
  for (const input of ["p_turma_id", "p_disciplina_id", "p_curso_id", "p_polo_id"]) {
    assert.match(resolver, new RegExp(`\\b${input}\\b`, "u"));
  }
  for (const source of [
    "public.turmas_disciplinas",
    "public.professores_coordenacoes",
    "public.parceiros",
    "auth_user_id",
  ]) {
    assert.match(resolver, new RegExp(source.replaceAll(".", "\\."), "u"));
  }
  assert.match(resolver, /'PROFESSOR'/u);
  assert.match(resolver, /'COORDENADOR'/u);
  assert.match(resolver, /NOT BETWEEN 1 AND 6/u);
  assert.match(resolver, /ORDER BY/u);
  assert.match(
    resolver,
    /DISTINCT ON\s*\([^)]*auth_user_id[^)]*\)|row_number\(\)\s+over[\s\S]*?auth_user_id/iu,
  );
  assert.match(resolver, /COORDENADOR.*status\s*=\s*'ATIVA'|status\s*=\s*'ATIVA'.*COORDENADOR/su);
  assert.match(
    resolver,
    /'identitySnapshot'[\s\S]*?'schemaVersion',\s*1/u,
  );
  assert.match(
    resolver,
    /'linkSnapshot'[\s\S]*?'schemaVersion',\s*1/u,
  );
  assert.doesNotMatch(
    resolver,
    /\bp_signatarios\b|\bp_signers\b|\bp_participantes\b|\bp_nome\b|\bp_cpf\b/iu,
  );
  assert.doesNotMatch(
    sql,
    /\bp_signatarios\b|\bp_signers\b|\bp_lista_signatarios\b|\bp_cpf\b|\bp_nome\b/iu,
  );
  assert.match(
    sql,
    /(?:pg_catalog\.)?pg_get_functiondef\(\s*'public\.assinatura_eletronica_solicitar_envelope_diario\(uuid,uuid,text,uuid,uuid\)'::regprocedure\s*\)/u,
  );
  assert.match(
    sql,
    /assinatura_eletronica_signatarios_diario_v6_canonicos\([\s\S]*?v_turma\.id[\s\S]*?v_disciplina\.id[\s\S]*?v_curso\.id[\s\S]*?v_polo\.id/u,
  );
});

Deno.test("participantes v6 mantêm vínculo acadêmico e prova individual, sem usar papel como layout", () => {
  const participantTrigger = functionBlock(
    "assinatura_eletronica_validar_participante_fundacao",
  );
  const canonicalParticipant = functionBlock(
    "assinatura_eletronica_participante_diario_v6_canonico",
  );
  const frozenParticipant = functionBlock(
    "assinatura_eletronica_participante_diario_v6_snapshot_valido",
  );
  const linkage = functionBlock(
    "assinatura_eletronica_vinculo_signatario_diario_v6_valido",
  );

  assert.match(participantTrigger, /assinatura_eletronica_politica_diario_signatarios_v6_valida/u);
  assert.match(participantTrigger, /assinatura_eletronica_participante_diario_v6_canonico/u);
  assert.match(
    participantTrigger,
    /TG_OP\s*=\s*'INSERT'[\s\S]*?assinatura_eletronica_participante_diario_v6_canonico/u,
  );
  assert.match(
    participantTrigger,
    /TG_OP\s*=\s*'UPDATE'[\s\S]*?assinatura_eletronica_participante_diario_v6_snapshot_valido/u,
  );
  assert.match(canonicalParticipant, /p_ordem NOT BETWEEN 1 AND 6/u);
  assert.match(canonicalParticipant, /assinatura_eletronica_envelope_signatarios_v6/u);
  assert.match(canonicalParticipant, /p_identidade_snapshot/u);
  assert.match(canonicalParticipant, /p_vinculo_snapshot/u);
  assert.match(frozenParticipant, /p_ordem NOT BETWEEN 1 AND 6/u);
  assert.match(frozenParticipant, /p_identidade_snapshot/u);
  assert.match(frozenParticipant, /p_vinculo_snapshot/u);
  assert.match(participantTrigger, /NEW\.papel NOT IN \('PROFESSOR', 'COORDENADOR'\)/u);
  assert.match(participantTrigger, /NEW\.identidade_snapshot/u);
  assert.match(participantTrigger, /NEW\.vinculo_snapshot/u);
  assert.match(linkage, /public\.turmas_disciplinas/u);
  assert.match(linkage, /public\.professores_coordenacoes/u);
  assert.match(linkage, /auth_user_id/u);
  assert.doesNotMatch(linkage, /p_signatarios|p_signers|p_nome|p_cpf/iu);
  for (const helper of [canonicalParticipant, frozenParticipant, linkage]) {
    assert.doesNotMatch(
      helper,
      /(?:^|\n)\s*STRICT\s*(?:\n|$)/mu,
      "Professor não possui coordenacao_id; helper booleano não pode ser STRICT.",
    );
  }
  assert.doesNotMatch(
    participantTrigger,
    /geometry|geometria|autoLayout|template|layout/iu,
  );
  assert.match(sql, /assinatura_eletronica_provas_individuais_diario_v5/u);
});

Deno.test("preparo, publicação, reautenticação e finalização aceitam sequência canônica 1..6", () => {
  const preparable = functionBlock(
    "assinatura_eletronica_participantes_diario_preparaveis_v6",
  );
  const finalizable = functionBlock(
    "assinatura_eletronica_participantes_diario_finalizaveis_v6",
  );
  const reauthScope = functionBlock(
    "assinatura_eletronica_validar_escopo_reauth",
  );
  const finalGate = functionBlock(
    "assinatura_eletronica_autorizar_finalizacao_diario_segura",
  );
  const artifactFinalizerPatch = migrationDoBlock(
    "ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PREFLIGHT_DRIFT",
  );

  for (const block of [preparable, finalizable]) {
    assert.match(block, /v_total BETWEEN 1 AND 6/u);
    assert.match(block, /v_min_ordem\s*=\s*1/u);
    assert.match(block, /v_max_ordem\s*=\s*v_total/u);
    assert.match(block, /v_distintas\s*=\s*v_total/u);
    assert.match(
      block,
      /assinatura_eletronica_participante_diario_v6_snapshot_valido/u,
    );
  }
  assert.match(
    sql,
    /pg_get_functiondef\([\s\S]*?assinatura_eletronica_internal_preparar_original_diario_seguro/u,
  );
  assert.match(sql, /assinatura_eletronica_participantes_diario_preparaveis_v6/u);
  assert.match(
    sql,
    /assinatura_eletronica_internal_registrar_original_publicar_segu/u,
  );
  assert.match(sql, /participante\.ordem\s*=\s*1/u);
  assert.match(
    sql,
    /pg_get_functiondef\([\s\S]*?assinatura_eletronica_internal_consumir_ticket_reautenticacao/u,
  );
  assert.match(sql, /v_next_participant_order/u);
  assert.match(
    sql,
    /participante\.ordem\s*=\s*v_participante\.ordem\s*\+\s*1/u,
  );
  assert.match(sql, /PARTICIPANTE_LIBERADO/u);
  assert.match(reauthScope, /v_v6/u);
  assert.match(
    reauthScope,
    /v_v6[\s\S]*?assinatura_eletronica_participante_diario_v6_snapshot_valido/u,
  );
  const profileScopeAt = reauthScope.indexOf(
    "assinatura_eletronica_perfil_contexto_valido",
  );
  const linkageScopeAt = reauthScope.indexOf(
    "assinatura_eletronica_vinculo_signatario_diario_v6_valido",
  );
  const livePhaseGate = "(NOT v_v6 OR v_fase IN ('PREPARAR', 'REGISTRAR'))";
  assert.ok(
    profileScopeAt >= 0
      && linkageScopeAt > profileScopeAt
      && reauthScope.lastIndexOf(livePhaseGate, profileScopeAt) >= 0
      && reauthScope.lastIndexOf(livePhaseGate, linkageScopeAt) >= 0,
    "Vínculo e contexto vivos só podem ser exigidos em PREPARAR/REGISTRAR v6.",
  );
  assert.doesNotMatch(
    reauthScope.slice(0, profileScopeAt),
    /perfil_contexto_valido/u,
    "CONSUMIR v6 não pode revalidar contexto vivo antes do gate de fase.",
  );
  assert.match(finalGate, /assinatura_eletronica_participantes_diario_finalizaveis_v6/u);
  assert.match(finalGate, /assinatura_eletronica_participante_diario_v6_snapshot_valido/u);
  assert.match(finalGate, /assinatura_eletronica_exigir_service_role\(\)/u);
  assert.match(finalGate, /assinatura_eletronica_exigir_sessao_ativa/u);
  assert.match(
    finalGate,
    /NOT v_v6[\s\S]*?v_participante\.papel <> 'COORDENADOR'[\s\S]*?v_participante\.ordem <> 2/u,
  );
  assert.match(
    sql,
    /assinatura_eletronica_internal_registrar_artefato_finalizar_dia/u,
  );
  assert.match(sql, /assinatura_eletronica_eventos_assinatura_diario_v5_validados/u);
  assert.match(
    artifactFinalizerPatch,
    /'public\.assinatura_eletronica_internal_registrar_artefato_finalizar_dia\([^']*\)'::regprocedure/u,
  );
  assert.match(
    artifactFinalizerPatch,
    /v_old\s*:=\s*E'[\s\S]*?participante\.status\s*=\s*\\'ASSINADO\\'[\s\S]*?<>\s*2';/u,
  );
  assert.match(
    artifactFinalizerPatch,
    /ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PREFLIGHT_DRIFT/u,
  );
  const preflightDriftIndex = artifactFinalizerPatch.indexOf(
    "ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PREFLIGHT_DRIFT",
  );
  const preflightNewStart = artifactFinalizerPatch.lastIndexOf(
    "v_new := E'",
    preflightDriftIndex,
  );
  const preflightNewEnd = artifactFinalizerPatch.indexOf(
    "';",
    preflightNewStart,
  );
  assert.ok(
    preflightNewStart >= 0 && preflightNewEnd > preflightNewStart,
    "Ramo v6 do preflight do finalizador ausente.",
  );
  const preflightLiteral = artifactFinalizerPatch.slice(
    preflightNewStart,
    preflightNewEnd,
  );
  assert.match(
    preflightLiteral,
    /assinatura_eletronica_politica_diario_signatarios_v6_valida\([\s\S]*?v_envelope\.politica_snapshot/u,
  );
  assert.match(
    preflightLiteral,
    /AND NOT public\.assinatura_eletronica_participantes_diario_finalizaveis_v6\([\s\S]*?v_envelope\.id/u,
  );
  const legacyBranchStart = preflightLiteral.indexOf(
    "NOT public.assinatura_eletronica_politica_diario_signatarios_v6_valida",
  );
  assert.ok(legacyBranchStart >= 0, "Ramo P/C legado do preflight ausente.");
  const v6Branch = preflightLiteral.slice(0, legacyBranchStart);
  assert.doesNotMatch(
    v6Branch,
    /count\(\*\)[\s\S]*?<>\s*2/u,
    "O ramo v6 não pode restaurar o guard fixo de duas assinaturas.",
  );
  const legacyBranch = preflightLiteral.slice(legacyBranchStart);
  assert.match(legacyBranch, /count\(\*\)[\s\S]*?<>\s*2/u);
  assert.doesNotMatch(
    legacyBranch,
    /participante\.papel\s*=\s*\\'(?:PROFESSOR|COORDENADOR)\\'/u,
    "O preflight legado deve preservar literalmente o guard remoto de duas assinaturas.",
  );
  assert.match(
    artifactFinalizerPatch,
    /v_patched\s*:=\s*pg_catalog\.replace\(v_patched,\s*v_old,\s*v_new\)/u,
  );
  assert.match(
    artifactFinalizerPatch,
    /ASSINATURA_SIGNATARIOS_V6_FINALIZAR_PATCH_INCOMPLETO/u,
  );
  for (const [canonical, legacy] of [
    [
      "assinatura_eletronica_internal_registrar_original_publicar_segu",
      "assinatura_eletronica_internal_registrar_original_publicar_seguro",
    ],
    [
      "assinatura_eletronica_internal_registrar_artefato_finalizar_dia",
      "assinatura_eletronica_internal_registrar_artefato_finalizar_diario_seguro",
    ],
  ]) {
    assert.match(
      sql,
      new RegExp(
        `'public\\.${canonical}\\([^']*\\)'::regprocedure`,
        "u",
      ),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(
        `'public\\.${legacy}\\([^']*\\)'::regprocedure`,
        "u",
      ),
    );
  }
});

Deno.test("o validador público mantém envelopes P/C históricos e valida todas as provas v6 sem expor PII", () => {
  const publicValidation = functionBlock(
    "assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida",
  );

  assert.match(
    sql,
    /pg_get_functiondef\([\s\S]*?public\.validar_assinatura_eletronica_por_codigo\(text\)/u,
  );
  assert.match(sql, /participante\.ordem BETWEEN 1 AND 6/u);
  assert.match(
    sql,
    /assinatura_eletronica_participante_diario_v6_snapshot_valido/u,
  );
  assert.match(publicValidation, /assinatura_eletronica_participantes_diario_finalizaveis_v6/u);
  assert.match(
    publicValidation,
    /assinatura_eletronica_eventos_assinatura_diario_v5_validados/u,
  );
  assert.match(publicValidation, /'PROFESSOR'[\s\S]*?'COORDENADOR'/u);
  assert.match(individualProofsV1, /signerNameMasked/u);
  assert.match(individualProofsV1, /signerCpfMasked/u);
  assert.doesNotMatch(sql, /cpf_raw|cpf_cnpj|document\.cookie/iu);
  assert.doesNotMatch(
    sql,
    /signerCpf(?:Raw|Cnpj)|signerName(?:Raw|Full)/iu,
  );
});

Deno.test("a rota ativa de finalização schema 3 já usa o transporte v5 de 1..6", () => {
  const rpcStart = globalStampV5.indexOf(
    "CREATE OR REPLACE FUNCTION public.assinatura_eletronica_rpc_iniciar_finalizacao_diario(",
  );
  const rpcEnd = globalStampV5.indexOf("$function$;", rpcStart);
  const globalStarter = globalStampV5.indexOf(
    "CREATE OR REPLACE FUNCTION public.assinatura_eletronica_internal_iniciar_finalizacao_diario_v5_global(",
  );
  const globalStarterEnd = globalStampV5.indexOf("$function$;", globalStarter);
  assert.ok(
    rpcStart >= 0 && rpcEnd > rpcStart && globalStarter >= 0 && globalStarterEnd > globalStarter,
    "Rota de finalização schema 3 v5 ausente.",
  );
  const rpc = globalStampV5.slice(rpcStart, rpcEnd);
  const starter = globalStampV5.slice(globalStarter, globalStarterEnd);
  assert.match(rpc, /v_schema_geometria IN \(1, 2\)[\s\S]*?v3_legacy/u);
  assert.match(
    rpc,
    /internal_iniciar_finalizacao_diario_v5_global[\s\S]*?provas_individuais_diario_v5/u,
  );
  assert.match(rpc, /jsonb_array_length\(v_provas\) NOT BETWEEN 1 AND 6/u);
  assert.match(starter, /eventos_assinatura_diario_v5_validados/u);
  assert.match(starter, /assinatura_eletronica_autorizar_finalizacao_diario_segura/u);
  const geometryFreezerStart = globalStampV5.indexOf(
    "CREATE OR REPLACE FUNCTION public.assinatura_eletronica_congelar_geometria_v3()",
  );
  const geometryFreezerEnd = globalStampV5.indexOf(
    "$function$;",
    geometryFreezerStart,
  );
  assert.ok(
    geometryFreezerStart >= 0 && geometryFreezerEnd > geometryFreezerStart,
    "Freezer de geometria v3 ausente.",
  );
  const geometryFreezer = globalStampV5.slice(
    geometryFreezerStart,
    geometryFreezerEnd,
  );
  assert.match(geometryFreezer, /'schemaVersion',\s*3/u);
  assert.match(geometryFreezer, /ELSIF v_input_schema = 1/u);
  assert.match(geometryFreezer, /NEW\.geometria_snapshot := v_global_geometry/u);
  assert.match(
    globalStampV5,
    /CREATE TRIGGER assinatura_eletronica_envelopes_00_geometry_v3_before_insert/u,
  );
});

Deno.test("helpers internos v6 não viram endpoints públicos e entrada continua somente autenticada", () => {
  for (const helper of [
    "assinatura_eletronica_politica_diario_signatarios_v6_valida",
    "assinatura_eletronica_envelope_signatarios_v6",
    "assinatura_eletronica_signatarios_diario_v6_canonicos",
    "assinatura_eletronica_vinculo_signatario_diario_v6_valido",
    "assinatura_eletronica_participante_diario_v6_canonico",
    "assinatura_eletronica_participante_diario_v6_snapshot_valido",
    "assinatura_eletronica_participantes_diario_preparaveis_v6",
    "assinatura_eletronica_participantes_diario_finalizaveis_v6",
    "assinatura_eletronica_eventos_assinatura_diario_v6_ou_legado_validados",
    "assinatura_eletronica_validacao_publica_diario_v6_ou_legado_valida",
  ]) {
    assertPrivateHelper(helper);
  }
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_solicitar_envelope_diario\([\s\S]*?\)\s+TO authenticated, service_role/u,
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION\s+public\.assinatura_eletronica_solicitar_envelope_diario\([\s\S]*?\)\s+TO PUBLIC, anon/u,
  );
  assert.ok(
    (sql.match(/SECURITY DEFINER\s+SET search_path = ''/gu) ?? []).length >= 6,
    "Funções privilegiadas v6 precisam fixar search_path vazio.",
  );
});
