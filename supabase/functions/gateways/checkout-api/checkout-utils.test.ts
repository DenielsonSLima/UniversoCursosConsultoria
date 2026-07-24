import assert from "node:assert/strict";
import {
  getTurmaUnavailabilityReason,
  isUnsafeCallbackHost,
  missingTechnicalEnrollmentFields,
  normalizeErrorMessage,
  normalizeGatewayPaymentMethod,
  resolvePaymentGatewayRoute,
  tryNormalizeGatewayPaymentMethod,
} from "./checkout-utils.ts";

const assertEquals = (actual: unknown, expected: unknown) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Esperado ${expectedJson}, recebido ${actualJson}.`);
  }
};

Deno.test("normaliza formas de pagamento sem alterar o contrato legado", () => {
  assertEquals(normalizeGatewayPaymentMethod("cartão"), "CREDIT_CARD");
  assertEquals(tryNormalizeGatewayPaymentMethod("card"), "CREDIT_CARD");
  assertEquals(tryNormalizeGatewayPaymentMethod("pix"), "PIX");
  assertEquals(tryNormalizeGatewayPaymentMethod("invalido"), null);
});

Deno.test("bloqueia hosts privados usados em callbacks", () => {
  assertEquals(isUnsafeCallbackHost("localhost"), true);
  assertEquals(isUnsafeCallbackHost("192.168.1.10"), true);
  assertEquals(isUnsafeCallbackHost("172.20.0.1"), true);
  assertEquals(isUnsafeCallbackHost("universocc.com.br"), false);
});

Deno.test("mantem validacao documental da matricula tecnica", () => {
  const missing = missingTechnicalEnrollmentFields(
    {
      situacao_ensino_medio: "CURSANDO",
      serie_ensino_medio_atual: 1,
      escola_ensino_medio: "",
      ano_previsto_conclusao_ensino_medio: "",
    },
    {
      aceita_concomitante: true,
      serie_minima_ensino_medio: 2,
    },
  );

  assertEquals(missing, [
    "escola do Ensino Médio",
    "série atual do Ensino Médio (mínimo: 2º ano)",
    "ano previsto de conclusão do Ensino Médio",
  ]);
});

Deno.test("preserva bloqueio de turma sem inscricao online", () => {
  assertEquals(
    getTurmaUnavailabilityReason({ permitir_inscricoes_online: false }),
    "Inscrições online não liberadas para esta turma.",
  );
});

Deno.test("quantidade minima nao funciona como teto de matriculas", () => {
  assertEquals(
    getTurmaUnavailabilityReason({
      permitir_inscricoes_online: true,
      bloquear_matriculas_apos_completar_vagas: true,
      qtd_vagas_minima: 1,
      vagas_totais: 30,
      matriculas: [{ status: "ATIVO" }],
    }),
    null,
  );
});

Deno.test("vagas totais continuam sendo o teto da turma", () => {
  assertEquals(
    getTurmaUnavailabilityReason({
      permitir_inscricoes_online: true,
      bloquear_matriculas_apos_completar_vagas: true,
      qtd_vagas_minima: 1,
      vagas_totais: 1,
      matriculas: [{ status: "ATIVO" }],
    }),
    "A turma está com vagas completas. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.",
  );
});

Deno.test("normaliza mensagens de erro estruturadas", () => {
  assertEquals(
    normalizeErrorMessage({ message: "Falha", code: "gateway_error" }),
    "Falha (Código: gateway_error)",
  );
});

Deno.test("resolvedor tecnico bloqueia rota Mercado Pago legada habilitada", async () => {
  const response = {
    data: {
      provider_code: "mercado_pago",
      credential_id: "credential-1",
      enabled: true,
    },
    error: null,
  };
  const query: any = {
    select: () => query,
    eq: () => query,
    neq: () => query,
    order: () => Promise.resolve({ data: [response.data], error: null }),
    maybeSingle: () => Promise.resolve(response),
    then: (
      resolve: (value: { data: any[]; error: null }) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve({ data: [response.data], error: null }).then(resolve, reject),
  };

  await assert.rejects(
    () =>
      resolvePaymentGatewayRoute(
        { from: () => query },
        "TECNICO",
        "CREDIT_CARD",
        "sandbox",
      ),
    /criacao ambigua de preferencias/i,
  );
});
