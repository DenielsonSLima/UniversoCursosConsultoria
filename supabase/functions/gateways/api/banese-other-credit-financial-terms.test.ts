import assert from "node:assert/strict";
import { buildOtherCreditPlanBaneseFinancialTerms } from "./banese-other-credit-financial-terms.ts";
import {
  buildConfiguredBaneseFinancialTerms,
  resolveBaneseReceivableFinancialTerms,
} from "./banese-financial-terms.ts";
import { otherCreditDocumentRowAt } from "../../other-credit-carnet-document/document-fixture.ts";

Deno.test("carnê avulso envia desconto, multa e juros canônicos sem consultar turma", async () => {
  const row = otherCreditDocumentRowAt(0);
  const admin = {
    from() {
      throw new Error("Consulta acadêmica inesperada.");
    },
  };
  const expected = row.regra_financeira_outros_creditos_snapshot.financialTerms;
  assert.deepEqual(
    await resolveBaneseReceivableFinancialTerms(admin, row),
    expected,
  );
  assert.deepEqual(
    buildConfiguredBaneseFinancialTerms({
      receivable: row,
      turma: { juros_atraso: 99, desconto_pontualidade: 299 },
    }),
    expected,
  );
});

Deno.test("crédito avulso anterior sem plano mantém seu contrato", () => {
  assert.equal(
    buildOtherCreditPlanBaneseFinancialTerms({ categoria: "OUTROS_CREDITOS" }),
    null,
  );
});

Deno.test("carnê avulso falha fechado para identidade, acadêmico e condições divergentes", () => {
  const row = otherCreditDocumentRowAt(0);
  const snapshot = row.regra_financeira_outros_creditos_snapshot;
  for (
    const overrides of [
      { turma_id: "11111111-1111-4111-8111-111111111111" },
      { matricula_id: "11111111-1111-4111-8111-111111111111" },
      { origem_cronograma_id: "11111111-1111-4111-8111-111111111111" },
      { tipo_lancamento: "MATRICULA" },
      { origem_pagamento: "SISTEMA_ANTERIOR" },
      { outros_creditos_plano_id: null },
      { valor: 123 },
      { regra_financeira_outros_creditos_snapshot: { ...snapshot, versao: 2 } },
      { regra_financeira_outros_creditos_snapshot: { ...snapshot, numero: 0 } },
      {
        regra_financeira_outros_creditos_snapshot: {
          ...snapshot,
          financialTerms: {},
        },
      },
      {
        gateway_financial_terms: {
          ...row.gateway_financial_terms,
          discount: null,
        },
      },
    ]
  ) {
    assert.throws(
      () => buildOtherCreditPlanBaneseFinancialTerms({ ...row, ...overrides }),
      /snapshot financeiro incompatível/,
    );
  }
});

Deno.test("taxa financeira avulsa mantém encargos e nunca herda desconto de mensalidade", () => {
  const row = otherCreditDocumentRowAt(0);
  const snapshot = row.regra_financeira_outros_creditos_snapshot;
  const terms = { ...row.gateway_financial_terms, discount: null };
  const fee = {
    ...row,
    outros_creditos_papel: "MATRICULA",
    gateway_financial_terms: terms,
    regra_financeira_outros_creditos_snapshot: {
      ...snapshot,
      papel: "MATRICULA",
      numero: 0,
      financialTerms: terms,
    },
  };
  assert.deepEqual(buildOtherCreditPlanBaneseFinancialTerms(fee), terms);
  assert.throws(() =>
    buildOtherCreditPlanBaneseFinancialTerms({
      ...fee,
      regra_financeira_outros_creditos_snapshot: {
        ...fee.regra_financeira_outros_creditos_snapshot,
        financialTerms: row.gateway_financial_terms,
      },
    }), /snapshot financeiro incompatível/);
});
