export type ReceivableGatewayPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type AsaasBillingType = ReceivableGatewayPaymentMethod | "UNDEFINED";

const ROUTABLE_COURSE_MODALITIES = new Set([
  "EAD",
  "TECNICO",
  "LIVRE",
  "ESPECIALIZACAO",
]);

const normalizePaymentMethod = (
  value: unknown,
): ReceivableGatewayPaymentMethod | null => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PIX") return "PIX";
  if (normalized === "BOLETO") return "BOLETO";
  if (["CARTAO", "CARTÃO", "CREDIT_CARD"].includes(normalized)) {
    return "CREDIT_CARD";
  }
  return null;
};

export const requireEnrollmentGatewayPaymentMethod = (
  value: unknown,
): ReceivableGatewayPaymentMethod => {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized !== "PIX" &&
    normalized !== "BOLETO" &&
    normalized !== "CREDIT_CARD"
  ) {
    throw new Error(
      "Escolha Pix, boleto ou cartao de credito para a cobranca inicial.",
    );
  }
  return normalized;
};

export const buildEnrollmentReceivablePaymentPatch = (
  value: unknown,
) => {
  const gatewayPaymentMethod = requireEnrollmentGatewayPaymentMethod(value);
  return {
    forma_pagamento: gatewayPaymentMethod === "CREDIT_CARD"
      ? "CARTAO"
      : gatewayPaymentMethod,
    gateway_payment_method: gatewayPaymentMethod,
  };
};

export type EnrollmentPaymentPatchDecision = "apply" | "noop";

export const decideEnrollmentPaymentPatch = (input: {
  receivable: Record<string, unknown>;
  requestedMethod: unknown;
  hasRemoteReference: boolean;
}): EnrollmentPaymentPatchDecision => {
  const requestedMethod = requireEnrollmentGatewayPaymentMethod(
    input.requestedMethod,
  );
  const currentMethod = resolveReceivableGatewayPaymentMethod(
    input.receivable,
  );
  const status = String(input.receivable.status || "").trim().toUpperCase();
  const remoteCreationInProgress = [
    input.receivable.gateway_status,
    input.receivable.asaas_status,
  ].some((value) => String(value || "").trim().toUpperCase() === "CREATING");

  if (remoteCreationInProgress) {
    throw new Error(
      "A criacao do titulo bancario esta em andamento ou ficou ambigua. Recupere a tentativa antes de alterar o metodo.",
    );
  }

  if (status === "PAGO") {
    if (currentMethod === requestedMethod) return "noop";
    throw new Error(
      "Nao e permitido alterar a forma de pagamento de um recebivel ja pago.",
    );
  }

  if (input.hasRemoteReference) {
    if (currentMethod === requestedMethod) return "noop";
    throw new Error(
      "Nao e permitido trocar o metodo de um titulo bancario ja emitido. Cancele e reconcilie o titulo remoto primeiro.",
    );
  }

  if (!["PENDENTE", "VENCIDO"].includes(status)) {
    throw new Error(
      "A forma de pagamento so pode ser definida em recebivel pendente ou vencido.",
    );
  }

  return currentMethod === requestedMethod ? "noop" : "apply";
};

export const decideTechnicalInstallmentPaymentPatch = (input: {
  receivable: Record<string, unknown>;
  hasRemoteReference: boolean;
}): EnrollmentPaymentPatchDecision => {
  const currentMethod = resolveReceivableGatewayPaymentMethod(
    input.receivable,
  );
  if (currentMethod && currentMethod !== "BOLETO") {
    throw new Error(
      "Parcela tecnica possui metodo diferente de BOLETO. Revise o contrato financeiro antes de emitir o titulo.",
    );
  }
  return decideEnrollmentPaymentPatch({
    receivable: input.receivable,
    requestedMethod: "BOLETO",
    hasRemoteReference: input.hasRemoteReference,
  });
};

export const assertGatewayCreationFence = (input: {
  receivable: Record<string, unknown>;
  providerCode: string;
  environment: string;
  paymentMethod: ReceivableGatewayPaymentMethod;
  attemptToken?: string;
  expectedBankSlipOurNumber?: unknown;
}) => {
  const receivable = input.receivable;
  if (
    String(receivable.gateway_provider || "") !== input.providerCode ||
    String(receivable.gateway_environment || "") !== input.environment ||
    resolveReceivableGatewayPaymentMethod(receivable) !== input.paymentMethod ||
    String(receivable.gateway_status || "").toUpperCase() !== "CREATING" ||
    !["PENDENTE", "VENCIDO"].includes(
      String(receivable.status || "").toUpperCase(),
    ) ||
    receivable.gateway_payment_id ||
    receivable.gateway_payment_link_id ||
    receivable.asaas_payment_id ||
    receivable.asaas_payment_link_id ||
    (input.attemptToken &&
      receivable.gateway_creation_token !== input.attemptToken)
  ) {
    throw new Error(
      "A identidade da cobranca mudou durante a criacao no gateway.",
    );
  }

  const expectedOurNumber = String(input.expectedBankSlipOurNumber || "")
    .replace(/\D/g, "");
  const currentOurNumber = String(
    receivable.gateway_boleto_nosso_numero || "",
  ).replace(/\D/g, "");
  if (expectedOurNumber && currentOurNumber !== expectedOurNumber) {
    throw new Error(
      "O Nosso Numero reservado diverge do titulo retornado pelo gateway.",
    );
  }
  if (!expectedOurNumber && currentOurNumber) {
    throw new Error(
      "A cobranca recebeu um Nosso Numero inesperado durante a criacao.",
    );
  }
};

export const resolveManualSettlementReversalGateway = (
  receivable: Record<string, unknown>,
  recreateRequested: boolean,
) => {
  const oldAsaasPaymentId = String(receivable.asaas_payment_id || "") || null;
  const oldGatewayPaymentId = String(receivable.gateway_payment_id || "") ||
    null;
  const oldGatewayPaymentLinkId = String(
    receivable.gateway_payment_link_id || "",
  ) || null;
  const provider = String(receivable.gateway_provider || "").toLowerCase();
  const isBanese = provider === "banese_card";
  const isAsaas = provider === "asaas" || Boolean(
    oldAsaasPaymentId || receivable.asaas_payment_link_id ||
      (!provider && receivable.asaas_status),
  );
  const shouldRecreateAsaas = Boolean(
    recreateRequested && isAsaas &&
      (oldAsaasPaymentId || oldGatewayPaymentId || oldGatewayPaymentLinkId),
  );
  const shouldRecreateBanese = Boolean(
    recreateRequested && receivable.cliente_id && isBanese &&
      oldGatewayPaymentId,
  );
  const clearCanceledBanese = isBanese && Boolean(oldGatewayPaymentId);
  const clearCanceledAsaas = isAsaas && Boolean(
    oldAsaasPaymentId || oldGatewayPaymentId || oldGatewayPaymentLinkId,
  );
  // Durante a baixa presencial, forma_pagamento descreve o meio recebido no
  // caixa e pode diferir do metodo do titulo cancelado. Para recriar, a fonte
  // canonica e gateway_payment_method.
  const restoredPaymentMethod = normalizePaymentMethod(
    receivable.gateway_payment_method,
  ) || normalizePaymentMethod(receivable.forma_pagamento);

  return {
    oldAsaasPaymentId,
    oldGatewayPaymentId,
    oldGatewayPaymentLinkId,
    isBanese,
    isAsaas,
    shouldRecreateAsaas,
    shouldRecreateBanese,
    shouldRecreateGateway: shouldRecreateAsaas || shouldRecreateBanese,
    clearCanceledBanese,
    clearCanceledAsaas,
    clearCanceledGateway: clearCanceledBanese || clearCanceledAsaas,
    restoredLegacyPaymentMethod: restoredPaymentMethod === "CREDIT_CARD"
      ? "CARTAO"
      : restoredPaymentMethod,
  };
};

export const isRoutableCourseModality = (value: unknown) =>
  ROUTABLE_COURSE_MODALITIES.has(String(value || "").trim().toUpperCase());

export const resolveReceivableGatewayPaymentMethod = (
  receivable: Record<string, unknown> | null | undefined,
): ReceivableGatewayPaymentMethod | null => {
  const gatewayMethod = normalizePaymentMethod(
    receivable?.gateway_payment_method,
  );
  const legacyMethod = normalizePaymentMethod(receivable?.forma_pagamento);

  if (gatewayMethod && legacyMethod && gatewayMethod !== legacyMethod) {
    throw new Error(
      "A forma de pagamento do recebivel diverge do metodo registrado no gateway bancario.",
    );
  }

  return gatewayMethod || legacyMethod;
};

export const resolveAsaasBillingType = (
  receivable: Record<string, unknown> | null | undefined,
): AsaasBillingType =>
  resolveReceivableGatewayPaymentMethod(receivable) || "UNDEFINED";

export const assertNoImplicitAsaasFallback = (input: {
  modalidade: unknown;
  receivable: Record<string, unknown> | null | undefined;
}) => {
  const paymentMethod = resolveReceivableGatewayPaymentMethod(input.receivable);
  if (!isRoutableCourseModality(input.modalidade) || paymentMethod) {
    return paymentMethod;
  }

  const modalidade = String(input.modalidade || "").trim().toUpperCase();
  throw new Error(
    `Defina Pix, boleto ou cartao e valide a rota bancaria antes de sincronizar a cobranca de ${modalidade}. O fallback automatico para Asaas foi bloqueado.`,
  );
};

export const requireGatewayRouteForNewCharge = <TRoute>(
  route: TRoute | null | undefined,
): TRoute => {
  if (route) return route;
  throw new Error(
    "A cobranca nao possui modalidade e rota bancaria validas. Nenhum novo titulo foi criado; o fallback para Asaas permanece bloqueado.",
  );
};
