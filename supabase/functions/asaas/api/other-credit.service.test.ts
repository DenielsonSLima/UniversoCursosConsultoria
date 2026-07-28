import assert from "node:assert/strict";
import {
  assertOtherCreditReplayMatches,
  buildOtherCreditPayload,
  createOtherCreditAttempt,
  normalizeOtherCreditRequest,
  type OtherCreditRoute,
  paymentOriginForProvider,
} from "./other-credit.service.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const POLO_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "55555555-5555-4555-8555-555555555555";

const gatewayRequest = () =>
  normalizeOtherCreditRequest({
    idempotencyKey: ID,
    poloId: POLO_ID,
    descricao: "Credito avulso",
    valor: 120.5,
    dataVencimento: "2026-07-30",
    clienteId: CLIENT_ID,
    categoriaFinanceiraId: CATEGORY_ID,
    mode: "GATEWAY",
    formaPagamento: "BOLETO",
  });

const baneseRoute: OtherCreditRoute = {
  providerCode: "banese_card",
  environment: "sandbox",
  paymentMethod: "BOLETO",
};

Deno.test("Outros Creditos normaliza o contrato e rejeita combinacoes inseguras", () => {
  const request = gatewayRequest();
  assert.equal(request.value, 120.5);
  assert.equal(request.paymentMethod, "BOLETO");
  assert.equal(request.clientId, CLIENT_ID);
  assert.equal(request.categoryId, CATEGORY_ID);

  assert.throws(
    () =>
      normalizeOtherCreditRequest({
        idempotencyKey: ID,
        poloId: POLO_ID,
        descricao: "Invalido",
        valor: 10,
        dataVencimento: "2026-02-31",
        mode: "GATEWAY",
        clienteId: CLIENT_ID,
        formaPagamento: "PIX",
      }),
    /Data de vencimento invalida|somente BolePix/i,
  );
  assert.throws(
    () =>
      normalizeOtherCreditRequest({
        idempotencyKey: ID,
        poloId: POLO_ID,
        descricao: "Sem parceiro",
        valor: 10,
        dataVencimento: "2026-07-30",
        mode: "GATEWAY",
        formaPagamento: "BOLETO",
      }),
    /Parceiro obrigatorio/i,
  );
  assert.throws(
    () =>
      normalizeOtherCreditRequest({
        idempotencyKey: ID,
        poloId: POLO_ID,
        descricao: "Invalido",
        valor: 10,
        dataVencimento: "2026-07-30",
        mode: "LOCAL_RECEBER",
        formaPagamento: "PIX",
      }),
    /nao deve antecipar uma forma/i,
  );
  assert.throws(
    () =>
      normalizeOtherCreditRequest({
        idempotencyKey: ID,
        poloId: POLO_ID,
        descricao: "Invalido",
        valor: 10,
        dataVencimento: "2026-07-30",
        mode: "LOCAL_RECEBER",
        categoriaFinanceiraId: "categoria-invalida",
      }),
    /Categoria financeira invalido/i,
  );
});

Deno.test("payload grava provedor, ambiente e origem da rota real", () => {
  const request = normalizeOtherCreditRequest({
    idempotencyKey: ID,
    poloId: POLO_ID,
    descricao: "Credito avulso",
    valor: 120.5,
    dataVencimento: "2026-07-30",
    clienteId: CLIENT_ID,
    mode: "GATEWAY",
    formaPagamento: "BOLETO",
  });
  const payload = buildOtherCreditPayload(request, {
    providerCode: "banese_card",
    environment: "sandbox",
    paymentMethod: "BOLETO",
  });

  assert.equal(payload.id, ID);
  assert.equal(payload.categoria_financeira_id, null);
  assert.equal(payload.gateway_provider, "banese_card");
  assert.equal(payload.gateway_environment, "sandbox");
  assert.equal(payload.origem_pagamento, "BANESE");
  assert.equal(paymentOriginForProvider("mercado_pago"), "MERCADO_PAGO");
  assert.equal(paymentOriginForProvider("banco_inter"), "BANCO_INTER");
  assert.throws(
    () =>
      buildOtherCreditPayload(request, {
        providerCode: "asaas",
        environment: "sandbox",
        paymentMethod: "BOLETO",
      }),
    /somente o Banese/i,
  );
});

Deno.test("retry reutiliza o mesmo contas_receber depois de falha do gateway", async () => {
  const rows = new Map<string, any>();
  let inserts = 0;
  let remotePosts = 0;
  let syncCalls = 0;

  const dependencies = {
    findById: async (id: string) => rows.get(id) || null,
    insert: async (payload: Record<string, unknown>) => {
      inserts += 1;
      const row = { ...payload, gateway_status: null };
      rows.set(String(payload.id), row);
      return row;
    },
    validateReferences: async () => {},
    resolveRoute: async () => baneseRoute,
    syncGateway: async (receivable: any) => {
      syncCalls += 1;
      if (!receivable.gateway_submission_status) {
        remotePosts += 1;
        receivable.gateway_status = "CREATING";
        receivable.gateway_submission_status = "API_AMBIGUOUS";
        throw new Error("resposta remota ambigua");
      }
      throw new Error("reconciliacao obrigatoria; novo POST bloqueado");
    },
  };

  await assert.rejects(
    () => createOtherCreditAttempt(gatewayRequest(), dependencies),
    /remota ambigua/i,
  );
  await assert.rejects(
    () => createOtherCreditAttempt(gatewayRequest(), dependencies),
    /novo POST bloqueado/i,
  );

  assert.equal(rows.size, 1);
  assert.equal(inserts, 1);
  assert.equal(syncCalls, 2);
  assert.equal(remotePosts, 1);
  assert.equal(rows.get(ID).id, ID);
});

Deno.test("conflito concorrente da chave recupera e valida o registro canonico", async () => {
  const request = gatewayRequest();
  const canonical = buildOtherCreditPayload(request, baneseRoute);
  let findCalls = 0;

  const result = await createOtherCreditAttempt(request, {
    findById: async () => {
      findCalls += 1;
      return findCalls === 1 ? null : canonical;
    },
    insert: async () => {
      throw { code: "23505" };
    },
    validateReferences: async () => {},
    resolveRoute: async () => baneseRoute,
    syncGateway: async (receivable) => receivable,
  });

  assert.equal(result.reused, true);
  assert.equal(result.receivable.id, ID);
});

Deno.test("mesma chave nunca aceita dados ou rota divergentes", () => {
  const request = gatewayRequest();
  const existing = buildOtherCreditPayload(request, baneseRoute);

  assert.throws(
    () =>
      assertOtherCreditReplayMatches(
        { ...existing, valor: 999 },
        request,
        baneseRoute,
      ),
    /ja pertence a outro credito/i,
  );
  assert.throws(
    () =>
      assertOtherCreditReplayMatches(existing, request, {
        ...baneseRoute,
        environment: "production",
      }),
    /ja pertence a outro credito/i,
  );
});

Deno.test("mesma chave rejeita categoria financeira divergente", () => {
  const request = gatewayRequest();
  const existing = buildOtherCreditPayload(request, baneseRoute);

  assert.throws(
    () =>
      assertOtherCreditReplayMatches(
        { ...existing, categoria_financeira_id: null },
        request,
        baneseRoute,
      ),
    /ja pertence a outro credito/i,
  );
});

Deno.test("mesma chave rejeita troca bidirecional entre gateway e conta local", () => {
  const gateway = gatewayRequest();
  const local = normalizeOtherCreditRequest({
    idempotencyKey: ID,
    poloId: POLO_ID,
    descricao: "Credito avulso",
    valor: 120.5,
    dataVencimento: "2026-07-30",
    mode: "LOCAL_RECEBER",
  });
  const gatewayRow = buildOtherCreditPayload(gateway, baneseRoute);
  const localRow = buildOtherCreditPayload(local, null);

  assert.throws(
    () => assertOtherCreditReplayMatches(gatewayRow, local, null),
    /ja pertence a outro credito/i,
  );
  assert.throws(
    () => assertOtherCreditReplayMatches(localRow, gateway, baneseRoute),
    /ja pertence a outro credito/i,
  );
});

Deno.test("mesma chave rejeita troca bidirecional entre local pago e pendente", () => {
  const paid = normalizeOtherCreditRequest({
    idempotencyKey: ID,
    poloId: POLO_ID,
    descricao: "Credito avulso",
    valor: 120.5,
    dataVencimento: "2026-07-30",
    mode: "LOCAL_PAGO",
    formaPagamento: "PIX",
    contaBancariaId: "33333333-3333-4333-8333-333333333333",
  });
  const pending = normalizeOtherCreditRequest({
    idempotencyKey: ID,
    poloId: POLO_ID,
    descricao: "Credito avulso",
    valor: 120.5,
    dataVencimento: "2026-07-30",
    mode: "LOCAL_RECEBER",
  });
  const paidRow = buildOtherCreditPayload(paid, null);
  const pendingRow = buildOtherCreditPayload(pending, null);

  assert.throws(
    () => assertOtherCreditReplayMatches(paidRow, pending, null),
    /ja pertence a outro credito/i,
  );
  assert.throws(
    () => assertOtherCreditReplayMatches(pendingRow, paid, null),
    /ja pertence a outro credito/i,
  );
});

Deno.test("replay gateway aceita evolucao remota sem aceitar baixa local", () => {
  const request = gatewayRequest();
  const gatewayRow = buildOtherCreditPayload(request, baneseRoute);

  assert.doesNotThrow(() =>
    assertOtherCreditReplayMatches(
      {
        ...gatewayRow,
        status: "PAGO",
        valor_pago: 120.5,
        data_pagamento: "2026-07-25",
        gateway_payment_id: "pay_123",
        gateway_status: "RECEIVED",
      },
      request,
      baneseRoute,
    )
  );
  assert.throws(
    () =>
      assertOtherCreditReplayMatches(
        {
          ...gatewayRow,
          status: "PAGO",
          conta_bancaria_id: "33333333-3333-4333-8333-333333333333",
          origem_pagamento: "PRESENCIAL",
        },
        request,
        baneseRoute,
      ),
    /ja pertence a outro credito/i,
  );
});
