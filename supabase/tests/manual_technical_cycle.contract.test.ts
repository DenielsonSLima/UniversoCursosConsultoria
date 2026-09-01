import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const policySql = await Deno.readTextFile(new URL(
  "../migrations/20260901120000_create_manual_technical_cycle_policy.sql",
  import.meta.url,
));
const stateSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120050_create_manual_technical_cycle_state.sql",
  import.meta.url,
));
const previewSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120100_create_manual_technical_cycle_preview.sql",
  import.meta.url,
));
const generationSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120200_create_manual_technical_cycle_generation.sql",
  import.meta.url,
));
const legacyGateSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120250_gate_legacy_technical_cycle_generators.sql",
  import.meta.url,
));
const workspaceSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120300_project_manual_cycle_in_technical_workspace.sql",
  import.meta.url,
));
const allSql = [
  policySql,
  stateSql,
  previewSql,
  generationSql,
  legacyGateSql,
  workspaceSql,
].join("\n");

const functionBody = (sql: string, qualifiedName: string) => {
  const marker = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${qualifiedName.replaceAll(".", "\\.")}\\s*\\(`,
    "i",
  );
  const match = marker.exec(sql);
  assert.ok(match, `função ausente: ${qualifiedName}`);
  const start = match.index;
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${qualifiedName}`);
  return sql.slice(start, end + "$function$;".length);
};

const assertNoHistoricalReceivableMutation = (sql: string) => {
  assert.doesNotMatch(sql, /insert\s+into\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /update\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.payment_gateway_transactions/i);
  assert.doesNotMatch(sql, /update\s+public\.payment_gateway_transactions/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.payment_gateway_transactions/i);
};

Deno.test("T42 adere com ciclo 1 histórico, máximo 2 e proteção estrutural", () => {
  assert.match(policySql, /class\.codigo\s*=\s*'ENF-T42-INT-MAT'/i);
  assert.match(
    policySql,
    /upper\(coalesce\(course\.modalidade, ''\)\)\s+in\s*\('TECNICO', 'TÉCNICO'\)/i,
  );
  assert.match(
    policySql,
    /v_turma_id,\s*'MANUAL',\s*'IMPORTADA_CICLO_1',\s*1,\s*2,\s*[\s\S]*?'PENULTIMA_SEM_ATRASO'/i,
  );
  assert.match(policySql, /baseline_cycle in \(0, 1, 2\)/i);
  assert.match(policySql, /initial_state = 'NOVA' and baseline_cycle = 0/i);
  assert.match(policySql, /initial_state = 'IMPORTADA_CICLO_1' and baseline_cycle = 1/i);
  assert.match(policySql, /initial_state = 'IMPORTADA_CONCLUIDA' and baseline_cycle = 2/i);
  assert.match(policySql, /max_cycle = 2/i);
  assert.match(policySql, /cycle_number in \(1, 2\)/i);
  assert.match(
    policySql,
    /expected_installment_count[\s\S]*?between 1 and 60/i,
  );
  assert.match(policySql, /cardinality\(receivable_ids\) = item_count/i);
  assert.match(policySql, /cycle_number, state[\s\S]*?2,[\s\S]*?'PROTECTED_EXISTING'/i);
  assert.match(policySql, /'ciclo-1-rematricula'/i);
  assert.match(policySql, /'\^ciclo-2-parc-\[0-9\]\+\$'/i);
  assert.match(policySql, /tipo_lancamento[\s\S]*?REMATRICULA/i);
  assert.match(policySql, /regra_financeira_tecnica_snapshot[\s\S]*?cicloManual/i);
  assert.doesNotMatch(allSql, /Adenize|cpf_cnpj|@/i);

  // O reconhecimento materializa somente política/fence. Histórico financeiro
  // continua imutável e não recebe origem de cronograma retroativa.
  assertNoHistoricalReceivableMutation([
    policySql,
    previewSql,
    legacyGateSql,
    workspaceSql,
  ].join("\n"));
});

Deno.test("estado canônico oferece somente o ciclo 2 e nunca abre ciclo 3", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  for (
    const expected of [
      "ELEGIVEL",
      "BLOQUEADO",
      "JA_GERADO",
      "PROTEGIDO_EXISTENTE",
      "CICLOS_CONCLUIDOS",
      "NAO_HABILITADO",
    ]
  ) assert.match(state, new RegExp(`'${expected}'`, "i"));
  assert.match(
    state,
    /run\.state in\s*\('LOCAL_CREATED', 'PROTECTED_EXISTING'\)[\s\S]*?order by run\.cycle_number desc/i,
  );
  assert.match(
    state,
    /v_next_cycle\s*:=\s*coalesce\([\s\S]*?v_last_run\.cycle_number,[\s\S]*?v_policy\.baseline_cycle[\s\S]*?\)\s*\+\s*1/i,
  );
  assert.match(state, /v_previous_cycle\s*:=\s*v_next_cycle\s*-\s*1/i);
  assert.match(state, /v_last_run\.cycle_number\s*>=\s*v_policy\.max_cycle/i);
  assert.doesNotMatch(state, /v_next_cycle\s*:=\s*v_policy\.baseline_cycle\s*\+\s*1/i);
  assert.match(state, /status[\s\S]*?not in\s*\('PENDENTE', 'ATIVO'\)/i);
  assert.match(
    state,
    /v_last_run\.state\s*=\s*'PROTECTED_EXISTING'[\s\S]*?v_state\s*:=\s*'PROTEGIDO_EXISTENTE'/i,
  );
  assert.ok(
    state.indexOf("v_last_run.state = 'PROTECTED_EXISTING'") <
      state.indexOf("v_enrollment.status"),
    "proteção existente precisa vencer a elegibilidade acadêmica",
  );
  assert.doesNotMatch(allSql, /ciclo-3|cycle_number\s*=\s*3/i);
});

Deno.test("estado canônico nasce uma vez antes da prévia, sem wrapper transitório", () => {
  assert.equal(
    (allSql.match(
      /create\s+or\s+replace\s+function\s+internal_academic\.technical_manual_cycle_state\s*\(/gi,
    ) ?? []).length,
    1,
  );
  assert.doesNotMatch(allSql, /technical_manual_cycle_state_v2|20260901120150/i);
  assert.doesNotMatch(
    previewSql,
    /create\s+or\s+replace\s+function\s+internal_academic\.technical_manual_cycle_state\s*\(/i,
  );
});

Deno.test("baseline zero avança do ciclo 1 ao 2 e encerra sem ciclo 3", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  const nextCycle = (baseline: number, maximum: number, last?: number) => {
    const current = last ?? baseline;
    return current >= maximum ? null : current + 1;
  };

  assert.equal(nextCycle(0, 2), 1);
  assert.equal(nextCycle(0, 2, 1), 2);
  assert.equal(nextCycle(0, 2, 2), null);
  assert.match(state, /v_previous_cycle\s*=\s*0[\s\S]*?v_state\s*:=\s*'ELEGIVEL'/i);
  assert.match(
    state,
    /v_last_run\.cycle_number\s*=\s*v_previous_cycle[\s\S]*?receivable\.id\s*=\s*any\(v_last_run\.receivable_ids\)/i,
  );
  assert.match(
    state,
    /else\s+v_rule_installments\s*:=\s*\([\s\S]*?technical_financial_effective_rule[\s\S]*?origem_pagamento\s*=\s*'SISTEMA_ANTERIOR'/i,
  );
  assert.match(state, /'numero',\s*v_last_run\.cycle_number/i);
  assert.match(state, /'proximoCicloNumero',\s*v_next_cycle/i);
  assert.match(state, /v_next_cycle\s*:=\s*null/i);
});

Deno.test("PENULTIMA exige a parcela N-1 paga e ignora dívida de outro ciclo", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  assert.match(
    state,
    /v_rule_installments\s*:=\s*v_last_run\.expected_installment_count[\s\S]*?v_total\s*=\s*v_rule_installments[\s\S]*?v_first_installment\s*=\s*1[\s\S]*?v_last_installment\s*=\s*v_rule_installments[\s\S]*?receivable\.parcela_numero\s*=\s*greatest\([\s\S]*?v_rule_installments\s*-\s*1,\s*1[\s\S]*?receivable\.status\s*=\s*'PAGO'/i,
  );
  assert.match(
    state,
    /receivable\.matricula_id\s*=\s*p_matricula_id[\s\S]*?receivable\.parcela_numero\s+between\s+1\s+and\s+v_rule_installments[\s\S]*?bool_or\([\s\S]*?receivable\.parcela_numero\s*=\s*greatest\(v_rule_installments\s*-\s*1,\s*1\)[\s\S]*?receivable\.status\s*=\s*'PAGO'/i,
  );
  assert.match(
    state,
    /v_policy\.eligibility_rule\s*=\s*'PENULTIMA_SEM_ATRASO'[\s\S]*?not\s+v_penultimate_paid[\s\S]*?v_policy\.eligibility_rule\s*=\s*'QUITACAO_TOTAL'[\s\S]*?v_paid\s*<\s*v_expected_paid/i,
  );
  assert.doesNotMatch(
    state,
    /v_policy\.eligibility_rule\s*=\s*'PENULTIMA_SEM_ATRASO'[\s\S]{0,120}?v_paid\s*>=\s*v_expected_paid\s*-\s*1/i,
  );
});

Deno.test("prévia é side-effect free e compõe rematrícula opcional mais N parcelas", () => {
  const preview = functionBody(
    previewSql,
    "internal_academic.technical_manual_cycle_preview",
  );
  assert.match(preview, /volatile[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(preview, /technical_financial_effective_rule\(p_matricula_id\)/i);
  assert.match(preview, /p_cycle_number\s*=\s*2[\s\S]*?'rematricula'[\s\S]*?'habilitada'/i);
  assert.match(preview, /v_key\s*:=\s*'ciclo-1-rematricula'/i);
  assert.match(preview, /for v_number in 1\.\.v_count loop/i);
  assert.match(preview, /v_key\s*:=\s*'ciclo-'\s*\|\|\s*p_cycle_number\s*\|\|\s*'-parc-'/i);
  assert.match(preview, /jsonb_array_length\(v_items\)/i);
  assert.match(
    preview,
    /p_cycle_number\s*=\s*2\s+and\s+p_first_due_date\s+is\s+null[\s\S]*?using errcode = '22023'/i,
  );
  assert.match(
    preview,
    /p_first_due_date\s+is\s+not\s+null[\s\S]*?v_source\s*:=\s*'INDIVIDUAL'[\s\S]*?v_first_due\s*:=\s*p_first_due_date/i,
  );
  assert.match(
    preview,
    /public\.data_vencimento_mensal\([\s\S]*?v_first_due,[\s\S]*?v_day,[\s\S]*?v_number\s*-\s*case\s+when\s+v_has_lead_fee\s+then\s+0\s+else\s+1\s+end/i,
  );
  assert.match(
    preview,
    /'termos',\s*internal_academic\.technical_manual_cycle_terms\(v_rule\)/i,
  );
  const terms = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_terms",
  );
  for (const field of [
    "descontoPontualidade",
    "jurosAtrasoPercentual",
    "multaAtrasoPercentual",
    "instrucaoBoleto",
    "aplicacao",
  ]) assert.match(terms, new RegExp(`'${field}'`, "i"));
  assert.doesNotMatch(preview, /1\.\.12|v_count\s*:=\s*12/i);
  assertNoHistoricalReceivableMutation(preview);
  assert.doesNotMatch(preview, /banese|gateway_|http|net\./i);
});

Deno.test("geração cria exatamente os itens locais da prévia e zero Banese", () => {
  const generate = functionBody(
    generationSql,
    "public.gerar_ciclo_financeiro_tecnico_manual_secure",
  );
  assert.match(generate, /v_preview\s*:=\s*v_preview_envelope\s*->\s*'preview'/i);
  assert.match(generate, /for v_item in select item from jsonb_array_elements\(v_preview -> 'itens'\)/i);
  assert.equal(
    (generate.match(/insert\s+into\s+public\.contas_receber/gi) ?? []).length,
    1,
  );
  assert.match(generate, /v_inserted\s*:=\s*v_inserted\s*\+\s*1/i);
  assert.match(generate, /v_inserted\s*<>\s*\(v_preview ->> 'quantidadeItens'\)::integer/i);
  assert.match(generate, /'emissaoBanese',\s*'NAO_EMITIDO'/i);
  assert.match(generate, /nenhuma emissão bancária foi executada/i);
  assert.doesNotMatch(
    generate,
    /gateway_provider|gateway_submission|gateway_boleto|payment_gateway_transactions|create_banese|http|net\./i,
  );
});

Deno.test("duplo clique e concorrência são cercados por request e matrícula", () => {
  const generate = functionBody(
    generationSql,
    "public.gerar_ciclo_financeiro_tecnico_manual_secure",
  );
  assert.match(generate, /technical-finance-request:'\s*\|\|\s*p_request_id/i);
  assert.match(generate, /technical-manual-cycle-enrollment:'\s*\|\|\s*p_matricula_id/i);
  assert.match(generate, /technical_financial_requests[\s\S]*?where request\.request_id = p_request_id/i);
  assert.match(generate, /return jsonb_set\(v_existing\.response, '\{replayed\}', 'true'::jsonb/i);
  assert.match(policySql, /primary key \(matricula_id, cycle_number\)/i);
  assert.match(policySql, /request_id uuid unique/i);
  assert.match(generate, /perform 1 from public\.matriculas[\s\S]*?for update/i);
  assert.match(
    generate,
    /from public\.contas_receber receivable[\s\S]*?where receivable\.matricula_id = p_matricula_id[\s\S]*?order by receivable\.id[\s\S]*?for update/i,
  );
  assert.ok(
    generate.indexOf("from public.contas_receber receivable") <
      generate.indexOf("v_preview_envelope :="),
    "baixa/estorno do ciclo-base deve ser serializado antes da prévia final",
  );
  assert.match(generate, /set_config\([\s\S]*?app\.technical_manual_cycle_request_id/i);
});

Deno.test("retorno pós-escrita usa snapshots atuais do ciclo e workspace", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  const workspace = functionBody(
    workspaceSql,
    "public.obter_financeiro_matricula_tecnica_workspace_secure",
  );
  const generate = functionBody(
    generationSql,
    "public.gerar_ciclo_financeiro_tecnico_manual_secure",
  );
  const finalReturn = generate.lastIndexOf("return v_stored_response");

  assert.match(state, /language plpgsql\s+volatile/i);
  assert.match(workspace, /language plpgsql\s+volatile/i);
  assert.ok(generate.indexOf("set state = 'LOCAL_CREATED'") < finalReturn);
  assert.ok(
    generate.lastIndexOf("insert into internal_academic.technical_financial_requests") <
      finalReturn,
  );
  assert.match(
    generate.slice(finalReturn),
    /technical_manual_cycle_state[\s\S]*?obter_financeiro_matricula_tecnica_workspace_secure/i,
  );
});

Deno.test("drift de regra, política ou cronograma falha antes de inserir", () => {
  const generate = functionBody(
    generationSql,
    "public.gerar_ciclo_financeiro_tecnico_manual_secure",
  );
  for (
    const parameter of [
      "p_expected_regra_fingerprint",
      "p_expected_politica_fingerprint",
      "p_expected_cronograma_fingerprint",
    ]
  ) {
    assert.match(generate, new RegExp(`${parameter}[\\s\\S]*?\\^\\[0-9a-f\\]\\{64\\}\\$`, "i"));
    assert.match(generate, new RegExp(`<>\\s*${parameter}`, "i"));
  }
  const mismatch = generate.indexOf("A configuração ou o cronograma mudou");
  const insert = generate.indexOf("insert into internal_academic.technical_manual_cycle_runs");
  assert.ok(mismatch >= 0 && insert > mismatch);
  assert.match(generate, /using errcode = '40001'/i);
});

Deno.test("TRANCADO e escopo RBAC/polo falham no backend", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  assert.match(state, /not in\s*\('PENDENTE', 'ATIVO'\)/i);
  assert.match(state, /'STATUS_ACADEMICO'/i);
  assert.match(
    state,
    /receivable\.id\s*=\s*any\(v_last_run\.receivable_ids\)[\s\S]*?'INADIMPLENCIA_CICLO_ANTERIOR'/i,
  );

  for (
    const [sql, name] of [
      [previewSql, "public.preview_ciclo_financeiro_tecnico_manual_secure"],
      [generationSql, "public.gerar_ciclo_financeiro_tecnico_manual_secure"],
    ] as const
  ) {
    const rpc = functionBody(sql, name);
    assert.match(rpc, /can_operate_turma_academics\(v_turma_id\)/i);
    assert.match(rpc, /gestor_has_tab\('gestao', 'financeiro'\)/i);
    assert.match(rpc, /using errcode = '42501'/i);
    assert.match(rpc, /security definer[\s\S]*set search_path = ''/i);
  }
  assert.match(previewSql, /from public, anon, authenticated, service_role;[\s\S]*?to authenticated, service_role/i);
  assert.match(generationSql, /from public, anon, authenticated, service_role;[\s\S]*?to authenticated, service_role/i);
});

Deno.test("pagamento, wrappers legados e jobs não geram em turma manual", () => {
  const paymentTrigger = functionBody(
    generationSql,
    "public.gerar_ciclo_financeiro_apos_pagamento",
  );
  assert.match(paymentTrigger, /generation_mode\s*=\s*'MANUAL'/i);
  assert.match(paymentTrigger, /and not v_manual/i);

  const installments = functionBody(
    legacyGateSql,
    "public.gerar_parcelas_matricula",
  );
  const reenrollment = functionBody(
    legacyGateSql,
    "public.gerar_rematricula_apos_parcelas",
  );
  assert.match(installments, /if v_manual then\s*return 0;/i);
  assert.match(reenrollment, /if v_manual then\s*return null;/i);
  assert.ok(
    installments.indexOf("return 0") <
      installments.indexOf("generate_technical_installments_automatic_legacy"),
  );
  assert.ok(
    reenrollment.indexOf("return null") <
      reenrollment.indexOf("generate_technical_reenrollment_automatic_legacy"),
  );
  const scheduledWorker = functionBody(
    legacyGateSql,
    "public.processar_ativacoes_financeiras_tecnicas_agendadas",
  );
  assert.match(scheduledWorker, /not exists\s*\([\s\S]*?generation_mode\s*=\s*'MANUAL'/i);
  assert.doesNotMatch(allSql, /cron\.schedule|pg_cron|http_post/i);
});

Deno.test("matrícula protegida bloqueia geração e nova emissão, mas não GET", () => {
  const insertGuard = functionBody(
    policySql,
    "internal_academic.guard_technical_manual_cycle_insert",
  );
  const bankGuard = functionBody(
    policySql,
    "internal_academic.guard_protected_technical_bank_post",
  );
  assert.match(insertGuard, /is_technical_manual_cycle_protected\(new\.matricula_id\)/i);
  assert.match(insertGuard, /Matrícula protegida: novas cobranças técnicas são bloqueadas/i);
  assert.match(bankGuard, /new\.gateway_creation_token is not null/i);
  assert.match(bankGuard, /new\.gateway_cnab_file_id is not null/i);
  assert.match(bankGuard, /new\.gateway_submission_channel = 'CNAB'/i);
  assert.match(bankGuard, /new\.gateway_submission_status = 'API_AMBIGUOUS'/i);
  assert.doesNotMatch(bankGuard, /new\.gateway_submission_status = 'API_REGISTERED'/i);
  assert.doesNotMatch(bankGuard, /gateway_pix_payload|gateway_pix_encoded_image|data_pagamento|valor_pago/i);
  assertNoHistoricalReceivableMutation([
    policySql,
    previewSql,
    legacyGateSql,
    workspaceSql,
  ].join("\n"));
});

Deno.test("recebíveis materializados do ciclo manual não podem ser excluídos", () => {
  const deleteGuard = functionBody(
    policySql,
    "internal_academic.guard_technical_manual_cycle_delete",
  );
  assert.match(
    deleteGuard,
    /run\.state in\s*\('LOCAL_CREATED', 'PROTECTED_EXISTING'\)/i,
  );
  assert.match(deleteGuard, /run\.matricula_id\s*=\s*old\.matricula_id/i);
  assert.match(deleteGuard, /old\.id\s*=\s*any\(run\.receivable_ids\)/i);
  assert.match(deleteGuard, /return old/i);
  assert.match(
    policySql,
    /create trigger guard_technical_manual_cycle_delete[\s\S]*?before delete on public\.contas_receber/i,
  );
});

Deno.test("workspace projeta ciclo manual sem ampliar para outras modalidades", () => {
  const workspace = functionBody(
    workspaceSql,
    "public.obter_financeiro_matricula_tecnica_workspace_secure",
  );
  assert.match(workspace, /'cicloManual'[\s\S]*?technical_manual_cycle_state\(enrollment\.id\)/i);
  assert.match(workspace, /modalidade not in \('TECNICO', 'TÉCNICO'\)/i);
  assert.match(workspace, /can_operate_turma_academics\(p_turma_id\)/i);
  assert.match(workspace, /gestor_has_tab\('gestao', 'financeiro'\)/i);
  assert.doesNotMatch(allSql, /ead_config|inscricoes_online|curso_livre|especializacao/i);
});
