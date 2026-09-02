import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const suggestionSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260902024657_suggest_manual_cycle_due_from_last_boleto.sql",
    import.meta.url,
  ),
);
const previewSql = await Deno.readTextFile(
  new URL(
    "../migrations/20260902013930_expose_manual_cycle_boleto_preview_details.sql",
    import.meta.url,
  ),
);

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

Deno.test("helper preserva o dia e avança exatamente um mês com clamp", () => {
  const helper = functionBody(
    suggestionSql,
    "internal_academic.technical_manual_cycle_due_from_last_boleto",
  );

  assert.match(helper, /returns\s+date[\s\S]*?immutable[\s\S]*?strict/i);
  assert.match(
    helper,
    /public\.data_vencimento_mensal\(\s*p_last_due,\s*extract\(day from p_last_due\)::integer,\s*1\s*\)/i,
  );
  assert.doesNotMatch(helper, /current_date|now\(\)|diaBase|,\s*0\s*\)/i);
});

Deno.test("migration executa self-check real para dia comum e fim de fevereiro", () => {
  const start = suggestionSql.indexOf("do $manual_cycle_due_self_check$");
  const end = suggestionSql.indexOf(
    "$manual_cycle_due_self_check$;",
    start + 1,
  );
  assert.ok(start > suggestionSql.indexOf("begin;"));
  assert.ok(end > start);
  assert.ok(suggestionSql.indexOf("commit;") > end);
  const selfCheck = suggestionSql.slice(start, end);

  for (
    const value of [
      "2026-01-15",
      "2026-02-15",
      "2026-01-31",
      "2026-02-28",
      "2028-01-31",
      "2028-02-29",
      "2026-03-31",
      "2026-04-30",
    ]
  ) assert.ok(selfCheck.includes(`date '${value}'`), `data ausente: ${value}`);
  assert.equal(
    (selfCheck.match(/technical_manual_cycle_due_from_last_boleto\s*\(/g) ?? [])
      .length,
    4,
  );
  assert.match(selfCheck, /raise exception/i);
});

Deno.test("estado usa somente parcelas do ciclo anterior como origem", () => {
  const state = functionBody(
    suggestionSql,
    "internal_academic.technical_manual_cycle_state",
  );
  const start = state.indexOf("if v_next_cycle is not null");
  const end = state.indexOf("return jsonb_build_object", start);
  assert.ok(start >= 0 && end > start);
  const dueBlock = state.slice(start, end);

  assert.equal(
    (dueBlock.match(/select\s+max\(receivable\.data_vencimento\)/gi) ?? [])
      .length,
    2,
  );
  assert.match(
    dueBlock,
    /v_last_run\.cycle_number\s*=\s*v_previous_cycle[\s\S]*?receivable\.id\s*=\s*any\(v_last_run\.receivable_ids\)[\s\S]*?tipo_lancamento[\s\S]*?'PARCELA'[\s\S]*?parcela_numero\s+between\s+1[\s\S]*?v_last_run\.expected_installment_count/i,
  );
  assert.match(
    dueBlock,
    /receivable\.matricula_id\s*=\s*p_matricula_id[\s\S]*?tipo_lancamento[\s\S]*?'PARCELA'[\s\S]*?parcela_numero\s+between\s+1\s+and\s+v_rule_installments[\s\S]*?cicloManual'[\s\S]*?v_previous_cycle::text/i,
  );
  assert.match(
    dueBlock,
    /origem_cronograma_id\s+like[\s\S]*?'ciclo-'\s*\|\|\s*v_previous_cycle\s*\|\|\s*'-parc-%'/i,
  );
  assert.match(
    dueBlock,
    /v_previous_cycle\s*=\s*1[\s\S]*?origem_pagamento\s*=\s*'SISTEMA_ANTERIOR'/i,
  );
  assert.match(
    dueBlock,
    /technical_manual_cycle_due_from_last_boleto\(\s*v_last_due\s*\)/i,
  );
});

Deno.test("estado expõe sugestão ISO ou null sem perder API_REVIEW", () => {
  const state = functionBody(
    suggestionSql,
    "internal_academic.technical_manual_cycle_state",
  );

  assert.match(
    state,
    /'proximoCicloNumero',\s*null,\s*'primeiroVencimentoSugerido',\s*null/i,
  );
  assert.match(
    state,
    /'primeiroVencimentoSugerido',\s*pg_catalog\.to_char\(\s*v_suggested_due,\s*'YYYY-MM-DD'\s*\)/i,
  );
  assert.match(state, /gateway_submission_status\s*=\s*'API_REVIEW'/i);
  assert.match(
    state,
    /v_last_run\.item_count\s*-\s*v_emitted\s*-\s*v_review/i,
  );
  assert.match(state, /'emRevisao',\s*v_review/i);
});

Deno.test("data explícita do usuário continua soberana na prévia", () => {
  const preview = functionBody(
    previewSql,
    "internal_academic.technical_manual_cycle_preview",
  );
  const explicitStart = preview.indexOf("if p_first_due_date is not null");
  const explicitEnd = preview.indexOf("else", explicitStart);
  assert.ok(explicitStart >= 0 && explicitEnd > explicitStart);
  const explicitBranch = preview.slice(explicitStart, explicitEnd);

  assert.match(
    preview,
    /p_cycle_number\s*=\s*2\s+and\s+p_first_due_date\s+is\s+null[\s\S]*?using errcode = '22023'/i,
  );
  assert.match(explicitBranch, /v_source\s*:=\s*'INDIVIDUAL'/i);
  assert.match(explicitBranch, /v_origin_date\s*:=\s*p_first_due_date/i);
  assert.match(explicitBranch, /v_first_due\s*:=\s*p_first_due_date/i);
  assert.match(
    explicitBranch,
    /v_day\s*:=\s*extract\(day from p_first_due_date\)::integer/i,
  );
  assert.doesNotMatch(
    explicitBranch,
    /data_vencimento_mensal|primeiroVencimentoSugerido|v_suggested_due/i,
  );
  assert.match(
    preview,
    /v_first_due\s*<[\s\S]*?timezone\('America\/Maceio', now\(\)\)[\s\S]*?v_first_due[\s\S]*?>[\s\S]*?\+\s*1825/i,
  );
});

Deno.test("migration é somente leitura de negócio e respeita o teto", () => {
  assert.doesNotMatch(
    suggestionSql,
    /insert\s+into|update\s+(?:public|internal_academic)\.|delete\s+from|truncate\s+/i,
  );
  assert.doesNotMatch(suggestionSql, /https?:|extensions\.http|net\.|pg_net/i);
  assert.ok(suggestionSql.split("\n").length <= 500);
  assert.ok(previewSql.split("\n").length <= 500);
});
