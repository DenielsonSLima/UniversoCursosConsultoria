import assert from "node:assert/strict";
import {
  assertProviderAdapterReady,
  assertStoredProviderAdapterReady,
  DEFAULT_BANCO_INTER_SCOPES,
  enforceProviderFixedMetadata,
  normalizeBancoInterScopes,
  normalizeBaneseEdi7Code,
} from "./config.ts";

Deno.test("mantem Mercado Pago bloqueado ate recuperar criacao ambigua", () => {
  assert.throws(
    () => assertProviderAdapterReady("mercado_pago", "CREDIT_CARD"),
    /criacao ambigua de preferencias/i,
  );
  assert.throws(
    () => assertStoredProviderAdapterReady("mercado_pago", "CREDIT_CARD"),
    /criacao ambigua de preferencias/i,
  );
  assert.throws(
    () => assertStoredProviderAdapterReady("banco_inter", "BOLETO"),
    /removido do escopo financeiro/i,
  );
  assert.throws(
    () => assertStoredProviderAdapterReady("asaas", "BOLETO"),
    /desativado para novas cobrancas/i,
  );
  assert.throws(
    () => assertStoredProviderAdapterReady("banese_card", "PIX", "sandbox"),
    /Pix Banese permanece bloqueado/i,
  );
  assert.throws(
    () =>
      assertStoredProviderAdapterReady(
        "banese_card",
        "BOLETO",
        "production",
      ),
    /sandbox/i,
  );
  assert.doesNotThrow(() =>
    assertStoredProviderAdapterReady("banese_card", "BOLETO", "sandbox")
  );
  assert.doesNotThrow(() =>
    assertStoredProviderAdapterReady("banese_card", "PIX", "production")
  );
  assert.throws(
    () => assertProviderAdapterReady("banese_card", "CREDIT_CARD", "sandbox"),
    /cartao deve usar Mercado Pago/i,
  );
  assert.throws(
    () => assertProviderAdapterReady("mercado_pago", "BOLETO", "sandbox"),
    /boleto e Pix devem usar Banese/i,
  );
});

Deno.test("usa os scopes minimos da Cobranca V3 do Banco Inter por padrao", () => {
  assert.equal(
    normalizeBancoInterScopes(undefined),
    DEFAULT_BANCO_INTER_SCOPES,
  );
  assert.equal(normalizeBancoInterScopes("  "), DEFAULT_BANCO_INTER_SCOPES);
});

Deno.test("fixa os scopes minimos mesmo com ordem e duplicatas informadas", () => {
  assert.equal(
    normalizeBancoInterScopes(
      " BOLETO-COBRANCA.READ, boleto-cobranca.write  boleto-cobranca.read ",
    ),
    DEFAULT_BANCO_INTER_SCOPES,
  );
});

Deno.test("descarta scopes excedentes fora da Cobranca V3 homologada", () => {
  assert.equal(
    normalizeBancoInterScopes(
      "boleto-cobranca.read boleto-cobranca.write pix.read webhook.write",
    ),
    DEFAULT_BANCO_INTER_SCOPES,
  );
});

Deno.test("persiste interScopes normalizado nos metadados do Banco Inter", () => {
  assert.deepEqual(
    enforceProviderFixedMetadata("banco_inter", {
      interScopes: ["boleto-cobranca.write", "boleto-cobranca.read"],
      notes: "homologacao",
    }),
    {
      interScopes: DEFAULT_BANCO_INTER_SCOPES,
      notes: "homologacao",
    },
  );
});

Deno.test("aceita somente código EDI7 Banese com 6 dígitos", () => {
  assert.equal(normalizeBaneseEdi7Code("123456"), "123456");
  assert.equal(normalizeBaneseEdi7Code(""), "");
  assert.throws(() => normalizeBaneseEdi7Code("12345"), /6 dígitos/i);
  assert.deepEqual(
    enforceProviderFixedMetadata("banese_card", {
      baneseEdi7Code: "123456",
    }).baneseEdi7Code,
    "123456",
  );
});
