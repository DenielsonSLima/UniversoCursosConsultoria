import assert from "node:assert/strict";
import { assertBanesePixRecoveryEligible } from "./boleto-pix-recovery-eligibility.ts";

const token = {
  accessToken: "token",
  tokenType: "Bearer",
  expiresIn: null,
  scope: null,
  raw: null,
};

const run = async (situationCode: number, payments: unknown) => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(input instanceof Request ? input.url : String(input));
    return new Response(JSON.stringify(payments), { status: 200 });
  };
  try {
    await assertBanesePixRecoveryEligible({
      raw: { CodigoSituacaoBoleto: situationCode },
      baseEndpoint:
        "https://webapi.banese.b.br/cobranca/v1/convenios/1/boletos/000097310",
      token,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(urls.length, 1);
  assert.match(urls[0], /\/pagamentos\/efetivados$/);
};

Deno.test("Pix-only aceita somente situacao 2 sem pagamento efetivado", async () => {
  await run(2, []);
});

Deno.test("Pix-only rejeita titulo com pagamento efetivado", async () => {
  await assert.rejects(
    () => run(2, [{ ValorPago: 149.9 }]),
    /pagamento efetivado/i,
  );
});

Deno.test("Pix-only rejeita situacao terminal mesmo sem pagamento", async () => {
  await assert.rejects(() => run(5, []), /situacao 2\/PENDING/i);
});
