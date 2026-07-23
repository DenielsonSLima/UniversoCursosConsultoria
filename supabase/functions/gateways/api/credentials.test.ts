import assert from "node:assert/strict";
import {
  isCredentialConfiguredForProvider,
  resolveMercadoPagoMerchantId,
} from "./credentials.ts";

Deno.test("Mercado Pago so fica pronto com merchantId validado", () => {
  const secrets = {
    access_token_configured: true,
    public_key_configured: true,
    webhook_secret_configured: true,
  };
  assert.equal(
    isCredentialConfiguredForProvider("mercado_pago", {
      ...secrets,
      metadata: {},
    }),
    false,
  );
  assert.equal(
    isCredentialConfiguredForProvider("mercado_pago", {
      ...secrets,
      metadata: { merchantId: "3523270816" },
    }),
    true,
  );
});

Deno.test("deriva e confere o merchantId retornado por users/me", () => {
  assert.equal(
    resolveMercadoPagoMerchantId({ id: 3523270816 }),
    "3523270816",
  );
  assert.equal(
    resolveMercadoPagoMerchantId({ id: 3523270816 }, "3523270816"),
    "3523270816",
  );
  assert.throws(
    () => resolveMercadoPagoMerchantId({ id: 3523270816 }, "999"),
    /nao pertence ao access token/i,
  );
  assert.throws(
    () => resolveMercadoPagoMerchantId({}, null),
    /sem o ID da conta vendedora/i,
  );
});
