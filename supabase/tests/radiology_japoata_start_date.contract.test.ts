import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const sql = await Deno.readTextFile(
  new URL(
    "../migrations/20260826235000_align_radiology_japoata_start_to_first_charge.sql",
    import.meta.url,
  ),
);

Deno.test("deriva o início como 30 dias antes da primeira cobrança", () => {
  assert.match(sql, /select min\(recebivel\.data_vencimento\)/i);
  assert.match(sql, /v_new_start := v_first_due - 30/i);
  assert.match(sql, /v_first_due <> date '2026-04-11'/i);
  assert.match(sql, /v_new_start <> date '2026-03-12'/i);
  assert.match(
    sql,
    /min\(recebivel\.data_vencimento\) - turma\.data_inicio[\s\S]*<> 30/i,
  );
});

Deno.test("usa identidade estável e guarda o estado atual da turma", () => {
  assert.match(sql, /turma\.codigo = '2026\.1-RAD-INT-JAP'/i);
  assert.match(sql, /turma\.data_inicio = date '2026-06-01'/i);
  assert.match(sql, /turma\.data_previsao_termino = date '2028-06-01'/i);
  assert.doesNotMatch(
    sql,
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
});

Deno.test("ajusta turma, vencimento padrão e os quatro períodos", () => {
  assert.match(sql, /set data_inicio = date '2026-03-12'/i);
  assert.match(sql, /data_previsao_termino = date '2028-03-12'/i);
  assert.match(sql, /primeiro_vencimento_padrao = date '2026-04-11'/i);
  assert.match(sql, /gerar_cobrancas_futuras = false/i);
  assert.match(sql, /sincronizar_asaas_futuro = false/i);
  assert.match(sql, /count\(\*\)[\s\S]*periodos_letivos[\s\S]*<> 4/i);
  assert.match(sql, /row_number\(\) over/i);
  assert.match(sql, /lag\(periodo\.data_fim\) over/i);
});

Deno.test("protege atividade existente e reativa todas as guardas", () => {
  for (
    const table of [
      "aulas_turma",
      "diario_frequencia",
      "diario_notas",
      "diario_praticas",
      "diario_observacoes",
      "diario_fechamento_historico",
      "diarios_validacao",
      "matricula_disciplina_tentativas",
    ]
  ) {
    assert.match(sql, new RegExp(`public\\.${table}`, "i"));
  }
  for (
    const trigger of [
      "validate_technical_class_dates_trigger",
      "sincronizar_periodos_turma_tecnica_trigger",
      "protect_technical_period_structure_trigger",
      "validate_technical_period_dates_trigger",
    ]
  ) {
    assert.match(sql, new RegExp(`disable trigger ${trigger}`, "i"));
    assert.match(sql, new RegExp(`enable trigger ${trigger}`, "i"));
  }
});
