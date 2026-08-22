import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationNames = [
  "20260822161000_create_single_plan_enrollment_condition_state.sql",
  "20260822161100_create_single_plan_canonical_preview.sql",
  "20260822161200_render_single_plan_enrollment_condition.sql",
  "20260822161300_secure_single_plan_condition_authorization.sql",
  "20260822161400_create_single_plan_condition_state_helpers.sql",
  "20260822161500_create_single_plan_enrollment_v2_rpc.sql",
  "20260822161600_query_single_plan_pending_and_keep_legacy_rpc.sql",
  "20260822161700_index_curso_livre_financial_foreign_keys.sql",
  "20260822161800_mask_single_plan_enrollment_financial_response.sql",
] as const;

const migrations = new Map<string, string>();
for (const name of migrationNames) {
  migrations.set(
    name,
    await Deno.readTextFile(new URL(`../migrations/${name}`, import.meta.url)),
  );
}
const sql = [...migrations.values()].join("\n");

function migration(name: typeof migrationNames[number]) {
  const value = migrations.get(name);
  assert.ok(value, `migration ausente: ${name}`);
  return value;
}

function body(name: string) {
  const marker = `create or replace function ${name}`;
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

Deno.test("lote é incremental, transacional e respeita o teto físico", () => {
  for (const [name, content] of migrations) {
    assert.match(content, /^begin;/i, `${name} não abre transação`);
    assert.match(content, /commit;\s*$/i, `${name} não fecha transação`);
    assert.ok(
      content.split(/\r?\n/).length <= 500,
      `${name} ultrapassa 500 linhas`,
    );
    assert.equal(
      content.match(/as \$function\$/gi)?.length ?? 0,
      content.match(/\$function\$;/g)?.length ?? 0,
      `${name} contém corpo SQL sem fechamento`,
    );
  }
  assert.match(
    migration(
      "20260822161600_query_single_plan_pending_and_keep_legacy_rpc.sql",
    ),
    /notify pgrst, 'reload schema'/i,
  );
});

Deno.test("chaves estrangeiras novas possuem índices de cobertura", () => {
  const indexes = migration(
    "20260822161700_index_curso_livre_financial_foreign_keys.sql",
  );
  for (
    const columns of [
      "nontechnical_condition_attempts (actor_id)",
      "nontechnical_condition_attempts (aluno_id)",
      "nontechnical_condition_codes (updated_by)",
      "matriculas_plano_financeiro_unico_config (aluno_id)",
      "matriculas_plano_financeiro_unico_config (autorizado_por)",
      "matriculas_plano_financeiro_unico_config (created_by)",
      "matriculas_plano_financeiro_unico_config (generated_by)",
    ]
  ) {
    assert.ok(indexes.includes(columns), `índice ausente para ${columns}`);
  }
  assert.match(
    indexes,
    /matriculas_plano_financeiro_unico_config\s*\(\s*matricula_id,\s*turma_id,\s*aluno_id\s*\)/i,
  );
});

Deno.test("prévia da turma deriva dia e cronograma no banco", () => {
  const normalize = body(
    "internal_academic.normalize_nontechnical_plan_preview_v2(",
  );
  const preview = body(
    "public.prever_plano_financeiro_unico_turma_secure(",
  );
  assert.match(normalize, /p_plan - 'diaVencimento'/i);
  assert.match(
    normalize,
    /extract\(day from v_first_due\)::integer/i,
  );
  assert.match(
    normalize,
    /validate_nontechnical_single_plan_input\(v_input\)/i,
  );
  assert.match(
    preview,
    /p_curso_id uuid[\s\S]*p_polo_id uuid[\s\S]*p_plano jsonb/i,
  );
  assert.match(preview, /assert_can_preview_nontechnical_plan_v2/i);
  assert.match(preview, /'regra', v_rule \|\| jsonb_build_object/i);
  for (
    const field of [
      "revisao",
      "fingerprint",
      "cronograma",
      "valorTotal",
      "qtdParcelas",
      "primeiroVencimento",
      "diaVencimento",
      "descontoPontualidade",
      "jurosAtrasoPercentual",
      "multaAtraso",
    ]
  ) assert.match(sql, new RegExp(`'${field}'`, "i"));
});

Deno.test("condição individual suporta herança, personalização e total efetivo", () => {
  const normalize = body(
    "internal_academic.normalize_nontechnical_adjustment_v2(",
  );
  assert.match(normalize, /HERDAR.*PERSONALIZAR/is);
  assert.match(normalize, /v_count is null or v_count not between 1 and 60/i);
  assert.match(normalize, /NENHUM.*A_VISTA.*NEGOCIADO/is);
  assert.match(normalize, /p_plan\.valor_total - v_commercial_discount/i);
  assert.match(normalize, /v_effective_cents < v_count/i);
  assert.match(
    normalize,
    /v_interest is null or v_interest not between 0 and 100/i,
  );
  assert.match(normalize, /v_on_time_discount >= v_min_installment/i);
  assert.match(normalize, /deve alterar ao menos um campo da turma/i);
  for (
    const field of [
      "valorTotalNominal",
      "descontoComercialTipo",
      "descontoComercialValor",
      "valorTotalEfetivo",
      "menorParcela",
    ]
  ) assert.match(normalize, new RegExp(`'${field}'`, "i"));
});

Deno.test("DTO canônico contém rateio exato, simulações e mensagens", () => {
  const schedule = body(
    "internal_academic.build_nontechnical_effective_schedule_v2(",
  );
  const simulation = body(
    "internal_academic.nontechnical_installment_simulation_v2(",
  );
  const render = body("internal_academic.render_nontechnical_condition_v2(");
  const preview = body(
    "public.prever_condicao_matricula_plano_financeiro_unico_secure(",
  );
  assert.match(schedule, /v_total_cents \/ v_count/i);
  assert.match(schedule, /v_total_cents % v_count/i);
  assert.match(schedule, /Boleto único à vista/i);
  assert.match(schedule, /'simulacao'/i);
  assert.match(simulation, /v_interest_rate \/ 30\.0/i);
  assert.match(simulation, /'mensagemPontualidade'/i);
  assert.match(simulation, /'mensagemAtraso30Dias'/i);
  assert.match(render, /'valorTotalNominal'/i);
  assert.match(render, /'valorTotalEfetivo'/i);
  assert.match(render, /'menorParcela'/i);
  assert.match(render, /'mensagens'/i);
  assert.match(
    preview,
    /'regra', internal_academic\.render_nontechnical_condition_v2/i,
  );
});

Deno.test("código por turma usa bcrypt, RBAC, motivos e bloqueio global do operador", () => {
  assert.match(
    sql,
    /nontechnical_condition_codes[\s\S]*code_hash text not null/i,
  );
  assert.match(
    sql,
    /extensions\.crypt\(v_code, extensions\.gen_salt\('bf', 10\)\)/i,
  );
  assert.match(sql, /primary key \(turma_id, actor_id\)/i);
  const permission = body(
    "internal_academic.assert_can_manage_nontechnical_condition_code_v2(",
  );
  const validation = body(
    "public.validar_codigo_condicao_individual_plano_unico_secure(",
  );
  const reset = body(
    "public.redefinir_codigo_condicao_individual_plano_unico_secure(",
  );
  assert.match(
    permission,
    /assert_can_operate_nontechnical_plan_v2\(p_turma_id, true\)/i,
  );
  assert.match(permission, /gestor_has_tab\('gestao', 'configuracoes'\)/i);
  assert.match(validation, /BLOQUEADO/i);
  assert.match(validation, /least\(v_attempt\.failed_attempts \+ 1, 5\)/i);
  assert.match(validation, /interval '15 minutes'/i);
  assert.match(validation, /on conflict \(turma_id, actor_id\)/i);
  assert.match(validation, /octet_length\(v_candidate\) <= 72/i);
  assert.match(validation, /v_code_matches := extensions\.crypt/i);
  assert.match(
    validation,
    /nontechnical-condition-attempt:' \|\| p_turma_id::text \|\| ':'[\s\S]*coalesce\(v_actor::text, 'service'\)/i,
  );
  assert.match(validation, /if v_service then[\s\S]*'INVALIDO'/i);
  assert.doesNotMatch(
    validation,
    /'autorizado', true, 'motivo', 'SERVICE_ROLE'/i,
  );
  assert.match(sql, /BOLSA.*CONVENIO.*INCENTIVO.*NEGOCIACAO.*A_VISTA.*OUTRO/is);
  assert.match(sql, /modo_condicao <> 'PERSONALIZAR' or motivo is not null/i);
  assert.match(sql, /motivo is distinct from 'OUTRO'[\s\S]*between 5 and 300/i);
  const payloadHash = reset.slice(
    reset.indexOf("v_payload_hash :="),
    reset.indexOf("pg_advisory_xact_lock"),
  );
  assert.doesNotMatch(payloadHash, /p_novo_codigo|'codigo'/i);
});

Deno.test("vínculo sem títulos é acadêmico; geração e diferenças exigem Financeiro", () => {
  const enrollment = body(
    "public.matricular_aluno_plano_financeiro_unico_v2_secure(",
  );
  assert.match(
    enrollment,
    /assert_can_operate_nontechnical_plan_v2\(\s*p_turma_id, false\s*\)/i,
  );
  assert.match(
    enrollment,
    /v_requires_finance := p_gerar_agora[\s\S]*modo'\) = 'PERSONALIZAR'/i,
  );
  assert.match(
    enrollment,
    /if v_requires_finance then[\s\S]*assert_can_operate_nontechnical_plan_v2\(\s*p_turma_id, true/i,
  );
  assert.match(
    enrollment,
    /if v_requires_code then[\s\S]*validar_codigo_condicao_individual/i,
  );
  assert.match(enrollment, /expectedOverrideRevisao/i);
  assert.match(enrollment, /expectedOverrideFingerprint/i);
  assert.match(
    enrollment,
    /if p_gerar_agora then[\s\S]*generate_nontechnical_titles_v2/i,
  );
  assert.match(enrollment, /'regra', case when v_can_view_finance/i);
  assert.match(enrollment, /nontechnical-single-plan-enrollment:/i);
  assert.match(enrollment, /'PENDENTE', false, false, false, false/i);
  const payloadHash = enrollment.slice(
    enrollment.indexOf("v_payload_hash :="),
    enrollment.indexOf(
      "pg_advisory_xact_lock",
      enrollment.indexOf("v_payload_hash :="),
    ),
  );
  assert.doesNotMatch(payloadHash, /p_codigo|'codigo'/i);

  const denied = enrollment.indexOf(
    "if coalesce((v_authorization ->> 'autorizado')::boolean, false) is not true",
  );
  assert.ok(denied >= 0, "retorno de autorização negada ausente");
  for (
    const laterMutation of [
      "insert into public.matriculas(",
      "save_nontechnical_pending_condition_v2(",
      "generate_nontechnical_titles_v2(",
      "insert into internal_academic.nontechnical_financial_requests(",
    ]
  ) {
    assert.ok(
      enrollment.indexOf(laterMutation) > denied,
      `${laterMutation} deve ocorrer depois do retorno negado`,
    );
  }
});

Deno.test("replay precede estado mutável e respeita permissão financeira atual", () => {
  const enrollment = body(
    "public.matricular_aluno_plano_financeiro_unico_v2_secure(",
  );
  const scope = enrollment.indexOf(
    "assert_can_operate_nontechnical_plan_v2(\n    p_turma_id, false",
  );
  const requestRead = enrollment.indexOf(
    "from internal_academic.nontechnical_financial_requests request",
  );
  const classRead = enrollment.indexOf("select class.* into v_class");
  const planRead = enrollment.indexOf("select plan.* into v_plan");
  const normalize = enrollment.indexOf(
    "normalize_nontechnical_adjustment_v2(\n    v_plan",
  );
  assert.ok(scope >= 0 && scope < requestRead, "escopo deve preceder o replay");
  assert.ok(
    requestRead >= 0 && requestRead < classRead,
    "replay deve preceder turma",
  );
  assert.ok(requestRead < planRead, "replay deve preceder plano");
  assert.ok(
    requestRead < normalize,
    "replay deve preceder normalização dependente do plano",
  );
  assert.match(
    enrollment,
    /'motivo', nullif\(v_input_reason, ''\)[\s\S]*'justificativa', v_input_justification/i,
  );
  assert.doesNotMatch(
    enrollment.slice(
      enrollment.indexOf("v_payload_hash :="),
      enrollment.indexOf("nontechnical-single-plan-request:"),
    ),
    /v_reason|p_codigo/i,
  );
  assert.match(
    enrollment,
    /if not v_can_view_finance then[\s\S]*\{regra\}.*null[\s\S]*\{parcelas\}.*\[\]/i,
  );
  assert.match(
    enrollment,
    /insert into internal_academic\.nontechnical_financial_requests[\s\S]*auth\.uid\(\), v_payload_hash, v_response/i,
  );
});

Deno.test("primeira resposta também mascara parcelas sem permissão financeira", () => {
  const guard = migration(
    "20260822161800_mask_single_plan_enrollment_financial_response.sql",
  );
  assert.match(
    guard,
    /rename to matricular_aluno_plano_financeiro_unico_v2_core_20260822/i,
  );
  assert.match(
    guard,
    /revoke all on function public\.matricular_aluno_plano_financeiro_unico_v2_core_20260822[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(guard, /if not v_can_view_finance then/i);
  assert.match(guard, /\{regra\}.*null/is);
  assert.match(guard, /\{parcelas\}.*\[\]/is);
  assert.match(guard, /\{parcelasInseridas\}.*0/is);
  assert.match(guard, /\{parcelasGeradas\}.*0/is);
  assert.ok(
    guard.lastIndexOf("if not v_can_view_finance then")
      < guard.lastIndexOf("return v_response"),
    "a máscara final deve anteceder toda resposta do wrapper",
  );
});

Deno.test("à vista exige boleto único, desconto positivo e motivo coerente", () => {
  const normalize = body(
    "internal_academic.normalize_nontechnical_adjustment_v2(",
  );
  const enrollment = body(
    "public.matricular_aluno_plano_financeiro_unico_v2_secure(",
  );
  assert.match(
    normalize,
    /v_discount_type = 'A_VISTA' and \(v_count <> 1 or v_commercial_discount <= 0\)/i,
  );
  assert.match(
    enrollment,
    /descontoComercialTipo'\) = 'A_VISTA'[\s\S]*motivo'\) <> 'A_VISTA'/i,
  );
});

Deno.test("pendência é otimista e geração congela snapshot e boletos locais", () => {
  const save = body(
    "internal_academic.save_nontechnical_pending_condition_v2(",
  );
  const generate = body("internal_academic.generate_nontechnical_titles_v2(");
  const guard = body("internal_academic.guard_nontechnical_plan_config_v2(");
  assert.match(save, /status_financeiro = 'GERADA'/i);
  assert.match(save, /p_expected_override_revision is null/i);
  assert.match(save, /using errcode = '40001'/i);
  assert.match(save, /CONDICAO_PLANO_UNICO_PERSONALIZADA/i);
  assert.match(save, /'auditoria'[\s\S]*'atorId', p_actor_id/i);
  assert.match(
    generate,
    /insert into public\.matriculas_plano_financeiro_unico/i,
  );
  assert.match(generate, /insert into public\.contas_receber/i);
  assert.match(generate, /'BOLETO'/i);
  assert.match(
    generate,
    /on conflict \(matricula_id, origem_cronograma_id\)[\s\S]*do nothing/i,
  );
  assert.match(
    generate,
    /v_total <> jsonb_array_length\(v_snapshot -> 'cronograma'\)/i,
  );
  assert.match(generate, /status_financeiro = 'GERADA'/i);
  assert.match(generate, /emissão bancária permanece posterior/i);
  assert.match(guard, /imutável após gerar as parcelas/i);
  assert.doesNotMatch(sql, /fetch\(|functions\.invoke|checkout-api|asaas-api/i);
});

Deno.test("consulta pendências e adaptador legado preservam compatibilidade", () => {
  const pending = body(
    "public.obter_pendencias_plano_financeiro_unico_turma_secure(",
  );
  const legacy = body(
    "public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(",
  );
  assert.match(pending, /config\.status_financeiro = 'PENDENTE'/i);
  assert.match(pending, /'planoTurma'/i);
  assert.match(pending, /'pendencias'/i);
  assert.match(pending, /'modo', config\.modo_condicao/i);
  assert.match(legacy, /matricular_aluno_plano_financeiro_unico_v2_secure/i);
  assert.match(legacy, /jsonb_build_object\('modo', 'HERDAR'\), true/i);
  assert.match(legacy, /MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO/i);
});

Deno.test("RPCs públicas são security definer e têm grants explícitos", () => {
  const names = [
    "public.prever_plano_financeiro_unico_turma_secure(",
    "public.prever_condicao_matricula_plano_financeiro_unico_secure(",
    "public.matricular_aluno_plano_financeiro_unico_v2_secure(",
    "public.obter_pendencias_plano_financeiro_unico_turma_secure(",
    "public.obter_status_codigo_condicao_individual_plano_unico_secure(",
    "public.redefinir_codigo_condicao_individual_plano_unico_secure(",
  ];
  for (const name of names) {
    assert.match(body(name), /security definer[\s\S]*set search_path = ''/i);
  }
  assert.match(
    sql,
    /grant execute on function public\.prever_plano_financeiro_unico_turma_secure/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.matricular_aluno_plano_financeiro_unico_v2_secure/i,
  );
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /revoke all on table internal_academic\.nontechnical_condition_codes/i,
  );
});
