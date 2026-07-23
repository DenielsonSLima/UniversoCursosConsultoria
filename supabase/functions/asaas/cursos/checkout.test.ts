import assert from "node:assert/strict";
import { resolveOnlineCharge } from "./checkout.ts";

const modalidades = ["TECNICO", "LIVRE", "ESPECIALIZACAO"] as const;

const courseFor = (modalidade: typeof modalidades[number]) => ({
  nome: `Curso ${modalidade}`,
  modalidade,
  valor: 500,
  financeiro_config: {
    parcelasPadrao: 1,
    metodosRecebimento: { pix: false, boleto: true, cartao: false },
    cartao: { aceitar: false, maxParcelas: 1 },
  },
});

const turma = {
  valor_matricula: 300,
  valor_parcela: 200,
  desconto_pontualidade: 25,
  juros_atraso: 2,
  multa_atraso: 10,
  aplicar_desconto_matricula: true,
  aplicar_multa_juros_matricula: true,
};

for (const modalidade of modalidades) {
  Deno.test(`${modalidade} usa valor e termos individuais da matricula`, () => {
    const charge = resolveOnlineCharge(
      courseFor(modalidade),
      turma,
      "2026-08-10",
      {
        payment: { method: "BOLETO" },
        matricula: {
          valor_matricula_individual: 275.5,
          desconto_pontualidade_individual: 12.25,
          juros_atraso_individual: 1.5,
          multa_atraso_individual: 7.75,
        },
      },
    );

    assert.equal(charge.value, 275.5);
    assert.deepEqual(charge.discount, {
      value: 12.25,
      dueDateLimitDays: 0,
      type: "FIXED",
    });
    assert.deepEqual(charge.interest, { value: 1.5 });
    assert.deepEqual(charge.fine, { value: 7.75, type: "FIXED" });
  });

  Deno.test(`${modalidade} trata zero individual como explicito e nao como fallback`, () => {
    assert.throws(
      () =>
        resolveOnlineCharge(
          courseFor(modalidade),
          turma,
          "2026-08-10",
          {
            payment: { method: "BOLETO" },
            matricula: { valor_matricula_individual: 0 },
          },
        ),
      /configurado como zero/i,
    );

    const noCharges = resolveOnlineCharge(
      courseFor(modalidade),
      turma,
      "2026-08-10",
      {
        payment: { method: "BOLETO" },
        matricula: {
          valor_matricula_individual: null,
          desconto_pontualidade_individual: 0,
          juros_atraso_individual: 0,
          multa_atraso_individual: 0,
        },
      },
    );
    assert.equal(noCharges.value, 300);
    assert.equal(noCharges.discount, null);
    assert.equal(noCharges.interest, null);
    assert.equal(noCharges.fine, null);
  });
}

Deno.test("checkout nao troca zero da turma pelo valor do curso", () => {
  assert.throws(
    () =>
      resolveOnlineCharge(
        courseFor("TECNICO"),
        { ...turma, valor_matricula: 0 },
        "2026-08-10",
        { payment: { method: "BOLETO" } },
      ),
    /configurado como zero/i,
  );
});

Deno.test("checkout falha fechado para termos individuais invalidos", () => {
  assert.throws(
    () =>
      resolveOnlineCharge(
        courseFor("LIVRE"),
        turma,
        "2026-08-10",
        {
          payment: { method: "BOLETO" },
          matricula: { juros_atraso_individual: 101 },
        },
      ),
    /excede o limite permitido/i,
  );
});
