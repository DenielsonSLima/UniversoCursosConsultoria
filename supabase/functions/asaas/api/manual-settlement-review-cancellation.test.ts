import assert from "node:assert/strict";
import { settleReceivableManually } from "./manual-settlement.service.ts";
import {
  manualSettlementFingerprint,
  normalizeManualSettlementRequest,
} from "./manual-settlement-money.ts";

Deno.test("chave encerrada por revisão nunca retoma nem reaplica conta anterior", async () => {
  const receivable = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "PENDENTE",
    valor: 279.9,
  };
  const body = {
    receivableId: receivable.id,
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    contaBancariaId: "33333333-3333-4333-8333-333333333333",
    dataPagamento: "2026-09-12",
    formaPagamento: "PIX",
    valorPago: "260,00",
    valorDesconto: "19,90",
    valorJuros: "0",
    valorMulta: "0",
    valorAcrescimo: "0",
  };
  const now = new Date("2026-09-16T15:00:00Z");
  const request = normalizeManualSettlementRequest(body, receivable, now);
  const fingerprint = await manualSettlementFingerprint(request);
  let mutationCalls = 0;
  const unexpected = () => {
    mutationCalls++;
    throw new Error("mutação proibida");
  };
  await assert.rejects(() =>
    settleReceivableManually({
      admin: {},
      actor: { id: "actor" },
      body,
      now: () => now,
      requirePoloAccess: () => {},
      repository: {
        getReceivable: async () => receivable,
        getAttemptByIdempotencyKey: async () => ({
          actor_id: "actor",
          receivable_id: receivable.id,
          request_fingerprint: fingerprint,
          state: "CANCELED_AFTER_REVIEW",
          lease_token: null,
          lease_expires_at: null,
        }),
        claimAttempt: unexpected,
        createAttempt: unexpected,
        markRemoteReady: unexpected,
        finalize: unexpected,
        appendEvent: unexpected,
      },
      cancelBanese: unexpected,
    } as any), /tentativa já foi encerrada.*nova baixa/i);
  assert.equal(mutationCalls, 0);
});
