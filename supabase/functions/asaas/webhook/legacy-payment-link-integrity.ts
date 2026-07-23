import {
  asaasPaymentMethod,
  type AsaasWebhookEnvironment,
  moneyInCents,
} from "./receivable-integrity.ts";

const normalized = (value: unknown) => String(value ?? "").trim().toUpperCase();

const optionalString = (value: unknown) => {
  const result = String(value ?? "").trim();
  return result || null;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === "object" ? value as UnknownRecord : {};

const reviewError = (reason: string) =>
  new Error(
    `REVISAO_ASAAS_LINK_LEGADO: ${reason}; nenhum pagamento ou ativacao foi aplicado`,
  );

const configuredCourseMethodIsAllowed = (
  course: UnknownRecord,
  method: "PIX" | "BOLETO" | "CREDIT_CARD",
) => {
  const financeiroConfig = asRecord(course.financeiro_config);
  const methods = asRecord(financeiroConfig.metodosRecebimento);
  const card = asRecord(financeiroConfig.cartao);
  if (method === "PIX") return methods.pix === true;
  if (method === "BOLETO") return methods.boleto === true;
  return methods.cartao === true && card.aceitar === true;
};

const canonicalAsaasCurrency = (source: UnknownRecord) =>
  normalized(
    source.currency || source.currencyCode || source.currency_code || "BRL",
  );

export type LegacyCoursePaymentLinkProof = {
  environment: AsaasWebhookEnvironment;
  paymentId: string;
  paymentLinkId: string;
  customerId: string;
  paymentMethod: "PIX" | "BOLETO" | "CREDIT_CARD";
  amount: number;
};

/**
 * Prova a origem de um pagamento criado pelos links antigos salvos em cursos.
 *
 * O chamador deve obter `remoteLink` por GET /paymentLinks/{id} usando as
 * mesmas credenciais selecionadas pelo token do webhook. Esse GET autenticado
 * e bem-sucedido e a prova de que o link pertence ao ambiente corrente; quando
 * o Asaas tambem devolve o ambiente no objeto, ele e conferido abaixo.
 */
export const proveLegacyCoursePaymentLink = (input: {
  course: UnknownRecord;
  payment: UnknownRecord;
  remoteLink: UnknownRecord;
  environment: AsaasWebhookEnvironment;
}): LegacyCoursePaymentLinkProof => {
  const { course, payment, remoteLink, environment } = input;
  const paymentId = optionalString(payment.id);
  const paymentLinkId = optionalString(payment.paymentLink);
  const customerId = optionalString(payment.customer);
  const courseId = optionalString(course.id);
  const configuredLinkId = optionalString(course.asaas_payment_link_id);

  if (!paymentId) throw reviewError("pagamento remoto sem identificador");
  if (!customerId) throw reviewError("pagamento remoto sem cliente Asaas");
  if (!courseId) throw reviewError("curso legado sem identificador local");
  if (!paymentLinkId || !configuredLinkId) {
    throw reviewError("link de pagamento sem identidade completa");
  }
  if (paymentLinkId !== configuredLinkId) {
    throw reviewError("link do pagamento nao pertence ao curso");
  }
  if (optionalString(remoteLink.id) !== paymentLinkId) {
    throw reviewError("link remoto consultado diverge do link do pagamento");
  }
  if (optionalString(payment.externalReference) !== courseId) {
    throw reviewError("externalReference do pagamento nao identifica o curso");
  }
  if (optionalString(remoteLink.externalReference) !== courseId) {
    throw reviewError("externalReference do link nao identifica o curso");
  }

  const linkEnvironment = optionalString(
    remoteLink.environment || remoteLink.gatewayEnvironment,
  );
  if (
    linkEnvironment && normalized(linkEnvironment) !== normalized(environment)
  ) {
    throw reviewError("link pertence a outro ambiente Asaas");
  }
  if (normalized(remoteLink.chargeType) !== "DETACHED") {
    throw reviewError("link remoto nao e uma cobranca avulsa");
  }
  if (String(remoteLink.deleted ?? false).toLowerCase() === "true") {
    throw reviewError("link remoto esta excluido");
  }

  const paymentCurrency = canonicalAsaasCurrency(payment);
  const linkCurrency = canonicalAsaasCurrency(remoteLink);
  if (paymentCurrency !== "BRL" || linkCurrency !== "BRL") {
    throw reviewError("moeda do pagamento ou do link diverge de BRL");
  }

  const expectedAmount = moneyInCents(course.valor);
  const paymentAmount = moneyInCents(payment.value);
  const linkAmount = moneyInCents(remoteLink.value);
  if (
    expectedAmount === null || expectedAmount <= 0 ||
    paymentAmount === null || paymentAmount <= 0 ||
    linkAmount === null || linkAmount <= 0 ||
    paymentAmount !== expectedAmount || linkAmount !== expectedAmount
  ) {
    throw reviewError(
      "valor do curso, do link e do pagamento nao coincide exatamente",
    );
  }

  const paymentMethod = asaasPaymentMethod(payment.billingType);
  if (!paymentMethod) {
    throw reviewError("forma de pagamento remota ausente ou invalida");
  }
  const linkMethod = normalized(remoteLink.billingType);
  if (linkMethod === "UNDEFINED") {
    if (!configuredCourseMethodIsAllowed(course, paymentMethod)) {
      throw reviewError(
        "forma escolhida no link nao esta explicitamente habilitada no curso",
      );
    }
  } else if (linkMethod !== paymentMethod) {
    throw reviewError("forma de pagamento diverge da configuracao do link");
  }

  return {
    environment,
    paymentId,
    paymentLinkId,
    customerId,
    paymentMethod,
    amount: expectedAmount / 100,
  };
};

export const proveLegacyAsaasCustomer = (input: {
  paymentCustomerId: string;
  customer: UnknownRecord;
}) => {
  const remoteCustomerId = optionalString(input.customer?.id);
  if (!remoteCustomerId || remoteCustomerId !== input.paymentCustomerId) {
    throw reviewError("cliente consultado nao coincide com o pagamento");
  }
  const cpfCnpj = String(input.customer?.cpfCnpj || "").replace(/\D/g, "");
  if (![11, 14].includes(cpfCnpj.length)) {
    throw reviewError("cliente remoto sem CPF ou CNPJ identificavel");
  }
  return { customerId: remoteCustomerId, cpfCnpj };
};

const assertOptionalIdentity = (
  label: string,
  current: unknown,
  expected: unknown,
) => {
  const value = optionalString(current);
  if (value && value !== optionalString(expected)) {
    throw reviewError(`${label} do recebivel pertence a outra cobranca`);
  }
};

export const assertLegacyReceivableCompatibility = (input: {
  existing: UnknownRecord | null;
  proof: LegacyCoursePaymentLinkProof;
  alunoId: string;
  matriculaId: string;
  turmaId: string;
}) => {
  const { existing, proof } = input;
  if (!existing) return;

  assertOptionalIdentity(
    "identificador Asaas",
    existing.asaas_payment_id,
    proof.paymentId,
  );
  assertOptionalIdentity(
    "identificador canonico",
    existing.gateway_payment_id,
    proof.paymentId,
  );
  assertOptionalIdentity(
    "nosso numero Asaas",
    existing.nosso_numero_asaas,
    proof.paymentId,
  );
  assertOptionalIdentity(
    "link Asaas legado",
    existing.asaas_payment_link_id,
    proof.paymentLinkId,
  );
  assertOptionalIdentity(
    "link Asaas canonico",
    existing.gateway_payment_link_id,
    proof.paymentLinkId,
  );
  assertOptionalIdentity(
    "cliente canonico",
    existing.gateway_customer_id,
    proof.customerId,
  );
  assertOptionalIdentity("aluno", existing.cliente_id, input.alunoId);
  assertOptionalIdentity("matricula", existing.matricula_id, input.matriculaId);
  assertOptionalIdentity("turma", existing.turma_id, input.turmaId);

  const provider = optionalString(existing.gateway_provider);
  if (provider && normalized(provider) !== "ASAAS") {
    throw reviewError("recebivel pertence a outro provedor");
  }
  const currentEnvironment = optionalString(existing.gateway_environment);
  if (
    currentEnvironment &&
    normalized(currentEnvironment) !== normalized(proof.environment)
  ) {
    throw reviewError("recebivel pertence a outro ambiente");
  }
  const currentMethod = optionalString(existing.gateway_payment_method);
  if (
    currentMethod && asaasPaymentMethod(currentMethod) !== proof.paymentMethod
  ) {
    throw reviewError("recebivel possui outra forma de pagamento");
  }
  const submissionChannel = optionalString(existing.gateway_submission_channel);
  if (submissionChannel && normalized(submissionChannel) !== "API") {
    throw reviewError("recebivel pertence a outro canal de submissao");
  }
  const submissionStatus = optionalString(existing.gateway_submission_status);
  if (
    submissionStatus &&
    !["API_AMBIGUOUS", "API_REGISTERED"].includes(
      normalized(submissionStatus),
    )
  ) {
    throw reviewError("recebivel possui submissao remota nao confirmada");
  }
  if (moneyInCents(existing.valor) !== moneyInCents(proof.amount)) {
    throw reviewError("recebivel existente possui outro valor");
  }

  const launchType = optionalString(existing.tipo_lancamento);
  if (launchType && normalized(launchType) !== "MATRICULA") {
    throw reviewError("recebivel existente possui outra finalidade");
  }
  const status = normalized(existing.status);
  if (["CANCELADO", "ESTORNADO", "DEVOLVIDO"].includes(status)) {
    throw reviewError(`recebivel existente esta em estado terminal ${status}`);
  }
  if (
    status === "PAGO" &&
    !["ASAAS", "ASAAS_ONLINE"].includes(normalized(existing.origem_pagamento))
  ) {
    throw reviewError("recebivel foi baixado por outra origem");
  }
};
