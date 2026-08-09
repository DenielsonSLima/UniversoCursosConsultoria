import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809070000_create_flexible_technical_financial_rules.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

function body(name: string) {
  const marker = `create or replace function ${name}`;
  const start = sql.indexOf(marker);
  assert.ok(start >= 0, `função ausente: ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `fim ausente: ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

Deno.test("regra da turma é flexível e não força 12 ou políticas", () => {
  const trigger = body("public.aplicar_padrao_financeiro_turma_tecnica(");
  assert.match(sql, /add column if not exists cobrar_matricula boolean/i);
  assert.match(sql, /add column if not exists cobrar_rematricula boolean/i);
  assert.match(sql, /v_quantidade not between 1 and 60/i);
  assert.match(sql, /length\(v_instrucao\) not between 1 and 180/i);
  assert.doesNotMatch(trigger, /qtd_parcelas\s*<>\s*12/i);
  assert.doesNotMatch(trigger, /aplicar_desconto_matricula\s*:=\s*false/i);
  assert.match(trigger, /build_flexible_technical_financial_schedule/i);
  assert.match(trigger, /technical_financial_rule_fingerprint_v2/i);
});

Deno.test("cronograma omite taxas desabilitadas e simula tudo no backend", () => {
  const schedule = body(
    "internal_academic.build_flexible_technical_financial_schedule(",
  );
  assert.match(schedule, /if \(v_rule ->> 'cobrarMatricula'\)::boolean/i);
  assert.match(schedule, /if \(v_rule ->> 'cobrarRematricula'\)::boolean/i);
  assert.match(
    schedule,
    /for v_numero in 1\.\.\(v_rule ->> 'qtdMensalidades'\)::integer/i,
  );
  assert.match(schedule, /technical_financial_simulation/g);
  for (
    const field of [
      "descontoAplicado",
      "jurosMensal",
      "jurosPercentualDia",
      "jurosValorDia",
      "multa",
      "valorComDesconto",
      "valorComAtraso",
    ]
  ) assert.match(sql, new RegExp(`'${field}'`, "i"));
  assert.match(sql, /'ENCERRA_APOS_MENSALIDADES'/i);
});

Deno.test("override é nullable por campo, tem identidade e prevalece somente ativo", () => {
  assert.match(sql, /qtd_parcelas_individual integer/i);
  assert.match(sql, /aplicar_desconto_matricula_individual boolean/i);
  assert.match(sql, /instrucao_boleto_carne_individual text/i);
  assert.match(sql, /override_ativo boolean not null default false/i);
  assert.match(sql, /override_revisao integer not null default 0/i);
  const effective = body(
    "internal_academic.technical_financial_effective_rule(",
  );
  assert.match(effective, /when not v_override then/i);
  assert.match(
    effective,
    /coalesce\(v_enrollment\.valor_parcela_individual, v_class\.valor_parcela\)/i,
  );
  assert.match(
    effective,
    /when v_enrollment\.valor_matricula_individual = 0 then false/i,
  );
  assert.match(effective, /efetivaFingerprint/i);
});

Deno.test("salvamentos são autorizados, idempotentes e otimistas", () => {
  for (
    const name of [
      "public.salvar_regra_financeira_turma_tecnica_secure(",
      "public.salvar_override_financeiro_matricula_tecnica_secure(",
      "public.remover_override_financeiro_matricula_tecnica_secure(",
    ]
  ) {
    const fn = body(name);
    assert.match(fn, /security definer[\s\S]*set search_path = ''/i);
    assert.match(fn, /gestor_has_tab\('gestao', 'financeiro'\)/i);
    assert.match(fn, /technical-finance-request:/i);
    assert.match(fn, /actor_id is distinct from auth\.uid\(\)/i);
    assert.match(fn, /using errcode = '40001'/i);
  }
  assert.match(sql, /'SALVAR_REGRA_TURMA'/i);
  assert.match(sql, /'SALVAR_OVERRIDE_MATRICULA'/i);
  assert.match(sql, /'REMOVER_OVERRIDE_MATRICULA'/i);
});

Deno.test("ativação preserva override e suporta matrícula ausente sem título zero", () => {
  const activation = body(
    "internal_academic.activate_technical_financial_enrollment(",
  );
  assert.doesNotMatch(activation, /valor_matricula_individual\s*=/i);
  assert.doesNotMatch(activation, /valor_parcela_individual\s*=/i);
  assert.match(activation, /if v_has_matricula then/i);
  assert.match(activation, /status_financeiro = 'ATIVADA'/i);
  assert.match(activation, /gerar_parcelas_matricula\(p_matricula_id\)/i);
  assert.match(activation, /sem título fictício/i);
  assert.match(
    sql,
    /status_financeiro in \('PENDENTE', 'AGENDADA', 'ATIVADA', 'GERADA'\)/i,
  );
});

Deno.test("pós-pagamento usa regra efetiva e rematrícula controla recorrência", () => {
  const installments = body("public.gerar_parcelas_matricula(");
  const reenrollment = body("public.gerar_rematricula_apos_parcelas(");
  assert.match(
    installments,
    /technical_financial_effective_rule\(p_matricula_id\)/i,
  );
  assert.match(installments, /if not v_has_rematricula then return 0/i);
  assert.match(installments, /v_offset := 0/i);
  assert.match(
    reenrollment,
    /technical_financial_effective_rule\(p_matricula_id\)/i,
  );
  assert.match(
    reenrollment,
    /if not \(v_effective -> 'cobranca' -> 'rematricula' ->> 'habilitada'\)::boolean/i,
  );
  assert.match(reenrollment, /v_paid <> v_total/i);
});

Deno.test("títulos existentes nunca são reprecificados", () => {
  assert.doesNotMatch(
    sql,
    /update\s+public\.contas_receber[\s\S]*?set\s+valor\s*=/i,
  );
  assert.doesNotMatch(
    sql,
    /on conflict[\s\S]*?do update set[\s\S]*?valor\s*=/i,
  );
  assert.match(
    sql,
    /on conflict \(matricula_id, origem_cronograma_id\)[\s\S]*do nothing/i,
  );
  assert.match(sql, /títulos existentes permanecem imutáveis/i);
});

Deno.test("título técnico congela política e portal não reaplica regra viva", () => {
  assert.match(
    sql,
    /add column if not exists regra_financeira_tecnica_snapshot jsonb/i,
  );
  const snapshot = body(
    "internal_academic.build_technical_receivable_policy_snapshot(",
  );
  assert.match(snapshot, /technical_financial_effective_rule/i);
  assert.match(snapshot, /v_has_config and not p_preservar_politica_legada/i);
  assert.match(snapshot, /aplicarDesconto/i);
  assert.match(snapshot, /aplicarMultaJuros/i);
  assert.match(snapshot, /'overrideAtivo'/i);
  assert.match(snapshot, /when v_override_active then 'INDIVIDUAL'/i);
  assert.doesNotMatch(
    snapshot,
    /select class,[\s\S]*into v_class, v_modalidade/i,
  );

  const guard = body(
    "internal_academic.guard_technical_receivable_policy_snapshot(",
  );
  assert.match(guard, /if tg_op = 'INSERT'/i);
  assert.match(
    guard,
    /new\.regra_financeira_tecnica_snapshot is distinct from old\.regra_financeira_tecnica_snapshot/i,
  );
  assert.match(guard, /new\.valor is distinct from old\.valor/i);
  assert.match(
    sql,
    /before insert or update of[\s\S]*regra_financeira_tecnica_snapshot[\s\S]*on public\.contas_receber/i,
  );
  assert.match(
    sql,
    /update public\.contas_receber receivable[\s\S]*p_preservar_politica_legada|update public\.contas_receber receivable[\s\S]*receivable\.valor,[\s\S]*true/i,
  );

  const portal = body("public.get_aluno_financeiro_portal_secure(");
  assert.match(portal, /regra_financeira_tecnica_snapshot is not null/i);
  assert.match(
    portal,
    /regra_financeira_tecnica_snapshot ->> 'descontoPontualidade'/i,
  );
  assert.match(
    portal,
    /regra_financeira_tecnica_snapshot ->> 'jurosAtrasoPercentual'/i,
  );
  assert.match(
    portal,
    /regra_financeira_tecnica_snapshot ->> 'multaAtrasoValor'/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_aluno_financeiro_portal_secure\(uuid\)[\s\S]*to authenticated, service_role/i,
  );
});

Deno.test("workspace entrega resumo, progresso e regra efetiva sem cálculo frontend", () => {
  const workspace = body(
    "public.obter_financeiro_matricula_tecnica_workspace_secure(",
  );
  const row = body("internal_academic.technical_financial_row(");
  for (
    const field of [
      "total",
      "recebido",
      "inadimplencia",
      "recebidoPercentual",
      "inadimplenciaPercentual",
    ]
  ) assert.match(workspace, new RegExp(`'${field}'`, "i"));
  for (
    const field of [
      "matriculaExibicao",
      "valorMatriculaEfetivo",
      "valorMensalidadeEfetivo",
      "situacaoFinanceira",
      "parcelasPagas",
      "totalParcelas",
      "progressoPercentual",
      "override",
      "regraEfetiva",
    ]
  ) assert.match(row, new RegExp(`'${field}'`, "i"));
});

Deno.test("lote confirma a identidade efetiva de cada matrícula antes de mutar", () => {
  const batch = body(
    "public.ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure(",
  );
  assert.match(batch, /p_expected_regras jsonb/i);
  assert.match(batch, /jsonb_array_length\(p_expected_regras\)/i);
  assert.match(batch, /overrideRevisao/i);
  assert.match(batch, /overrideFingerprint/i);
  assert.match(batch, /efetivaFingerprint/i);
  const firstAssert = batch.indexOf("assert_expected_technical_effective_rule");
  const firstActivate = batch.indexOf(
    "activate_technical_financial_enrollment",
  );
  assert.ok(firstAssert >= 0 && firstActivate > firstAssert);
});

Deno.test("Realtime, grants mínimos e transação estão fechados", () => {
  assert.match(sql, /financeiro-matricula:turma:/i);
  assert.match(sql, /'rule-changed'|'config-changed'|'title-changed'/i);
  assert.match(sql, /'requestId'/i);
  for (
    const name of [
      "obter_regra_financeira_turma_tecnica_secure",
      "prever_regra_financeira_turma_tecnica_secure",
      "salvar_regra_financeira_turma_tecnica_secure",
      "salvar_override_financeiro_matricula_tecnica_secure",
      "remover_override_financeiro_matricula_tecnica_secure",
      "ativar_financeiro_matricula_tecnica_flexivel_secure",
      "ativar_financeiro_matriculas_tecnicas_flexivel_lote_secure",
    ]
  ) {
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}`, "i"),
    );
  }
  assert.match(
    sql,
    /revoke all on function public\.ativar_financeiro_matricula_tecnica_secure\([\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.ativar_financeiro_matriculas_tecnicas_lote_secure\([\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(sql, /notify pgrst, 'reload schema';\s*commit;\s*$/i);
});
