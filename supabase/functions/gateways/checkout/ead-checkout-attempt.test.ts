import assert from "node:assert/strict";
import { bindEadCheckoutAttempt, blockedEadCheckoutResponse, issueReservedEadCheckout, parseEadCheckoutAttempt, prepareEadCheckoutAttempt } from "./ead-checkout-attempt.ts";
import { handleGatewayCheckout } from "./providers/gateway.ts";

const ids = Array.from({ length: 6 }, (_, index) => `${index + 1}${"1".repeat(7)}-1111-4111-8111-111111111111`);
const reserved = () => ({ action: "CREATE", attemptId: ids[0], matriculaId: ids[1], receivableId: ids[2],
  inscricaoId: ids[3], creationToken: ids[4], receivable: { id: ids[2], matricula_id: ids[1],
    ead_checkout_attempt_id: ids[0], gateway_status: "CREATING", gateway_creation_token: ids[4],
    valor: 99.9, data_vencimento: "2026-10-11", descricao: "Curso EAD" } });
const context = (attempt: any, rpc: (...args: any[]) => Promise<any>) => ({
  checkoutAttempt: attempt, admin: { rpc }, body: { requestId: ids[5] }, matricula: { id: ids[1] },
  aluno: { id: ids[5] }, turma: { id: ids[1] }, environment: "production",
  route: { providerCode: "banese_card" }, charge: { method: "BOLETO", value: 99.9, dueDate: "2026-10-11", description: "Curso EAD" },
}) as any;

Deno.test("reserva CREATE exige IDs próprios e token exclusivo, sem aceitar identidade histórica", () => {
  assert.equal(parseEadCheckoutAttempt(reserved()).receivableId, ids[2]);
  assert.throws(() => parseEadCheckoutAttempt({ ...reserved(), receivableId: ids[1] }), /não corresponde/);
  assert.throws(() => parseEadCheckoutAttempt({ ...reserved(), creationToken: null }), /reserva exclusiva/);
  assert.throws(() => parseEadCheckoutAttempt({ ...reserved(), action: "REUSE" }), /não autoriza outra emissão/);
});

Deno.test("aguardando confirmação e revisão retornam estado sem qualquer chamada ao banco", async () => {
  for (const action of ["AWAITING_CONFIRMATION", "REVIEW", "ALREADY_PAID"]) {
    const current = context({ ...reserved(), action, creationToken: null }, async () => { throw new Error("RPC inesperada"); });
    current.admin.from = () => { throw new Error("Consulta inesperada"); };
    const result = await handleGatewayCheckout(current);
    assert.equal(result.createdRemotePayment, false);
    assert.equal("alreadyPaid" in result.response && result.response.alreadyPaid, action === "ALREADY_PAID");
    assert.equal(blockedEadCheckoutResponse(current)?.response.awaitingConfirmation, action === "AWAITING_CONFIRMATION");
  }
});

Deno.test("pré-emissão consulta o fencing canônico e impede POST quando pagamento antigo chegou", async () => {
  let emissions = 0;
  const current = context(reserved(), async (name, payload) => {
    assert.equal(name, "ead_validate_checkout_attempt_for_issuance");
    assert.deepEqual(payload, { p_attempt_id: ids[0], p_receivable_id: ids[2], p_creation_token: ids[4] });
    return { data: { allowed: false }, error: null };
  });
  await assert.rejects(() => issueReservedEadCheckout(current, reserved().receivable,
    async () => { emissions += 1; return {}; }), /Nenhum novo boleto/);
  assert.equal(emissions, 0);
  current.admin.rpc = async () => ({ data: { allowed: true }, error: null });
  await issueReservedEadCheckout(current, reserved().receivable, async () => { emissions += 1; return {}; });
  assert.equal(emissions, 1);
});

Deno.test("preparação envia snapshot de backend e recusa recebível antigo selecionado", async () => {
  const current = context(undefined, async (name, payload) => {
    assert.equal(name, "ead_prepare_checkout_attempt");
    assert.equal(payload.p_amount, 99.9);
    assert.equal(payload.p_request_id, ids[5]);
    return { data: reserved(), error: null };
  });
  assert.equal((await prepareEadCheckoutAttempt(current)).inscricaoId, ids[3]);
  current.body.receivableId = ids[1];
  await assert.rejects(() => prepareEadCheckoutAttempt(current), /pertence ao histórico/);
});

Deno.test("pagamento antigo entre POST e bind preserva o novo título e oculta dados de pagamento", async () => {
  const current = context(reserved(), async (name, payload) => {
    assert.equal(name, "ead_bind_checkout_attempt");
    assert.equal(payload.p_transaction_id, ids[5]);
    return { data: { attemptId: ids[0], receivableId: ids[2], inscricaoId: ids[3],
      transactionId: ids[5], state: "PAYMENT_RECOVERY_FENCED" }, error: null };
  });
  const filters: any = {};
  const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    maybeSingle: async () => ({ data: { id: ids[5] }, error: null }) };
  current.admin.from = () => query;
  await bindEadCheckoutAttempt(current, { ...reserved().receivable, gateway_provider: "banese_card",
    gateway_environment: "production", gateway_payment_id: "000000099" });
  assert.equal(filters.receivable_id, ids[2]);
  const blocked = blockedEadCheckoutResponse(current);
  assert.equal(blocked?.response.paymentReviewRequired, true);
  assert.equal(blocked?.response.url.includes("000000099"), false);
  assert.equal("payment" in (blocked?.response || {}), false);
  assert.equal(current.checkoutAttempt.receivableId, ids[2]);
});
