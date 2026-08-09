import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809060000_create_deferred_technical_financial_activation.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test("cronograma técnico é projeção da regra viva da turma", () => {
  assert.match(sql, /regra_financeira_revisao integer not null default 1/i);
  assert.match(sql, /regra_financeira_fingerprint text/i);
  assert.match(
    sql,
    /new\.cronograma_financeiro := public\.build_gestao_financial_schedule/i,
  );
  assert.match(
    sql,
    /old\.regra_financeira_fingerprint is distinct from v_fingerprint/i,
  );
  assert.match(
    sql,
    /update public\.turmas class[\s\S]*upper\(coalesce\(course\.modalidade/i,
  );
  assert.doesNotMatch(
    sql,
    /update public\.contas_receber[\s\S]*set\s+valor\s*=/i,
  );
  assert.doesNotMatch(
    sql,
    /new\.valor_matricula\s*:=\s*150/i,
  );
  assert.match(
    sql,
    /Nenhum valor financeiro é inventado na criação/i,
  );
  assert.match(sql, /alter column valor_matricula drop default/i);
  assert.match(sql, /alter column valor_rematricula drop default/i);
  assert.match(sql, /alter column qtd_parcelas drop default/i);
  assert.match(sql, /alter column valor_parcela drop default/i);
  assert.match(sql, /new\.desconto_pontualidade < 0/i);
  assert.match(sql, /new\.juros_atraso < 0/i);
  assert.match(
    sql,
    /drop trigger if exists sincronizar_multa_percentual_turma_tecnica_trigger/i,
  );
  const technicalTrigger = sql.match(
    /create or replace function public\.aplicar_padrao_financeiro_turma_tecnica[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  const fineNormalization = technicalTrigger.indexOf(
    "new.multa_atraso := round",
  );
  const fingerprint = technicalTrigger.indexOf("v_fingerprint :=");
  assert.ok(fineNormalization >= 0);
  assert.ok(fingerprint > fineNormalization);
});

Deno.test("pré-vínculo técnico não gera cobrança e fecha o entrypoint legado", () => {
  assert.match(
    sql,
    /create or replace function public\.pre_vincular_aluno_tecnico_secure/i,
  );
  assert.match(
    sql,
    /gerar_cobranca_inicial, gerar_cobranca_futura, sincronizar_asaas[\s\S]*v_due, false, false, false, false/i,
  );
  assert.match(sql, /'cobrancaGerada', false/i);
  assert.match(
    sql,
    /Use o pré-vínculo técnico e a ativação financeira canônica/i,
  );
  assert.match(
    sql,
    /create or replace function public\.payment_checkout_upsert_matricula[\s\S]*checkout não pode gerar cobrança para curso técnico/i,
  );
  assert.match(
    sql,
    /create or replace function public\.asaas_checkout_upsert_matricula[\s\S]*checkout Asaas legado não pode processar curso técnico/i,
  );
  assert.doesNotMatch(
    sql.match(
      /create or replace function public\.pre_vincular_aluno_tecnico_secure[\s\S]*?\$function\$;/i,
    )?.[0] ?? "",
    /gerar_cobranca_matricula\(/i,
  );
});

Deno.test("mutações exigem identidade da regra, idempotência e permissão financeira", () => {
  assert.equal(
    (sql.match(/p_expected_regra_revisao integer default null/g) ?? []).length,
    3,
  );
  assert.equal(
    (sql.match(/p_expected_regra_fingerprint text default null/g) ?? []).length,
    3,
  );
  assert.match(sql, /using errcode = '40001'/i);
  assert.equal((sql.match(/technical-finance-request:/g) ?? []).length, 3);
  assert.match(sql, /public\.gestor_has_tab\('gestao', 'alunos'\)/i);
  assert.ok(
    (sql.match(/public\.gestor_has_tab\('gestao', 'financeiro'\)/g) ?? [])
      .length >= 4,
  );
  assert.ok(
    (sql.match(/actor_id is distinct from auth\.uid\(\)/g) ?? []).length >= 3,
  );
});

Deno.test("ativação individual e lote são canônicas e não enviam gateway", () => {
  assert.match(
    sql,
    /create or replace function public\.ativar_financeiro_matricula_tecnica_secure/i,
  );
  assert.match(
    sql,
    /create or replace function public\.ativar_financeiro_matriculas_tecnicas_lote_secure/i,
  );
  assert.match(sql, /cardinality\(p_matricula_ids\) not between 1 and 100/i);
  assert.match(sql, /count\(distinct item\)/i);
  assert.match(
    sql,
    /for v_id in select distinct item from unnest\(p_matricula_ids\) item order by item/i,
  );
  assert.match(sql, /sincronizar_asaas = false/i);
  assert.match(
    sql,
    /v_title := public\.gerar_cobranca_matricula\(p_matricula_id\)/i,
  );
  assert.doesNotMatch(
    sql,
    /asaas[_-](create|sync|payment)|banese|mercado[_-]?pago/i,
  );
  assert.match(
    sql,
    /v_turma\.status[\s\S]*not in \('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO'\)/i,
  );
});

Deno.test("agendamento não aplica regra alterada sem nova confirmação", () => {
  assert.match(sql, /p_require_matching_scheduled_rule boolean default false/i);
  assert.match(
    sql,
    /v_config\.regra_fingerprint is distinct from \(v_rule->>'fingerprint'\)/i,
  );
  assert.match(
    sql,
    /status_financeiro = 'PENDENTE'[\s\S]*é necessária nova confirmação/i,
  );
  assert.match(sql, /processar_ativacoes_financeiras_tecnicas_agendadas/i);
  assert.match(sql, /scheduled-technical-finance-worker/i);
  assert.match(sql, /activate-scheduled-technical-finance-every-minute/i);
});

Deno.test("RLS e Broadcast privado cobrem configuração, exclusão e título", () => {
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /using \(\s*public\.can_operate_turma_academics\(turma_id\)\s*and public\.gestor_has_tab\('gestao', 'financeiro'\)\s*\)/i,
  );
  assert.match(
    sql,
    /can_subscribe_technical_financial_topic[\s\S]*can_operate_turma_academics\(v_turma_id\)[\s\S]*gestor_has_tab\('gestao', 'financeiro'\)/i,
  );
  assert.match(sql, /financeiro-matricula:turma:/i);
  assert.match(sql, /'config-changed'/i);
  assert.match(sql, /'title-changed'/i);
  assert.match(sql, /'rule-changed'/i);
  assert.match(sql, /'requestId'/i);
  assert.match(sql, /'origin'/i);
  assert.match(sql, /true\s*\n\s*\);/i);
  assert.match(
    sql,
    /after insert or update or delete on public\.matriculas_tecnicas_financeiro_config/i,
  );
});

Deno.test("backfill materializa pendentes sem criar títulos nem alterar históricos", () => {
  assert.match(
    sql,
    /case when title\.id is null then 'PENDENTE' else 'GERADA' end/i,
  );
  assert.match(sql, /config\.status_financeiro = 'PENDENTE'/i);
  assert.match(sql, /gerar_cobranca_inicial = false/i);
  assert.match(
    sql,
    /disable trigger broadcast_technical_financial_config[\s\S]*enable trigger broadcast_technical_financial_config/i,
  );
  assert.match(
    sql,
    /perform internal_academic\.authorize_matricula_control_update\(v_matricula_id\)/i,
  );
  assert.doesNotMatch(
    sql.match(
      /insert into public\.matriculas_tecnicas_financeiro_config[\s\S]*?on conflict \(matricula_id\) do nothing;/i,
    )?.[0] ?? "",
    /insert into public\.contas_receber/i,
  );
});

Deno.test("transferências e retornos preservam o acadêmico e iniciam financeiro pendente", () => {
  const initializer = sql.match(
    /create or replace function internal_academic\.ensure_technical_financial_pending[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  const activationTrigger = sql.match(
    /create or replace function public\.criar_financeiro_ao_matricular[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  const lifecycle = sql.match(
    /create or replace function public\.protect_technical_enrollment_lifecycle[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";

  assert.match(
    lifecycle,
    /new\.status not in \('PENDENTE', 'ATIVO'\)/i,
  );
  assert.match(
    lifecycle,
    /transition_auth\.new_status = new\.status/i,
  );
  assert.match(
    activationTrigger,
    /ensure_technical_financial_pending\(new\.id\)/i,
  );
  assert.doesNotMatch(activationTrigger, /gerar_cobranca_matricula\(/i);
  assert.match(initializer, /status_financeiro[\s\S]*'PENDENTE'/i);
  assert.match(initializer, /titulo_matricula_id[\s\S]*null/i);
  assert.match(initializer, /gerar_cobranca_inicial = false/i);
  assert.match(initializer, /gerar_cobranca_futura = false/i);
  assert.match(initializer, /sincronizar_asaas = false/i);
  assert.match(initializer, /on conflict \(matricula_id\) do nothing/i);
  assert.match(
    initializer,
    /if exists \([\s\S]*matriculas_tecnicas_financeiro_config[\s\S]*return false/i,
  );
  assert.doesNotMatch(initializer, /insert into public\.contas_receber/i);
  assert.doesNotMatch(initializer, /status\s*=\s*'PENDENTE'/i);
});

Deno.test("RPCs públicas usam search_path vazio e grants mínimos", () => {
  const publicRpcNames = [
    "obter_pre_vinculo_aluno_tecnico_contexto_secure",
    "obter_financeiro_matricula_tecnica_workspace_secure",
    "pre_vincular_aluno_tecnico_secure",
    "ativar_financeiro_matricula_tecnica_secure",
    "ativar_financeiro_matriculas_tecnicas_lote_secure",
    "processar_ativacoes_financeiras_tecnicas_agendadas",
  ];
  for (const name of publicRpcNames) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
        "i",
      ),
    );
  }
  assert.match(
    sql,
    /processar_ativacoes_financeiras_tecnicas_agendadas\(integer\)[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /processar_ativacoes_financeiras_tecnicas_agendadas\(integer\)[\s\S]*to service_role/i,
  );
});

Deno.test("ordem de locks e campos protegidos evitam deadlock e bypass", () => {
  const prelink = sql.match(
    /create or replace function public\.pre_vincular_aluno_tecnico_secure[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  const turmaLock = prelink.indexOf(
    "from public.turmas class where class.id = p_turma_id for update",
  );
  const technicalLock = prelink.indexOf(
    "authorize_enrollment_upsert(p_aluno_id, p_turma_id, 'PENDENTE')",
  );
  const duplicateLock = prelink.indexOf(
    "assert_aluno_sem_matricula_curso_duplicada",
  );
  const enrollmentLock = prelink.indexOf(
    "where enrollment.aluno_id = p_aluno_id and enrollment.turma_id = p_turma_id\n  for update",
  );
  assert.ok(turmaLock >= 0);
  assert.ok(technicalLock > turmaLock);
  assert.ok(duplicateLock > technicalLock);
  assert.ok(enrollmentLock > duplicateLock);
  assert.match(
    prelink,
    /Aluno já vinculado\. Alterações posteriores pertencem ao módulo Financeiro/i,
  );
  assert.doesNotMatch(prelink, /on conflict \(aluno_id, turma_id\) do update/i);
  assert.doesNotMatch(prelink, /on conflict \(matricula_id\) do update/i);

  const activate = sql.match(
    /create or replace function internal_academic\.activate_technical_financial_enrollment[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  assert.match(
    activate,
    /authorize_matricula_control_update\(p_matricula_id\)/i,
  );
  assert.match(activate, /sincronizar_asaas = false/i);
});

Deno.test("contexto de Alunos não expõe valores e workspace completo exige Financeiro", () => {
  const context = sql.match(
    /create or replace function public\.obter_pre_vinculo_aluno_tecnico_contexto_secure[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  assert.match(context, /gestor_has_tab\('gestao', 'alunos'\)/i);
  assert.doesNotMatch(
    context,
    /valorMatricula|valorMensalidade|valorRematricula/i,
  );

  const workspace = sql.match(
    /create or replace function public\.obter_financeiro_matricula_tecnica_workspace_secure[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  assert.match(workspace, /gestor_has_tab\('gestao', 'financeiro'\)/i);
  assert.match(
    workspace,
    /internal_academic\.technical_financial_rule\(p_turma_id\)/i,
  );
  const canonicalRule = sql.match(
    /create or replace function internal_academic\.technical_financial_rule[\s\S]*?\$function\$;/i,
  )?.[0] ?? "";
  assert.match(canonicalRule, /'valorMatricula'/i);
});
