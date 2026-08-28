import assert from "node:assert/strict";
import { confirmBaneseBoletoFinancialTerms } from "./adapter/boleto-financial-terms.ts";
import type { BaneseAccessToken } from "./adapter/types.ts";

const AMOUNT = 279.9;
const DUE_DATE = "2026-10-15";
const ENDPOINT = "https://banese.test/convenios/100649/boletos/000000139";
const TOKEN: BaneseAccessToken = {
  accessToken: "token",
  tokenType: "Bearer",
  expiresIn: null,
  scope: null,
  raw: null,
};
const PAYLOAD = {
  ValorNominal: AMOUNT,
  DataVencimento: DUE_DATE,
  Multa: { TipoMulta: 2 as const, Valor: 2, Data: "2026-10-16" },
  Juros: { TipoJuroMora: 2 as const, Valor: 1, Data: "2026-10-16" },
};
const REMOTE_WITH_DISCOUNT = {
  CodigoSituacaoBoleto: 2,
  ValorNominal: AMOUNT,
  DataVencimento: DUE_DATE,
  Desconto: [{ TipoDesconto: 1, Valor: 19.9, Data: DUE_DATE }],
  Multa: PAYLOAD.Multa,
  Juros: PAYLOAD.Juros,
};
const REMOTE_WITH_TOMBSTONE = {
  ...REMOTE_WITH_DISCOUNT,
  Desconto: [{ TipoDesconto: 0, Valor: 0, Data: DUE_DATE }],
};

Deno.test("remove desconto por tombstone, confirma por GET e fica idempotente", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; body: unknown }> = [];
  globalThis.fetch = async (_input, init) => {
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (method === "PUT") {
      return new Response(JSON.stringify({ atualizado: true }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify(REMOTE_WITH_TOMBSTONE), {
      status: 200,
    });
  };

  try {
    const confirmed = await confirmBaneseBoletoFinancialTerms({
      endpoint: ENDPOINT,
      token: TOKEN,
      payload: PAYLOAD,
      currentRaw: REMOTE_WITH_DISCOUNT,
      repairMismatch: false,
      allowDiscountRemoval: true,
    });
    assert.deepEqual(confirmed, REMOTE_WITH_TOMBSTONE);
    assert.deepEqual(calls, [
      {
        method: "PUT",
        body: {
          Desconto: [{
            TipoDesconto: 0,
            Valor: 0,
            Data: DUE_DATE,
          }],
        },
      },
      { method: "GET", body: null },
    ]);

    const repeated = await confirmBaneseBoletoFinancialTerms({
      endpoint: ENDPOINT,
      token: TOKEN,
      payload: PAYLOAD,
      currentRaw: REMOTE_WITH_TOMBSTONE,
      repairMismatch: false,
      allowDiscountRemoval: true,
    });
    assert.deepEqual(repeated, REMOTE_WITH_TOMBSTONE);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("remocao exige opt-in, status pendente, desconto unico e demais termos iguais", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(String(init?.method || "GET").toUpperCase());
    return new Response(JSON.stringify(REMOTE_WITH_TOMBSTONE), {
      status: 200,
    });
  };

  try {
    await assert.rejects(
      () =>
        confirmBaneseBoletoFinancialTerms({
          endpoint: ENDPOINT,
          token: TOKEN,
          payload: PAYLOAD,
          currentRaw: REMOTE_WITH_DISCOUNT,
          repairMismatch: false,
        }),
      /divergem do titulo solicitado/i,
    );
    await assert.rejects(
      () =>
        confirmBaneseBoletoFinancialTerms({
          endpoint: ENDPOINT,
          token: TOKEN,
          payload: PAYLOAD,
          currentRaw: {
            ...REMOTE_WITH_DISCOUNT,
            CodigoSituacaoBoleto: 1,
          },
          repairMismatch: false,
          allowDiscountRemoval: true,
        }),
      /titulo Banese pendente/i,
    );
    await assert.rejects(
      () =>
        confirmBaneseBoletoFinancialTerms({
          endpoint: ENDPOINT,
          token: TOKEN,
          payload: PAYLOAD,
          currentRaw: {
            ...REMOTE_WITH_DISCOUNT,
            Multa: { ...PAYLOAD.Multa, Valor: 3 },
          },
          repairMismatch: false,
          allowDiscountRemoval: true,
        }),
      /divergem do titulo solicitado/i,
    );
    await assert.rejects(
      () =>
        confirmBaneseBoletoFinancialTerms({
          endpoint: ENDPOINT,
          token: TOKEN,
          payload: PAYLOAD,
          currentRaw: {
            ...REMOTE_WITH_DISCOUNT,
            Desconto: [
              ...REMOTE_WITH_DISCOUNT.Desconto,
              { TipoDesconto: 0, Valor: 0, Data: DUE_DATE },
            ],
          },
          repairMismatch: false,
          allowDiscountRemoval: true,
        }),
      /divergem do titulo solicitado/i,
    );
    assert.deepEqual(calls, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("falha fechado quando GET pos-PUT ainda retorna desconto", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const method = String(init?.method || "GET").toUpperCase();
    calls.push(method);
    return new Response(
      JSON.stringify(
        method === "PUT" ? { atualizado: true } : REMOTE_WITH_DISCOUNT,
      ),
      { status: 200 },
    );
  };

  try {
    await assert.rejects(
      () =>
        confirmBaneseBoletoFinancialTerms({
          endpoint: ENDPOINT,
          token: TOKEN,
          payload: PAYLOAD,
          currentRaw: REMOTE_WITH_DISCOUNT,
          repairMismatch: false,
          allowDiscountRemoval: true,
        }),
      /divergem do titulo solicitado/i,
    );
    assert.deepEqual(calls, ["PUT", "GET"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
