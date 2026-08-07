import assert from "node:assert/strict";
import {
  manualSettlementFingerprint,
  moneyToCents,
  normalizeManualSettlementRequest,
} from "./manual-settlement-money.ts";

const receivable = {
  id: "11111111-1111-4111-8111-111111111111",
  valor: "100.00",
};

const body = {
  receivableId: receivable.id,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  contaBancariaId: "33333333-3333-4333-8333-333333333333",
  dataPagamento: "2026-07-22",
  formaPagamento: "DINHEIRO",
  valorPago: "106,50",
  valorJuros: "2,00",
  valorMulta: "3,00",
  valorAcrescimo: "2,50",
  valorDesconto: "1,00",
};

Deno.test("normaliza BRL em centavos e valida a composição no servidor", () => {
  const normalized = normalizeManualSettlementRequest(
    body,
    receivable,
    new Date("2026-07-22T15:00:00Z"),
  );
  assert.deepEqual(normalized.breakdown, {
    currency: "BRL",
    principalCents: 10_000,
    interestCents: 200,
    penaltyCents: 300,
    additionCents: 250,
    discountCents: 100,
    receivedCents: 10_650,
  });
  assert.equal(moneyToCents("R$ 1.234,56", "Valor"), 123_456);
  assert.equal(moneyToCents("1.234", "Valor"), 123_400);
  assert.equal(moneyToCents("1.234.567,89", "Valor"), 123_456_789);
  assert.equal(moneyToCents("1,234,567.89", "Valor"), 123_456_789);
});

Deno.test("aceita UUID legado do PostgreSQL para a conta bancária", () => {
  const normalized = normalizeManualSettlementRequest(
    {
      ...body,
      contaBancariaId: "10110110-1101-1011-0110-110110110101",
    },
    receivable,
    new Date("2026-07-22T15:00:00Z"),
  );

  assert.equal(
    normalized.accountId,
    "10110110-1101-1011-0110-110110110101",
  );
});

Deno.test("mantém a chave idempotente estrita e rejeita conta malformada", () => {
  assert.throws(
    () =>
      normalizeManualSettlementRequest(
        { ...body, idempotencyKey: "10110110-1101-1011-0110-110110110101" },
        receivable,
        new Date("2026-07-22T15:00:00Z"),
      ),
    /Identificador idempotente inválido/i,
  );
  assert.throws(
    () =>
      normalizeManualSettlementRequest(
        { ...body, contaBancariaId: "10110110-1101-1011" },
        receivable,
        new Date("2026-07-22T15:00:00Z"),
      ),
    /Conta bancária obrigatória/i,
  );
});

Deno.test("rejeita separadores monetários ambíguos ou malformados", () => {
  for (
    const malformed of [
      "1,2,3",
      "1.2.3",
      "12,34.56",
      "12.34,56",
      "1,,00",
      "1..00",
      "1234.567",
      "0.123",
      "00.123",
      "001.234",
      "0.123.456",
      "1,",
      "1.",
      "1.234,",
      "1,234.",
    ]
  ) {
    assert.throws(
      () => moneyToCents(malformed, "Valor"),
      /separadores decimais inválidos/i,
    );
  }
});

Deno.test("rejeita símbolo vazio ou espaços fora do prefixo monetário", () => {
  assert.equal(moneyToCents("R$ 1.234,56", "Valor"), 123_456);
  for (
    const malformed of ["R$", "1R$2", "1 2", "R$ 1 234,56", "R$ R$ 1"]
  ) {
    assert.throws(
      () => moneyToCents(malformed, "Valor"),
      /formato monetário inválido/i,
    );
  }
});

Deno.test("rejeita total recebido diferente da composição", () => {
  assert.throws(
    () =>
      normalizeManualSettlementRequest(
        { ...body, valorPago: "100,00" },
        receivable,
        new Date("2026-07-22T15:00:00Z"),
      ),
    /composição informada totaliza R\$ 106,50/i,
  );
});

Deno.test("rejeita arredondamento implícito, desconto integral e data futura", () => {
  assert.throws(() => moneyToCents("1,001", "Juros"), /duas casas/i);
  assert.throws(
    () =>
      normalizeManualSettlementRequest(
        {
          ...body,
          valorPago: "1,00",
          valorJuros: "0",
          valorMulta: "0",
          valorAcrescimo: "0",
          valorDesconto: "100,00",
        },
        receivable,
        new Date("2026-07-22T15:00:00Z"),
      ),
    /desconto deve ser menor/i,
  );
  assert.throws(
    () =>
      normalizeManualSettlementRequest(
        { ...body, dataPagamento: "2026-07-23" },
        receivable,
        new Date("2026-07-22T15:00:00Z"),
      ),
    /futura/i,
  );
});

Deno.test("fingerprint é estável e muda quando um centavo muda", async () => {
  const first = normalizeManualSettlementRequest(
    body,
    receivable,
    new Date("2026-07-22T15:00:00Z"),
  );
  const same = normalizeManualSettlementRequest(
    { ...body },
    receivable,
    new Date("2026-07-22T15:00:00Z"),
  );
  const changed = {
    ...first,
    breakdown: {
      ...first.breakdown,
      interestCents: first.breakdown.interestCents + 1,
    },
  };
  assert.equal(
    await manualSettlementFingerprint(first),
    await manualSettlementFingerprint(same),
  );
  assert.notEqual(
    await manualSettlementFingerprint(first),
    await manualSettlementFingerprint(changed),
  );
});
