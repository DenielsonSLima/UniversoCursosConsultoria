import assert from "node:assert/strict";
import { buildConfiguredBaneseFinancialTerms } from "./banese-financial-terms.ts";

const receivable = {
  valor: 279.9,
  data_vencimento: "2026-08-10",
  tipo_lancamento: "PARCELA",
};

const turma = {
  desconto_pontualidade: 19.9,
  juros_atraso: 5,
  multa_atraso: 5,
  aplicar_desconto_mensalidade: true,
  aplicar_multa_juros_mensalidade: true,
};

Deno.test("resolve os termos mensais configurados para o Banese", () => {
  const result = buildConfiguredBaneseFinancialTerms({ receivable, turma });
  assert.deepEqual(result, {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 5 },
    penalty: { type: "fixed", value: 5 },
  });
});

Deno.test("override individual zero desativa cada termo", () => {
  const result = buildConfiguredBaneseFinancialTerms({
    receivable,
    turma,
    matricula: {
      desconto_pontualidade_individual: 0,
      juros_atraso_individual: 0,
      multa_atraso_individual: 0,
    },
  });
  assert.equal(result.discount, null);
  assert.equal(result.interest, null);
  assert.equal(result.penalty, null);
});

Deno.test("respeita flags por tipo de lancamento", () => {
  const disabled = buildConfiguredBaneseFinancialTerms({
    receivable: { ...receivable, tipo_lancamento: "MATRICULA" },
    turma: {
      ...turma,
      aplicar_desconto_matricula: false,
      aplicar_multa_juros_matricula: false,
    },
  });
  assert.equal(disabled.discount, null);
  assert.equal(disabled.interest, null);
  assert.equal(disabled.penalty, null);
});
