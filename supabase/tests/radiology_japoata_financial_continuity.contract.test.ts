import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const sql = await Deno.readTextFile(
  new URL(
    "../migrations/20260827011210_correct_radiology_japoata_financial_continuity.sql",
    import.meta.url,
  ),
);

Deno.test("guarda a identidade e o estado financeiro observado", () => {
  assert.match(sql, /codigo = '2026\.1-RAD-INT-JAP'/i);
  assert.match(sql, /status is distinct from 'EM_ANDAMENTO'/i);
  assert.match(sql, /origem_financeira is distinct from 'LEGADO'/i);
  assert.match(sql, /regra_financeira_revisao is distinct from 4/i);
  assert.match(
    sql,
    /70bc7c53a094c98d81d1257a704259f1fbf3cc19d0906b97f7d81f64fe6cb970/i,
  );
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});

Deno.test("corrige matricula, rematricula e continuidade da turma", () => {
  assert.match(sql, /set cobrar_matricula = true/i);
  assert.match(sql, /valor_matricula = 200\.00/i);
  assert.match(sql, /cobrar_rematricula = true/i);
  assert.match(sql, /valor_rematricula = 200\.00/i);
  assert.match(sql, /gerar_cobrancas_futuras = true/i);
  assert.match(sql, /aplicar_desconto_rematricula = false/i);
  assert.match(sql, /aplicar_multa_juros_rematricula = true/i);
  assert.match(sql, /APOS_REMATRICULA/i);
  assert.match(sql, /maxCiclos.*::integer\s+is distinct from 2/is);
  assert.match(
    sql,
    /256ebb50613a830ba43dbd15065102e5e140a251f6f83ba6a79e37377a86f0b8/i,
  );
  assert.match(
    sql,
    /jsonb_array_length\(v_turma\.cronograma_financeiro\) is distinct from 14/i,
  );
  assert.match(
    sql,
    /jsonb_array_length\(v_rule_after -> 'cronogramaCiclo'\)\s+is distinct from 14/i,
  );
});

Deno.test("preserva os 338 titulos e as 27 condicoes individuais", () => {
  assert.match(sql, /v_title_count is distinct from 338/i);
  assert.match(sql, /v_parcel_count is distinct from 312/i);
  assert.match(sql, /v_enrollment_fee_count is distinct from 26/i);
  assert.match(sql, /v_banese_count is distinct from 312/i);
  assert.match(sql, /v_enrollment_count is distinct from 27/i);
  assert.match(sql, /v_override_count is distinct from 26/i);
  assert.match(sql, /v_effective_rule_count is distinct from 24/i);
  assert.match(sql, /v_titles_after is distinct from v_titles_before/i);
  assert.match(sql, /v_enrollments_after is distinct from v_enrollments_before/i);
  assert.match(sql, /v_configs_after is distinct from v_configs_before/i);
});

Deno.test("serializa baixas e bloqueia rematricula perdida", () => {
  assert.match(sql, /set transaction isolation level serializable/i);
  assert.match(sql, /from public\.contas_receber conta[\s\S]*for update/i);
  assert.match(sql, /from public\.matriculas matricula[\s\S]*for update/i);
  assert.match(sql, /for update of config/i);
  assert.match(sql, /conta\.status = 'PAGO'/i);
  assert.match(sql, /conta\.origem_cronograma_id = 'ciclo-1-rematricula'/i);
  assert.match(sql, /Ha aluno com 12\/12 pagas e sem rematricula/i);
});

Deno.test("mantem Asaas desligado na turma, matriculas e titulos", () => {
  assert.match(sql, /sincronizar_asaas_futuro is distinct from false/i);
  assert.match(sql, /matricula\.sincronizar_asaas is false/i);
  assert.match(sql, /gateway_provider = 'asaas'/i);
  assert.match(sql, /asaas_payment_id is not null/i);
  assert.match(sql, /asaas_installment_id is not null/i);
  assert.match(sql, /asaas_payment_link_id is not null/i);
  assert.match(sql, /v_enrollment_asaas_disabled_count is distinct from 27/i);
});

Deno.test("nao gera, reemite nem altera cobrancas existentes", () => {
  assert.doesNotMatch(sql, /update\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.contas_receber/i);
  assert.doesNotMatch(sql, /gerar_parcelas_matricula\s*\(/i);
  assert.doesNotMatch(sql, /gerar_rematricula_apos_parcelas\s*\(/i);
  assert.match(sql, /gateway_provider = 'banese_card'/i);
  assert.match(sql, /gateway_submission_status = 'API_REGISTERED'/i);
});

Deno.test("registra a correcao no historico financeiro", () => {
  assert.match(sql, /insert into public\.historico_turma_financeira/i);
  assert.match(sql, /'REGRA_TECNICA_ATUALIZADA'/i);
  assert.match(sql, /v_history_count \+ 1/i);
});
