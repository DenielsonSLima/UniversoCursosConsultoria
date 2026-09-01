import assert from "node:assert/strict";
import { persistBaneseRecoveredPix } from "./banese-pix-persistence.ts";

Deno.test("Pix-only usa RPC v2 com CAS do estado pagavel", async () => {
  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};
  const persistedAt = "2026-08-31T22:00:00.000Z";
  const receivable: Record<string, unknown> = {
    id: "22222222-2222-4222-8222-222222222222",
    status: "PENDENTE",
    valor: 99.9,
    data_vencimento: "2026-09-07",
    updated_at: "2026-08-31T21:59:00.000Z",
    gateway_status: "PENDING",
    gateway_last_error: null,
    gateway_financial_terms: {
      nominalAmount: 99.9,
      dueDate: "2026-09-07",
    },
    gateway_financial_terms_confirmed_at: "2026-08-31T21:00:00.000Z",
  };
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      rpcArgs = args;
      return Promise.resolve({
        data: { persisted: true, persistedAt },
        error: null,
      });
    },
  };

  await persistBaneseRecoveredPix(admin, {
    receivable,
    environment: "production",
    convenio: "15261",
    bankNumbers: {
      digitableLine: "0".repeat(47),
      barcode: "0".repeat(44),
      replacePersistedBankNumbers: false,
    },
    snapshot: {
      nossoNumero: "000097302",
      pixPayload: "0".repeat(60),
      pixEncodedImage: "data:image/png;base64," + "A".repeat(40),
      raw: {},
    },
    requirePayableStateCas: true,
  });

  assert.equal(rpcName, "persist_banese_recovered_pix_v2");
  assert.equal(
    rpcArgs.p_expected_updated_at,
    "2026-08-31T21:59:00.000Z",
  );
  assert.equal(rpcArgs.p_expected_status, "PENDENTE");
  assert.equal(rpcArgs.p_expected_gateway_status, "PENDING");
  assert.deepEqual(
    rpcArgs.p_expected_financial_terms,
    receivable.gateway_financial_terms,
  );
});
