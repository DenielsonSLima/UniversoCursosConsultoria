import assert from "node:assert/strict";
import {
  type BaneseFinancialTermsInput,
  calculateBaneseAcceptablePaymentRange,
  formatBaneseFinancialTermsForPdf,
  mapBaneseFinancialTermsToPayload,
  normalizeBaneseFinancialTerms,
} from "./financial-terms.ts";
import { baneseFinancialTermsFromPayload } from "./financial-terms-response.ts";

const TERMS: BaneseFinancialTermsInput = {
  nominalAmount: 600,
  dueDate: "2026-08-15",
  discount: { type: "fixed", value: 50 },
  penalty: { type: "percentage", value: 2 },
  interest: { type: "monthly-percentage", value: 1 },
};

const TECHNICAL_TERMS: BaneseFinancialTermsInput = {
  nominalAmount: 279.9,
  dueDate: "2026-08-10",
  discount: { type: "fixed", value: 19.9 },
  penalty: { type: "percentage", value: 2 },
  interest: { type: "monthly-percentage", value: 1 },
};

Deno.test("normaliza datas padrao conforme as regras oficiais do Banese", () => {
  const result = normalizeBaneseFinancialTerms(TERMS);
  assert.deepEqual(result, {
    nominalAmount: 600,
    dueDate: "2026-08-15",
    discount: {
      type: "fixed",
      value: 50,
      validUntil: "2026-08-15",
    },
    penalty: {
      type: "percentage",
      value: 2,
      startsOn: "2026-08-16",
    },
    interest: {
      type: "monthly-percentage",
      value: 1,
      startsOn: "2026-08-16",
    },
  });
});

Deno.test("mapeia desconto multa e juros para o payload oficial Banese", () => {
  assert.deepEqual(mapBaneseFinancialTermsToPayload(TERMS), {
    Desconto: [{
      Data: "2026-08-15",
      Valor: 50,
      TipoDesconto: 1,
    }],
    Multa: {
      Data: "2026-08-16",
      Valor: 2,
      TipoMulta: 2,
    },
    Juros: {
      Data: "2026-08-16",
      Valor: 1,
      TipoJuroMora: 2,
    },
  });

  assert.deepEqual(
    mapBaneseFinancialTermsToPayload({
      nominalAmount: 600,
      dueDate: "2026-08-15",
      discount: {
        type: "percentage",
        value: 8.5,
        validUntil: "2026-08-10",
      },
      penalty: {
        type: "fixed",
        value: 10,
        startsOn: "2026-08-17",
      },
      interest: {
        type: "daily-fixed",
        value: 1.25,
        startsOn: "2026-08-18",
      },
    }),
    {
      Desconto: [{
        Data: "2026-08-10",
        Valor: 8.5,
        TipoDesconto: 2,
      }],
      Multa: {
        Data: "2026-08-17",
        Valor: 10,
        TipoMulta: 1,
      },
      Juros: {
        Data: "2026-08-18",
        Valor: 1.25,
        TipoJuroMora: 1,
      },
    },
  );
});

Deno.test("omite objetos financeiros ausentes do payload", () => {
  assert.deepEqual(
    mapBaneseFinancialTermsToPayload({
      nominalAmount: 600,
      dueDate: "2026-08-15",
    }),
    {},
  );
});

Deno.test("trata marcadores vazios tipo zero do Banese como termos ausentes", () => {
  assert.deepEqual(
    baneseFinancialTermsFromPayload(
      {
        Desconto: [{ TipoDesconto: 0, Data: "0001-01-01T00:00:00", Valor: 0 }],
        Multa: { TipoMulta: 0, Data: null, Valor: 0 },
        Juros: { TipoJuroMora: 0, Data: "", Valor: 0 },
      },
      99.9,
      "2026-08-15",
    ),
    {
      nominalAmount: 99.9,
      dueDate: "2026-08-15",
      discount: null,
      penalty: null,
      interest: null,
    },
  );
});

Deno.test("trata o marcador de desconto nulo real do Banese como ausente", () => {
  assert.deepEqual(
    baneseFinancialTermsFromPayload(
      {
        Desconto: [{ TipoDesconto: 0, Data: null, Valor: null }],
        Multa: { TipoMulta: 1, Data: "2026-08-21", Valor: 5 },
        Juros: { TipoJuroMora: 2, Data: "2026-08-21", Valor: 2 },
      },
      99.9,
      "2026-08-20",
    ),
    {
      nominalAmount: 99.9,
      dueDate: "2026-08-20",
      discount: null,
      penalty: { type: "fixed", value: 5, startsOn: "2026-08-21" },
      interest: {
        type: "monthly-percentage",
        value: 2,
        startsOn: "2026-08-21",
      },
    },
  );
});

Deno.test("rejeita marcador remoto invalido com conteudo financeiro", () => {
  for (
    const invalidDiscount of [
      { TipoDesconto: 0, Data: null, Valor: 10 },
      { TipoDesconto: 0, Data: "2026-08-15", Valor: 0 },
      { TipoDesconto: 0, Data: "2026-08-15", Valor: 10 },
    ]
  ) {
    assert.throws(
      () =>
        baneseFinancialTermsFromPayload(
          { Desconto: [invalidDiscount] },
          99.9,
          "2026-08-15",
        ),
      /tipo de desconto.*invalido/i,
    );
  }

  for (
    const payload of [
      { Multa: { TipoMulta: 0, Data: "", Valor: "invalido" } },
      { Desconto: { TipoDesconto: 0, Data: "", Valor: 0 } },
      { Juros: [{ TipoJuroMora: 0, Data: "", Valor: 0 }] },
      { Multa: {} },
      { Juros: {} },
      { Desconto: [{}] },
      { Juros: { TipoJuroMora: "", Data: "", Valor: "" } },
    ]
  ) {
    assert.throws(
      () => baneseFinancialTermsFromPayload(payload, 99.9, "2026-08-15"),
      /retornado pelo Banese.*invalido/i,
    );
  }
});

Deno.test("rejeita datas ISO inexistentes ou fora da relacao com vencimento", () => {
  for (const dueDate of ["2026-02-29", "2026-04-31", "0000-01-01"]) {
    assert.throws(
      () => normalizeBaneseFinancialTerms({ ...TERMS, dueDate }),
      /data de calendario valida/i,
    );
  }
  assert.throws(
    () =>
      normalizeBaneseFinancialTerms({
        ...TERMS,
        discount: {
          type: "fixed",
          value: 10,
          validUntil: "2026-08-16",
        },
      }),
    /desconto.*posterior ao vencimento/i,
  );
  for (const startsOn of ["2026-08-15", "2026-08-14"]) {
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          penalty: { type: "fixed", value: 10, startsOn },
        }),
      /multa.*posterior ao vencimento/i,
    );
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          interest: { type: "daily-fixed", value: 1, startsOn },
        }),
      /juros.*posterior ao vencimento/i,
    );
  }
  assert.throws(
    () =>
      normalizeBaneseFinancialTerms({
        ...TERMS,
        discount: {
          type: "fixed",
          value: 10,
          validUntil: "2026-08-10T10:00:00Z",
        },
      }),
    /formato YYYY-MM-DD/i,
  );
});

Deno.test("rejeita valores negativos nao finitos e inferiores a um centavo", () => {
  for (const nominalAmount of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => normalizeBaneseFinancialTerms({ ...TERMS, nominalAmount }),
      /valor nominal/i,
    );
  }
  for (const value of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, 0.001]) {
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          discount: { type: "fixed", value },
        }),
      /desconto/i,
    );
  }
});

Deno.test("rejeita desconto fixo igual ao nominal e percentuais de 100 ou mais", () => {
  assert.throws(
    () =>
      normalizeBaneseFinancialTerms({
        ...TERMS,
        discount: { type: "fixed", value: 600 },
      }),
    /desconto fixo.*menor/i,
  );
  assert.throws(
    () =>
      normalizeBaneseFinancialTerms({
        ...TERMS,
        penalty: { type: "fixed", value: 600 },
      }),
    /multa fixa.*menor/i,
  );
  for (const value of [100, 120]) {
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          discount: { type: "percentage", value },
        }),
      /percentual.*menor que 100/i,
    );
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          penalty: { type: "percentage", value },
        }),
      /percentual.*menor que 100/i,
    );
    assert.throws(
      () =>
        normalizeBaneseFinancialTerms({
          ...TERMS,
          interest: { type: "monthly-percentage", value },
        }),
      /percentual.*menor que 100/i,
    );
  }
});

Deno.test("formata os tres campos para impressao no boleto ou carne", () => {
  const formatted = formatBaneseFinancialTermsForPdf(TERMS);
  assert.equal(
    formatted.discount,
    "Desconto até o vencimento (15/08/2026): R$ 50,00",
  );
  assert.equal(
    formatted.penalty,
    "Multa a partir de 16/08/2026: 2%",
  );
  assert.equal(
    formatted.interest,
    "Juros a partir de 16/08/2026: R$ 0,20 por dia (1% ao mês proporcional aos dias)",
  );
  assert.deepEqual(formatted.lines, [
    formatted.discount,
    formatted.penalty,
    formatted.interest,
  ]);
});

Deno.test("calcula desconto e encargos conforme a data do pagamento", () => {
  const onDueDate = calculateBaneseAcceptablePaymentRange(
    TERMS,
    "2026-08-15",
  );
  assert.deepEqual(
    [
      onDueDate.minimumAmount,
      onDueDate.expectedAmount,
      onDueDate.maximumAmount,
    ],
    [550, 550, 550],
  );
  assert.equal(onDueDate.isDiscountActive, true);
  assert.equal(onDueDate.isLate, false);

  const firstLateDay = calculateBaneseAcceptablePaymentRange(
    TERMS,
    "2026-08-16",
  );
  assert.deepEqual(
    [
      firstLateDay.minimumAmount,
      firstLateDay.expectedAmount,
      firstLateDay.maximumAmount,
    ],
    [612.2, 612.2, 612.2],
  );
  assert.deepEqual(firstLateDay.breakdown, {
    nominalAmount: 600,
    discountAmount: 0,
    penaltyAmount: 12,
    interestAmount: 0.2,
    daysAfterDue: 1,
    interestAccrualDays: 1,
  });
});

Deno.test("calcula a mensalidade tecnica com multa unica e um juros proporcional por dia", () => {
  const firstLateDay = calculateBaneseAcceptablePaymentRange(
    TECHNICAL_TERMS,
    "2026-08-11",
  );
  assert.equal(firstLateDay.expectedAmount, 285.59);
  assert.deepEqual(firstLateDay.breakdown, {
    nominalAmount: 279.9,
    discountAmount: 0,
    penaltyAmount: 5.6,
    interestAmount: 0.09,
    daysAfterDue: 1,
    interestAccrualDays: 1,
  });

  const thirtyDaysLate = calculateBaneseAcceptablePaymentRange(
    TECHNICAL_TERMS,
    "2026-09-09",
  );
  assert.equal(thirtyDaysLate.expectedAmount, 288.3);
  assert.equal(thirtyDaysLate.breakdown.penaltyAmount, 5.6);
  assert.equal(thirtyDaysLate.breakdown.interestAmount, 2.8);
  assert.equal(thirtyDaysLate.breakdown.interestAccrualDays, 30);
});

Deno.test("expressa diferenca de arredondamento como faixa de um centavo", () => {
  const discounted = calculateBaneseAcceptablePaymentRange({
    nominalAmount: 99.9,
    dueDate: "2026-08-15",
    discount: { type: "percentage", value: 5 },
  }, "2026-08-15");
  assert.deepEqual(
    [
      discounted.minimumAmount,
      discounted.expectedAmount,
      discounted.maximumAmount,
    ],
    [94.9, 94.9, 94.91],
  );

  const late = calculateBaneseAcceptablePaymentRange({
    nominalAmount: 99.9,
    dueDate: "2026-08-15",
    interest: { type: "monthly-percentage", value: 1 },
  }, "2026-08-16");
  assert.deepEqual(
    [late.minimumAmount, late.expectedAmount, late.maximumAmount],
    [99.93, 99.93, 99.94],
  );
});

Deno.test("rejeita data de pagamento inexistente", () => {
  assert.throws(
    () => calculateBaneseAcceptablePaymentRange(TERMS, "2026-02-29"),
    /data de pagamento.*calendario valida/i,
  );
});
