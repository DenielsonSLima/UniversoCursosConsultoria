import {
  getTurmaUnavailabilityReason,
  isUnsafeCallbackHost,
  missingTechnicalEnrollmentFields,
  normalizeErrorMessage,
  normalizeGatewayPaymentMethod,
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

Deno.test("normaliza mensagens de erro estruturadas", () => {
  assertEquals(
    normalizeErrorMessage({ message: "Falha", code: "gateway_error" }),
    "Falha (Código: gateway_error)",
  );
});
