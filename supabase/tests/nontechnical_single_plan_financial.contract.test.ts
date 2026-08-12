import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260812005933_create_nontechnical_single_plan_financial.sql",
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

Deno.test("o plano único é isolado de técnico, matrícula e rematrícula", () => {
  assert.match(
    sql,
    /create table if not exists public\.turmas_plano_financeiro_unico/i,
  );
  assert.match(sql, /modalidade in \('LIVRE', 'ESPECIALIZACAO'\)/i);
  assert.match(
    sql,
    /create table if not exists public\.matriculas_plano_financeiro_unico/i,
  );
  assert.doesNotMatch(sql, /matriculas_tecnicas_financeiro_config/i);
  assert.doesNotMatch(sql, /gerar_parcelas_matricula\(/i);
  assert.doesNotMatch(sql, /gerar_rematricula_apos_parcelas\(/i);
  const creation = body("public.criar_turma_plano_financeiro_unico_secure(");
  assert.match(creation, /false, 0, false, 0/i);
  assert.match(creation, /não utiliza matrícula ou rematrícula/i);
  assert.match(creation, /'NORMAL', false, true, true/i);
});

Deno.test("quantidade de parcelas é variável e a divisão preserva centavos", () => {
  const validation = body(
    "internal_academic.validate_nontechnical_single_plan_input(",
  );
  const schedule = body(
    "internal_academic.build_nontechnical_single_plan_schedule(",
  );
  assert.match(validation, /v_count not between 1 and 60/i);
  assert.match(
    validation,
    /primeiro vencimento deve estar no formato AAAA-MM-DD/i,
  );
  assert.match(validation, /pg_catalog\.isfinite\(v_first_due\)/i);
  assert.match(validation, /v_total_cents < v_count/i);
  assert.match(
    validation,
    /v_due_day <> extract\(day from v_first_due\)::integer/i,
  );
  assert.match(
    validation,
    /dia de vencimento deve corresponder ao dia do primeiro vencimento/i,
  );
  assert.match(
    validation,
    /v_discount >= v_min_installment and v_discount > 0/i,
  );
  assert.match(schedule, /v_total_cents \/ v_count/i);
  assert.match(schedule, /v_total_cents % v_count/i);
  assert.match(
    schedule,
    /case when v_number <= v_remainder then 1 else 0 end/i,
  );
  assert.doesNotMatch(schedule, /1\.\.4/i);
});

Deno.test("a turma nasce com autorização, auditoria e replay idempotente", () => {
  const creation = body("public.criar_turma_plano_financeiro_unico_secure(");
  assert.match(creation, /gestor_has_module\('gestao'\)/i);
  assert.match(creation, /gestor_has_tab\('gestao', 'financeiro'\)/i);
  assert.match(creation, /is_gestor_for_polo\(v_polo_id\)/i);
  assert.match(creation, /create-nontechnical-single-plan-class:/i);
  assert.match(creation, /actor_id is distinct from auth\.uid\(\)/i);
  assert.match(creation, /historico_turma_financeira/i);
  assert.match(creation, /PLANO_UNICO_TURMA_CRIADO/i);
});

Deno.test("a matrícula só gera parcelas de boleto com snapshot imutável", () => {
  const enrollment = body(
    "public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(",
  );
  const guard = body(
    "internal_academic.guard_nontechnical_single_plan_receivable_snapshot(",
  );
  const enrollmentGuard = body(
    "internal_academic.guard_nontechnical_single_plan_enrollment(",
  );
  const enrollmentUpsert = body(
    "internal_academic.upsert_nontechnical_single_plan_enrollment(",
  );
  const lifecycle = body(
    "internal_academic.assert_nontechnical_single_plan_enrollment_lifecycle(",
  );
  assert.match(enrollment, /assert_can_manage_nontechnical_single_plan/i);
  assert.match(enrollment, /assert_aluno_sem_matricula_curso_duplicada/i);
  assert.match(enrollment, /p_expected_revisao/i);
  assert.match(enrollment, /p_expected_fingerprint/i);
  assert.match(enrollment, /using errcode = '40001'/i);
  assert.match(enrollment, /upsert_nontechnical_single_plan_enrollment/i);
  assert.match(
    enrollmentUpsert,
    /on conflict \(aluno_id, turma_id\) do nothing/i,
  );
  assert.doesNotMatch(
    enrollmentUpsert,
    /on conflict \(aluno_id, turma_id\) do update/i,
  );
  assert.match(
    enrollmentUpsert,
    /não pode ser reaberta pelo plano financeiro/i,
  );
  assert.match(enrollmentUpsert, /sem snapshot financeiro do plano único/i);
  assert.match(
    enrollment,
    /assert_nontechnical_single_plan_enrollment_lifecycle/i,
  );
  assert.doesNotMatch(enrollment, /authorize_enrollment_upsert/i);
  assert.match(lifecycle, /nontechnical-single-plan-capacity:/i);
  assert.match(lifecycle, /for update of class/i);
  assert.match(
    lifecycle,
    /'PLANEJADA',\s*'INSCRICOES_ABERTAS',\s*'EM_ANDAMENTO'/i,
  );
  assert.match(lifecycle, /count\(distinct enrollment\.aluno_id\)/i);
  assert.match(lifecycle, /Turma sem vagas disponíveis para nova matrícula/i);
  const replayPosition = enrollment.indexOf(
    "return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true)",
  );
  const lifecyclePosition = enrollment.indexOf(
    "assert_nontechnical_single_plan_enrollment_lifecycle",
  );
  assert.ok(replayPosition >= 0, "replay idempotente ausente");
  assert.ok(
    lifecyclePosition > replayPosition,
    "validação de status/vagas deve ocorrer somente no primeiro processamento",
  );
  assert.match(enrollment, /tipo_lancamento[\s\S]*'PARCELA'/i);
  assert.match(enrollment, /'BOLETO'/i);
  assert.match(
    enrollment,
    /on conflict \(matricula_id, origem_cronograma_id\)[\s\S]*do nothing/i,
  );
  assert.match(enrollment, /PLANO_UNICO_PARCELAS_GERADAS/i);
  assert.match(guard, /plano-unico-v%/i);
  assert.match(guard, /new\.valor is distinct from old\.valor/i);
  assert.match(
    guard,
    /new\.data_vencimento is distinct from old\.data_vencimento/i,
  );
  assert.match(guard, /app\.nontechnical_single_plan_titles/i);
  assert.match(
    guard,
    /new\.regra_financeira_plano_unico_snapshot is not null/i,
  );
  assert.match(
    guard,
    /session_user in \('postgres', 'supabase_admin', 'service_role'\)/i,
  );
  assert.match(
    guard,
    /baixa, o estorno e a atualização da parcela do plano único/i,
  );
  assert.match(guard, /A parcela não corresponde ao cronograma congelado/i);
  assert.match(
    guard,
    /não podem ser excluídas fora de um cancelamento financeiro auditado/i,
  );
  assert.match(guard, /'PIX', 'CARTAO', 'DINHEIRO', 'TED'/i);
  assert.match(guard, /upper\(coalesce\(new\.status, ''\)\) = 'PAGO'/i);
  assert.match(enrollment, /app\.nontechnical_single_plan_enrollment/i);
  assert.match(enrollment, /app\.nontechnical_single_plan_titles/i);
  assert.match(enrollmentGuard, /turmas_plano_financeiro_unico/i);
  assert.match(enrollmentGuard, /snapshot e todas as parcelas/i);
  assert.match(enrollmentGuard, /new\.status is distinct from old\.status/i);
  assert.match(enrollmentGuard, /auth\.role\(\).*service_role/i);
  assert.match(
    enrollmentGuard,
    /A ativação e as condições financeiras desta matrícula dependem da confirmação do boleto/i,
  );
  assert.match(sql, /before insert or update or delete on public\.matriculas/i);
});

Deno.test("entrypoints legados não criam matrícula incompleta em turma com plano único", () => {
  const legacyFunctions = [
    "public.matricular_aluno_turma(",
    "public.matricular_aluno_turma_financeiro(",
    "public.payment_checkout_upsert_matricula(",
    "public.asaas_checkout_upsert_matricula(",
  ];
  for (const functionName of legacyFunctions) {
    const start = sql.lastIndexOf(`create or replace function ${functionName}`);
    assert.ok(start >= 0, `entrypoint ausente: ${functionName}`);
    const legacyBody = sql.slice(
      start,
      sql.indexOf("$function$;", start) + "$function$;".length,
    );
    assert.match(legacyBody, /turmas_plano_financeiro_unico/i);
    assert.match(legacyBody, /fluxo que gera todas as parcelas/i);
  }
  const financialEnrollment = body("public.matricular_aluno_turma_financeiro(");
  assert.match(
    financialEnrollment,
    /pré-vínculo técnico e a ativação financeira canônica/i,
  );
});

Deno.test("portal do aluno prioriza o snapshot do plano único", () => {
  const portal = body("public.get_aluno_financeiro_portal_secure(");
  assert.match(
    portal,
    /regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'/i,
  );
  assert.match(
    portal,
    /regra_financeira_plano_unico_snapshot ->> 'descontoPontualidade'/i,
  );
  assert.match(
    portal,
    /regra_financeira_plano_unico_snapshot ->> 'jurosAtrasoPercentual'/i,
  );
  assert.match(
    portal,
    /regra_financeira_plano_unico_snapshot ->> 'multaAtraso'/i,
  );
});

Deno.test("leitura e escrita usam RPCs com menor privilégio", () => {
  for (
    const name of [
      "public.criar_turma_plano_financeiro_unico_secure(",
      "public.obter_plano_financeiro_unico_turma_secure(",
      "public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(",
    ]
  ) {
    const fn = body(name);
    assert.match(fn, /security definer[\s\S]*set search_path = ''/i);
  }
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /revoke all on table internal_academic\.nontechnical_financial_requests/i,
  );
  assert.match(sql, /notify pgrst, 'reload schema'/i);
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;\s*$/i);
});

Deno.test("espelhos da turma e modalidade do curso não desviam o plano único para o fluxo técnico", () => {
  const turmaGuard = body(
    "internal_academic.protect_nontechnical_single_plan_turma_mirrors(",
  );
  const courseGuard = body(
    "internal_academic.protect_nontechnical_single_plan_course_modality(",
  );
  assert.match(turmaGuard, /new\.curso_id is distinct from old\.curso_id/i);
  assert.match(turmaGuard, /new\.polo_id is distinct from old\.polo_id/i);
  assert.match(
    turmaGuard,
    /new\.cronograma_financeiro is distinct from old\.cronograma_financeiro/i,
  );
  assert.match(
    turmaGuard,
    /new\.sincronizar_asaas_futuro is distinct from old\.sincronizar_asaas_futuro/i,
  );
  assert.match(sql, /before update of modalidade on public\.cursos/i);
  assert.match(courseGuard, /turmas_plano_financeiro_unico/i);
});

Deno.test("o snapshot referencia a combinação canônica de matrícula, turma e aluno", () => {
  assert.match(
    sql,
    /constraint matriculas_plano_financeiro_unico_matricula_turma_aluno_fkey\s+foreign key \(matricula_id, turma_id, aluno_id\)\s+references public\.matriculas\(id, turma_id, aluno_id\)/i,
  );
});

Deno.test("o resumo usa recebimento efetivo e soma títulos ainda não pagos", () => {
  const workspace = body("public.obter_plano_financeiro_unico_turma_secure(");
  assert.match(
    workspace,
    /sum\(coalesce\(title\.valor_pago, title\.valor\)\)\s+filter \(where upper\(coalesce\(title\.status, ''\)\) = 'PAGO'\)/i,
  );
  assert.match(
    workspace,
    /sum\(title\.valor\)\s+filter \(where upper\(coalesce\(title\.status, ''\)\) <> 'PAGO'\)/i,
  );
  assert.match(workspace, /'emAberto', v_total_em_aberto/i);
  assert.doesNotMatch(
    workspace,
    /greatest\(0, v_total_lancado - v_total_recebido\)/i,
  );
});

Deno.test("realtime preserva as permissões existentes e soma Gestão > Financeiro por turma", () => {
  assert.doesNotMatch(
    sql,
    /drop policy if exists finance_realtime_events_select/i,
  );
  assert.match(
    sql,
    /create policy finance_realtime_events_gestao_financeiro_turma_select\s+on public\.finance_realtime_events\s+as permissive\s+for select\s+to authenticated/i,
  );
  assert.match(
    sql,
    /turma_id is not null\s+and \(select public\.can_operate_turma_academics\(turma_id\)\)\s+and \(select public\.gestor_has_tab\('gestao', 'financeiro'\)\)/i,
  );
});
