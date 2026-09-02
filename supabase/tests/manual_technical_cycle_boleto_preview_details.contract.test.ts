import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const sql = await Deno.readTextFile(
  new URL(
    "../migrations/20260902013930_expose_manual_cycle_boleto_preview_details.sql",
    import.meta.url,
  ),
);

const functionBody = (qualifiedName: string) => {
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

Deno.test("prévia expõe o detalhe canônico do boleto em cada tipo", () => {
  const details = functionBody(
    "internal_academic.technical_manual_cycle_boleto_details",
  );
  const preview = functionBody(
    "internal_academic.technical_manual_cycle_preview",
  );

  assert.match(details, /technical_financial_simulation\s*\(/i);
  for (
    const field of [
      "valorNominal",
      "valorEmDia",
      "desconto",
      "valor",
      "validoAte",
      "multa",
      "percentual",
      "iniciaEm",
      "juros",
      "percentualMes",
      "valorDia",
      "instrucaoBoleto",
      "mensagensBoleto",
    ]
  ) assert.match(details, new RegExp(`'${field}'`, "i"));

  assert.match(
    details,
    /p_description\s+text[\s\S]*?p_class_code\s+text[\s\S]*?p_class_name\s+text/i,
  );
  assert.match(details, /regexp_replace\([\s\S]*?'\[\[:space:\]\]\+'/i);
  assert.match(details, /'TURMA: '\s*\|\|[\s\S]*?concat_ws/i);
  assert.match(
    details,
    /'mensagensBoleto',\s*jsonb_build_array\([\s\S]*?v_description[\s\S]*?v_instruction/i,
  );

  for (const kind of ["MATRICULA", "REMATRICULA", "MENSALIDADE"]) {
    assert.match(
      preview,
      new RegExp(
        `technical_manual_cycle_boleto_details\\([\\s\\S]*?'${kind}'`,
        "i",
      ),
    );
  }
  assert.equal(
    (preview.match(/v_description,\s*v_class\.codigo,\s*v_class\.nome/g) ?? [])
      .length,
    3,
  );
  assert.equal(
    (preview.match(/'detalhesBoleto'/g) ?? []).length,
    3,
  );
});

Deno.test("flags efetivas separam matrícula, rematrícula e mensalidade", () => {
  const details = functionBody(
    "internal_academic.technical_manual_cycle_boleto_details",
  );
  assert.match(details, /when 'MATRICULA' then 'matricula'/i);
  assert.match(details, /when 'REMATRICULA' then 'rematricula'/i);
  assert.match(details, /else 'mensalidade'/i);
  assert.match(
    details,
    /'aplicacao'\s*->\s*v_kind_key\s*->>\s*'desconto'/i,
  );
  assert.match(
    details,
    /'aplicacao'\s*->\s*v_kind_key\s*->>\s*'multaJuros'/i,
  );
  assert.match(details, /when v_apply_discount[\s\S]*?else 'null'::jsonb/i);
  assert.match(details, /when v_apply_late[\s\S]*?else 'null'::jsonb/i);
});

Deno.test("datas do boleto usam D para desconto e D+1 para encargos", () => {
  const details = functionBody(
    "internal_academic.technical_manual_cycle_boleto_details",
  );
  assert.match(details, /'validoAte',[\s\S]*?to_char\(p_due, 'YYYY-MM-DD'\)/i);
  assert.equal(
    (details.match(/to_char\(p_due \+ 1, 'YYYY-MM-DD'\)/g) ?? []).length,
    2,
  );
});

Deno.test("migration executa autoverificação transacional do contrato T42", () => {
  const selfCheckStart = sql.indexOf("do $manual_cycle_boleto_self_check$");
  const selfCheckEnd = sql.indexOf(
    "$manual_cycle_boleto_self_check$;",
    selfCheckStart + 1,
  );
  assert.ok(selfCheckStart > sql.indexOf("begin;"));
  assert.ok(selfCheckEnd > selfCheckStart);
  assert.ok(sql.indexOf("commit;") > selfCheckEnd);

  const selfCheck = sql.slice(selfCheckStart, selfCheckEnd);
  assert.equal(
    (selfCheck.match(/technical_manual_cycle_boleto_details\s*\(/g) ?? [])
      .length,
    3,
  );
  for (
    const expected of [
      "'19.90'",
      "'260.00'",
      "'5.60'",
      "'0.19'",
      "'100.00'",
      "'2.00'",
      "'0.07'",
    ]
  ) {
    assert.ok(
      selfCheck.includes(expected),
      `valor não verificado: ${expected}`,
    );
  }
  assert.match(
    selfCheck,
    /v_disabled\s*->\s*'desconto'\s+is distinct from\s+'null'::jsonb/i,
  );
  assert.match(
    selfCheck,
    /v_disabled\s*->\s*'multa'\s+is distinct from\s+'null'::jsonb/i,
  );
  assert.match(
    selfCheck,
    /v_disabled\s*->\s*'juros'\s+is distinct from\s+'null'::jsonb/i,
  );
  assert.match(
    selfCheck,
    /coalesce\(jsonb_array_length\([\s\S]*?v_monthly\s*->\s*'mensagensBoleto'[\s\S]*?\),\s*0\)\s*<>\s*3/i,
  );
});

Deno.test("mensagens reproduzem as três linhas acadêmicas e o fallback", () => {
  const details = functionBody(
    "internal_academic.technical_manual_cycle_boleto_details",
  );
  const fallback =
    "SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.";

  assert.ok(details.includes(fallback));
  assert.match(details, /'instrucaoBoleto',\s*v_instruction/i);
  assert.match(
    sql,
    /'Mensalidade 1\/12 - Ciclo 2 - ENF T-42 INT'/,
  );
  assert.match(
    sql,
    /'TURMA: ENF-T42-INT-MAT — ENF T-42 INT'/,
  );
  assert.match(sql, /'INSTRUÇÃO CONFIGURADA'/);
  assert.ok(sql.includes(`'${fallback}'`));
});

Deno.test("detalhes integram o fingerprint e a prévia não faz rede", () => {
  const preview = functionBody(
    "internal_academic.technical_manual_cycle_preview",
  );
  const detailsIndex = preview.indexOf("'detalhesBoleto'");
  const fingerprintIndex = preview.indexOf("v_schedule_fingerprint :=");
  assert.ok(detailsIndex >= 0 && detailsIndex < fingerprintIndex);
  assert.match(
    preview.slice(fingerprintIndex),
    /extensions\.digest[\s\S]*?'itens',\s*v_items/i,
  );
  assert.doesNotMatch(
    sql,
    /insert\s+into|update\s+public\.|delete\s+from|banese|gateway_|http|net\./i,
  );
});
