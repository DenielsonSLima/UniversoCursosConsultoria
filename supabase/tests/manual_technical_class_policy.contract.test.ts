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
const workspaceSql = await Deno.readTextFile(new URL(
  "../migrations/20260901120300_project_manual_cycle_in_technical_workspace.sql",
  import.meta.url,
));

const functionBody = (sql: string, qualifiedName: string) => {
  const marker = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${
      qualifiedName.replaceAll(".", "\\.")
    }\\s*\\(`,
    "i",
  );
  const match = marker.exec(sql);
  assert.ok(match, `função ausente: ${qualifiedName}`);
  const end = sql.indexOf("$function$;", match.index);
  assert.ok(end > match.index, `fim ausente: ${qualifiedName}`);
  return sql.slice(match.index, end + "$function$;".length);
};

Deno.test("policy técnica aceita somente os três estados estruturais e dois ciclos", () => {
  assert.match(
    policySql,
    /initial_state in\s*\([\s\S]*?'NOVA'[\s\S]*?'IMPORTADA_CICLO_1'[\s\S]*?'IMPORTADA_CONCLUIDA'/i,
  );
  assert.match(policySql, /baseline_cycle in \(0, 1, 2\)/i);
  assert.match(policySql, /max_cycle = 2/i);
  assert.match(policySql, /cycle_number in \(1, 2\)/i);
  assert.doesNotMatch(policySql, /cycle_number[^\n]*3|baseline_cycle[^\n]*3/i);
});

Deno.test("criação técnica exige contrato manual e persiste policy atomicamente", () => {
  const createClass = functionBody(
    workspaceSql,
    "public.criar_turma_tecnica_com_codigo_condicao_secure",
  );
  for (const field of [
    "ciclo_financeiro_tecnico",
    "estadoInicial",
    "baselineCycle",
    "maxCycle",
    "eligibilityRule",
  ]) assert.match(createClass, new RegExp(field, "i"));
  assert.match(createClass, /upper\(coalesce\(v_contract ->> 'modo', ''\)\) <> 'MANUAL'/i);
  assert.match(createClass, /v_initial_state = 'NOVA' and v_baseline <> 0/i);
  assert.match(createClass, /v_initial_state = 'IMPORTADA_CICLO_1' and v_baseline <> 1/i);
  assert.match(createClass, /v_initial_state = 'IMPORTADA_CONCLUIDA' and v_baseline <> 2/i);
  assert.match(createClass, /\{gerar_cobrancas_futuras\}[\s\S]*?'false'::jsonb/i);
  assert.match(createClass, /\{sincronizar_asaas_futuro\}[\s\S]*?'false'::jsonb/i);
  assert.match(
    createClass,
    /v_initial_state = 'IMPORTADA_CONCLUIDA'[\s\S]*?v_start_date is null[\s\S]*?datas históricas, nunca futuras/i,
  );
  assert.match(
    createClass,
    /v_initial_state = 'IMPORTADA_CONCLUIDA'[\s\S]*?v_first_due_date is null[\s\S]*?\{primeiro_vencimento_padrao\}[\s\S]*?to_jsonb\(v_start_date::text\)/i,
  );
  const createIndex = createClass.indexOf(
    "create_technical_class_legacy_manual_policy",
  );
  const policyIndex = createClass.indexOf(
    "insert into internal_academic.technical_manual_cycle_policies",
  );
  assert.ok(createIndex >= 0 && policyIndex > createIndex);
  assert.match(createClass, /on conflict \(turma_id\) do nothing/i);
  assert.match(createClass, /using errcode = '40001'/i);
  assert.match(createClass, /security definer[\s\S]*?set search_path = ''/i);
});

Deno.test("policy é projetada em turma vazia e no contexto acadêmico", () => {
  const projection = functionBody(
    policySql,
    "internal_academic.technical_manual_cycle_policy_projection",
  );
  for (const field of [
    "habilitado",
    "modo",
    "estadoInicial",
    "cicloBaseHistorico",
    "cicloMaximo",
    "criterioElegibilidade",
    "revisao",
    "fingerprint",
  ]) assert.match(projection, new RegExp(`'${field}'`, "i"));
  assert.match(
    projection,
    /'modo',\s*policy\.generation_mode[\s\S]*?'estadoInicial',\s*policy\.initial_state[\s\S]*?'cicloBaseHistorico',\s*policy\.baseline_cycle/i,
  );

  const workspace = functionBody(
    workspaceSql,
    "public.obter_financeiro_matricula_tecnica_workspace_secure",
  );
  assert.match(
    workspace,
    /'cicloFinanceiroTecnico'[\s\S]*?technical_manual_cycle_policy_projection\(v_turma\.id\)/i,
  );
  const prelink = functionBody(
    workspaceSql,
    "public.obter_pre_vinculo_aluno_tecnico_contexto_secure",
  );
  assert.match(prelink, /get_technical_prelink_context_legacy_manual_policy/i);
  assert.match(
    prelink,
    /\{turma,cicloFinanceiroTecnico\}[\s\S]*?technical_manual_cycle_policy_projection\(p_turma_id\)/i,
  );
});

Deno.test("importada concluída não oferece CTA no estado canônico", () => {
  const state = functionBody(
    stateSql,
    "internal_academic.technical_manual_cycle_state",
  );
  assert.match(
    state,
    /v_last_run\.matricula_id is null[\s\S]*?v_policy\.baseline_cycle >= v_policy\.max_cycle[\s\S]*?v_state := 'CICLOS_CONCLUIDOS'[\s\S]*?v_next_cycle := null/i,
  );
});

Deno.test("T42 protege os 13 títulos por evidência estrutural sem PII", () => {
  assert.match(policySql, /class\.codigo = 'ENF-T42-INT-MAT'/i);
  assert.match(policySql, /if v_turma_count = 0 then\s*return;/i);
  assert.match(policySql, /v_turma_count > 1[\s\S]*?não é único/i);
  assert.match(policySql, /'PROTECTED_EXISTING'/i);
  assert.match(policySql, /tipo_lancamento[\s\S]*?'REMATRICULA'/i);
  assert.match(policySql, /tipo_lancamento[\s\S]*?'PARCELA'/i);
  assert.match(policySql, /regra_financeira_tecnica_snapshot[\s\S]*?cicloNumero/i);
  assert.match(policySql, /array_agg\(receivable\.id/i);
  assert.match(policySql, /having count\(\*\) = 13/i);
  assert.match(policySql, /tipo_lancamento[\s\S]*?'REMATRICULA'[\s\S]*?\) = 1/i);
  assert.match(policySql, /tipo_lancamento[\s\S]*?'PARCELA'[\s\S]*?\) = 12/i);
  assert.doesNotMatch(
    [policySql, stateSql, workspaceSql].join("\n"),
    /Adenize|cpf_cnpj|email|telefone/i,
  );
  assert.doesNotMatch(policySql, /update\s+public\.contas_receber/i);
  assert.doesNotMatch(policySql, /delete\s+from\s+public\.contas_receber/i);
});
