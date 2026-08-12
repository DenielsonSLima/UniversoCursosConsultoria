import assert from "node:assert/strict";

const migrationUrl = new URL(
  "../../migrations/20260812190154_isolate_dependency_reoffer_billing.sql",
  import.meta.url,
);
const migrationSql = await Deno.readTextFile(migrationUrl);

const triggerStart = migrationSql.indexOf(
  "CREATE OR REPLACE FUNCTION internal_academic.guard_dependency_receivable_snapshot()",
);
assert.notEqual(triggerStart, -1, "trigger de isolamento da dependência ausente");
const triggerEnd = migrationSql.indexOf("\n$$;", triggerStart);
assert.notEqual(triggerEnd, -1, "fim do trigger de isolamento ausente");
const triggerSql = migrationSql.slice(triggerStart, triggerEnd + 4);

Deno.test("baixa presencial preserva boleto da disciplina, auditoria e janela de 60 dias", () => {
  assert.match(
    triggerSql,
    /upper\(coalesce\(NEW\.status, ''\)\) <> 'PAGO'[\s\S]*?upper\(coalesce\(NEW\.forma_pagamento, ''\)\) <> 'BOLETO'/,
  );
  assert.match(
    triggerSql,
    /upper\(coalesce\(NEW\.gateway_payment_method, ''\)\) <> 'BOLETO'/,
  );
  assert.match(
    triggerSql,
    /NEW\.data_pagamento > NEW\.data_vencimento \+ 60/,
  );
  assert.match(
    triggerSql,
    /FROM public\.receivable_manual_settlements settlement/,
  );
  assert.match(
    triggerSql,
    /settlement\.payment_method = upper\(NEW\.forma_pagamento\)/,
  );
  assert.match(
    triggerSql,
    /'BANESE', 'BANESE_CNAB240'[\s\S]*?NEW\.forma_pagamento, ''\)\) <> 'BOLETO'/,
  );
  assert.match(
    triggerSql,
    /NEW\.gateway_status[\s\S]*?'PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'/,
    "baixa bancária precisa de status remoto protegido, não apenas status local",
  );
});

Deno.test("RPC legada preserva encargos próprios e delega ao contrato novo", () => {
  assert.match(
    migrationSql,
    /CREATE OR REPLACE FUNCTION public\.configurar_politica_dependencia_disciplina_secure\([\s\S]*?policy\.idempotency_key = btrim\(p_idempotency_key\)[\s\S]*?policy\.codigo = 'DEPENDENCIA_DISCIPLINA'[\s\S]*?policy\.status = 'ATIVA'/,
  );
  assert.match(
    migrationSql,
    /RETURN public\.configurar_politica_dependencia_disciplina_financeira_secure\([\s\S]*?coalesce\(v_current\.desconto_pontualidade, 19\.90\)[\s\S]*?coalesce\(v_current\.juros_atraso_percentual, 1\.0000\)[\s\S]*?coalesce\(v_current\.multa_atraso_percentual, 2\.0000\)/,
  );
});

Deno.test("dependência legada só libera após evidência financeira", () => {
  assert.match(
    triggerSql,
    /OLD\.regra_financeira_dependencia_snapshot IS NULL[\s\S]*?OLD\.status[\s\S]*?NEW\.status[\s\S]*?receivable_manual_settlements[\s\S]*?NEW\.gateway_status/,
  );
  assert.match(
    triggerSql,
    /OLD\.regra_financeira_dependencia_snapshot IS NULL[\s\S]*?NEW\.regra_financeira_dependencia_snapshot IS NOT NULL[\s\S]*?snapshot retroativo/,
  );
  assert.match(
    triggerSql,
    /settlement\.created_at AT TIME ZONE 'America\/Maceio'[\s\S]*?NEW\.data_vencimento \+ 60/,
  );
});
