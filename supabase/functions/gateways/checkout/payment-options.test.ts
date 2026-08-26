import assert from "node:assert/strict";
import {
  echoCheckoutPresentation,
  PaymentCheckoutHttpError,
  resolveStudentEadPaymentOptions,
  validateCheckoutPresentation,
} from "./payment-options.ts";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const ALUNO_ID = "22222222-2222-4222-8222-222222222222";
const RECEIVABLE_ID = "33333333-3333-4333-8333-333333333333";
const MATRICULA_ID = "44444444-4444-4444-8444-444444444444";
const TURMA_ID = "55555555-5555-4555-8555-555555555555";
const COURSE_ID = "66666666-6666-4666-8666-666666666666";
const BANESE_CREDENTIAL_ID = "77777777-7777-4777-8777-777777777777";
const CARD_CREDENTIAL_ID = "88888888-8888-4888-8888-888888888888";

type QueryFilter = (row: Record<string, any>) => boolean;

const createAdmin = ({
  ownerId = ALUNO_ID,
  pixEnabled = true,
  boletoEnabled = true,
  routeCredentialId = BANESE_CREDENTIAL_ID,
  courseValue = 99.9,
  receivableValue = 89.9,
  receivableStatus = "PENDENTE",
  paidAt = null,
}: {
  ownerId?: string;
  pixEnabled?: boolean;
  boletoEnabled?: boolean;
  routeCredentialId?: string;
  courseValue?: number;
  receivableValue?: number;
  receivableStatus?: string;
  paidAt?: string | null;
} = {}) => {
  const queriedRouteMethods: string[] = [];
  const rows: Record<string, Array<Record<string, any>>> = {
    parceiros: [{ id: ALUNO_ID, tipo: "Aluno", auth_user_id: AUTH_USER_ID }],
    contas_receber: [{
      id: RECEIVABLE_ID,
      cliente_id: ownerId,
      matricula_id: MATRICULA_ID,
      turma_id: TURMA_ID,
      tipo_lancamento: "MATRICULA",
      status: receivableStatus,
      data_pagamento: paidAt,
      valor: receivableValue,
      data_vencimento: "2026-08-30",
      descricao: "Inscricao EAD contratada",
    }],
    matriculas: [{ id: MATRICULA_ID, aluno_id: ALUNO_ID, turma_id: TURMA_ID }],
    turmas: [{ id: TURMA_ID, curso_id: COURSE_ID }],
    cursos: [{
      id: COURSE_ID,
      nome: "Curso EAD",
      modalidade: "EAD",
      valor: courseValue,
      publicar_site: true,
      status: "ativo",
      financeiro_config: {
        metodosRecebimento: {
          pix: pixEnabled,
          boleto: boletoEnabled,
          cartao: true,
        },
        cartao: { aceitar: true, maxParcelas: 12 },
      },
    }],
    payment_gateway_runtime_config: [{
      id: true,
      enabled: true,
      active_environment: "production",
    }],
    payment_gateway_routes: [{
      modalidade: "EAD",
      payment_method: "BOLETO",
      provider_code: "banese_card",
      credential_id: routeCredentialId,
      environment: "production",
      enabled: true,
    }, {
      modalidade: "EAD",
      payment_method: "CREDIT_CARD",
      provider_code: "mercado_pago",
      credential_id: CARD_CREDENTIAL_ID,
      environment: "production",
      enabled: true,
    }],
    payment_gateway_credentials: [{
      id: BANESE_CREDENTIAL_ID,
      provider_code: "banese_card",
      environment: "production",
      client_id_configured: true,
      client_secret_configured: true,
      metadata: { baneseBoletoConvenio: "15261", baneseAgencia: "001" },
    }, {
      id: CARD_CREDENTIAL_ID,
      provider_code: "mercado_pago",
      environment: "production",
      access_token_configured: true,
      public_key_configured: true,
      webhook_secret_configured: true,
      metadata: { merchantId: "merchant" },
    }],
  };

  const from = (table: string) => {
    const filters: QueryFilter[] = [];
    const query: any = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        if (table === "payment_gateway_routes" && field === "payment_method") {
          queriedRouteMethods.push(String(value));
        }
        filters.push((row) => row[field] === value);
        return query;
      },
      neq: (field: string, value: unknown) => {
        filters.push((row) => row[field] !== value);
        return query;
      },
      maybeSingle: async () => {
        const filtered = (rows[table] || []).filter((row) =>
          filters.every((filter) => filter(row))
        );
        return { data: filtered[0] || null, error: null };
      },
      order: async () => ({
        data: (rows[table] || []).filter((row) =>
          filters.every((filter) => filter(row))
        ),
        error: null,
      }),
    };
    return query;
  };

  return {
    admin: {
      from,
      auth: {
        getUser: async () => ({
          data: { user: { id: AUTH_USER_ID } },
          error: null,
        }),
      },
    },
    queriedRouteMethods,
  };
};

const buildRuntime = (options: {
  ownerId?: string;
  pixEnabled?: boolean;
  boletoEnabled?: boolean;
  routeCredentialId?: string;
  courseValue?: number;
  receivableValue?: number;
  receivableStatus?: string;
  paidAt?: string | null;
} = {}) => {
  const fixture = createAdmin(options);
  return {
    ...fixture,
    runtime: {
      admin: fixture.admin,
      req: new Request("https://example.com/functions/v1/payment-checkout", {
        method: "POST",
        headers: { Authorization: "Bearer student-token" },
      }),
      body: { action: "payment-options", receivableId: RECEIVABLE_ID },
    },
  };
};

Deno.test("opcoes do aluno transformam o boleto Banese em duas apresentacoes BolePix", async () => {
  const { runtime, queriedRouteMethods } = buildRuntime();
  const result = await resolveStudentEadPaymentOptions(runtime as any);

  assert.deepEqual(result, {
    success: true,
    modalidade: "EAD",
    options: [{
      id: "PIX",
      label: "Pix",
      checkoutMethod: "BOLETO",
      presentation: "PIX",
    }, {
      id: "BOLETO",
      label: "Boleto com Pix",
      checkoutMethod: "BOLETO",
      presentation: "BOLETO",
    }],
  });
  assert.deepEqual(queriedRouteMethods, ["BOLETO", "CREDIT_CARD"]);
  assert.doesNotMatch(JSON.stringify(result), /credential|providerCode/i);
});

Deno.test("consulta de opcoes falha fechada para titulo de outro aluno", async () => {
  const { runtime, queriedRouteMethods } = buildRuntime({
    ownerId: "99999999-9999-4999-8999-999999999999",
  });

  await assert.rejects(
    () => resolveStudentEadPaymentOptions(runtime as any),
    (error: unknown) =>
      error instanceof PaymentCheckoutHttpError &&
      error.status === 404 && /nao localizada/i.test(error.message),
  );
  assert.deepEqual(queriedRouteMethods, []);
});

Deno.test("consulta de opcoes falha fechada para titulo suspenso", async () => {
  const { runtime, queriedRouteMethods } = buildRuntime({
    receivableStatus: "SUSPENSO",
  });

  await assert.rejects(
    () => resolveStudentEadPaymentOptions(runtime as any),
    (error: unknown) =>
      error instanceof PaymentCheckoutHttpError &&
      error.status === 404 && /nao localizada/i.test(error.message),
  );
  assert.deepEqual(queriedRouteMethods, []);
});

Deno.test("consulta de opcoes falha fechada para titulo ja pago", async () => {
  const { runtime, queriedRouteMethods } = buildRuntime({
    paidAt: "2026-08-26T12:00:00.000Z",
  });

  await assert.rejects(
    () => resolveStudentEadPaymentOptions(runtime as any),
    (error: unknown) =>
      error instanceof PaymentCheckoutHttpError &&
      error.status === 404 && /nao localizada/i.test(error.message),
  );
  assert.deepEqual(queriedRouteMethods, []);
});

Deno.test("curso com Pix desabilitado oferece somente o documento BolePix", async () => {
  const { runtime } = buildRuntime({ pixEnabled: false });
  const result = await resolveStudentEadPaymentOptions(runtime as any);

  assert.deepEqual(result.options, [{
    id: "BOLETO",
    label: "Boleto com Pix",
    checkoutMethod: "BOLETO",
    presentation: "BOLETO",
  }]);
});

Deno.test("curso somente Pix usa o trilho BOLETO sem oferecer documento", async () => {
  const { runtime, queriedRouteMethods } = buildRuntime({
    pixEnabled: true,
    boletoEnabled: false,
    courseValue: 0,
    receivableValue: 99.9,
  });
  const result = await resolveStudentEadPaymentOptions(runtime as any);

  assert.deepEqual(result.options, [{
    id: "PIX",
    label: "Pix",
    checkoutMethod: "BOLETO",
    presentation: "PIX",
  }]);
  assert.deepEqual(queriedRouteMethods, ["BOLETO", "CREDIT_CARD"]);
});

Deno.test("credentialId explicito invalido nao usa credencial alternativa", async () => {
  const { runtime } = buildRuntime({
    routeCredentialId: "99999999-9999-4999-8999-999999999999",
  });
  const result = await resolveStudentEadPaymentOptions(runtime as any);

  assert.deepEqual(result.options, []);
});

Deno.test("presentation Pix e validada somente sobre BOLETO Banese", () => {
  assert.deepEqual(
    echoCheckoutPresentation({
      url: "https://boleto.example",
      payment: { pixQrCode: { payload: "000201..." } },
    }, "PIX"),
    {
      url: "https://boleto.example",
      payment: { pixQrCode: { payload: "000201..." } },
      presentation: "PIX",
    },
  );
  assert.deepEqual(
    echoCheckoutPresentation({
      url: "https://boleto.example",
      payment: { pixQrCode: null },
    }, "PIX"),
    {
      url: "https://boleto.example",
      payment: { pixQrCode: null },
      presentation: "BOLETO",
      presentationFallbackReason: "PIX_UNAVAILABLE_USE_BOLETO",
    },
  );
  assert.equal(
    validateCheckoutPresentation(
      { presentation: "PIX" },
      "BOLETO",
      "banese_card",
      { financeiro_config: { metodosRecebimento: { pix: true } } },
    ),
    "PIX",
  );
  assert.equal(
    validateCheckoutPresentation(
      {},
      "BOLETO",
      "banese_card",
      { financeiro_config: { metodosRecebimento: { pix: true } } },
    ),
    "BOLETO",
  );
  assert.throws(
    () =>
      validateCheckoutPresentation(
        { presentation: "PIX" },
        "CREDIT_CARD",
        "mercado_pago",
        { financeiro_config: { metodosRecebimento: { pix: true } } },
      ),
    /exige o metodo bancario BOLETO/i,
  );
  assert.throws(
    () =>
      validateCheckoutPresentation(
        { presentation: "PIX" },
        "BOLETO",
        "asaas",
        { financeiro_config: { metodosRecebimento: { pix: true } } },
      ),
    /nao esta disponivel para esta rota/i,
  );
  assert.throws(
    () =>
      validateCheckoutPresentation(
        { presentation: "PIX" },
        "BOLETO",
        "banese_card",
        { financeiro_config: { metodosRecebimento: { pix: false } } },
      ),
    /nao permite a apresentacao PIX/i,
  );
});
