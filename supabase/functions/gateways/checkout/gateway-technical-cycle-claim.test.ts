import assert from "node:assert/strict";
import { claimExistingGatewayCheckout } from "./gateway-creation-fence.ts";

const REQUEST = "11111111-1111-4111-8111-111111111111";
const ATTEMPT = "22222222-2222-4222-8222-222222222222";
const cycleSnapshot = { cicloManual: { requestId: REQUEST, cicloNumero: 1 } };

const scenario = (snapshot: unknown) => {
  let updates = 0;
  let patch: Record<string, unknown> = {};
  const row = {
    id: "33333333-3333-4333-8333-333333333333",
    status: "PENDENTE", regra_financeira_tecnica_snapshot: snapshot,
  };
  const query = {
    update(value: Record<string, unknown>) { updates += 1; patch = value; return query; },
    eq: () => query, in: () => query, or: () => query, is: () => query,
    select: () => query,
    maybeSingle: () => Promise.resolve({ data: { ...row, ...patch }, error: null }),
  };
  return {
    input: {
      admin: { from: () => query }, receivable: row, receivablePayload: {},
      providerCode: "banese_card" as const, attemptToken: ATTEMPT,
    },
    updates: () => updates,
  };
};

Deno.test("envio genérico de ciclo é recusado antes do claim bancário", async () => {
  const test = scenario(cycleSnapshot);
  await assert.rejects(() => claimExistingGatewayCheckout(test.input), {
    code: "TECHNICAL_CYCLE_ISSUANCE_REQUIRED",
  });
  assert.equal(test.updates(), 0);
});

Deno.test("emissor e worker preservam o requestId do ciclo no primeiro claim", async () => {
  const test = scenario(cycleSnapshot);
  const result = await claimExistingGatewayCheckout({
    ...test.input, technicalCycleRequestId: REQUEST,
  });
  assert.equal(test.updates(), 1);
  assert.equal(result.gateway_creation_token, ATTEMPT);
  assert.equal(result.regra_financeira_tecnica_snapshot.cicloManual.requestId, REQUEST);
});

Deno.test("contexto de outro ciclo ou snapshot incompleto não autoriza emissão", async () => {
  for (const snapshot of [cycleSnapshot, { cicloManual: {} }, { cicloManual: null }]) {
    const test = scenario(snapshot);
    await assert.rejects(() => claimExistingGatewayCheckout({
      ...test.input, technicalCycleRequestId: ATTEMPT,
    }), /Retomar emissão na turma/);
    assert.equal(test.updates(), 0);
  }
});

Deno.test("contexto canônico não converte matrícula LOCAL em boleto", async () => {
  const test = scenario({ ...cycleSnapshot, destinoCobranca: "LOCAL" });
  await assert.rejects(() => claimExistingGatewayCheckout({
    ...test.input, technicalCycleRequestId: REQUEST,
  }), /matrícula local sem boleto/);
  assert.equal(test.updates(), 0);
});

Deno.test("cobrança fora de ciclo conserva o claim genérico existente", async () => {
  for (const snapshot of [null, { origem: "TURMA", versao: 2 }]) {
    const test = scenario(snapshot);
    const result = await claimExistingGatewayCheckout(test.input);
    assert.equal(result.gateway_creation_token, ATTEMPT);
    assert.equal(test.updates(), 1);
  }
});

Deno.test("retomada ambígua continua sem novo claim mesmo com contexto válido", async () => {
  const test = scenario(cycleSnapshot);
  const result = await claimExistingGatewayCheckout({
    ...test.input, technicalCycleRequestId: REQUEST,
    receivable: { ...test.input.receivable, gateway_submission_status: "API_AMBIGUOUS" },
  });
  assert.equal(result, null);
  assert.equal(test.updates(), 0);
});
