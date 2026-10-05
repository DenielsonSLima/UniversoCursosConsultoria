export const ONLINE_INSCRIPTION_PENDING_STATUS = "AGUARDANDO_PAGAMENTO";

export type OnlineInscriptionStatus =
  | "AGUARDANDO_PAGAMENTO"
  | "PAGO"
  | "CANCELADO"
  | "ERRO";

export type OnlineInscriptionAcademicSnapshot = {
  course?: any;
  turma?: any;
  aluno?: any;
  matricula?: any;
  technicalSchoolSnapshot?: Record<string, unknown>;
};

export type RepairOnlineInscriptionInput = {
  admin: any;
  receivable: any;
  gatewayProvider?: string | null;
  environment?: string | null;
  paymentId?: string | null;
  customerId?: string | null;
  paymentLinkId?: string | null;
  localStatus?: string | null;
  legacyPaymentMethod?: string | null;
  pendingStatus?: string | null;
  paidAt?: string | null;
  errorMessage?: string | null;
  academic?: OnlineInscriptionAcademicSnapshot;
  requireGatewayTransaction?: boolean;
};

export type ExistingOnlineInscriptionIdentity = {
  id?: string | null;
  matricula_id?: string | null;
  receivable_id?: string | null;
  ead_checkout_attempt_id?: string | null;
  updated_at?: string | null;
  gateway_provider?: string | null;
  gateway_environment?: string | null;
  gateway_payment_id?: string | null;
  gateway_payment_link_id?: string | null;
  asaas_payment_id?: string | null;
  asaas_payment_link_id?: string | null;
};

const PROVIDERS = new Set(["asaas", "mercado_pago", "banese_card"]);
const ENVIRONMENTS = new Set(["sandbox", "production"]);

export const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value ?? "").trim();
    if (candidate) return candidate;
  }
  return null;
};

export const onlyDigits = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "") || null;

export const normalizeGatewayPaymentIdentity = (
  providerCodeValue: unknown,
  value: unknown,
) => {
  const candidate = firstString(value);
  if (!candidate) return null;
  const providerCode = firstString(providerCodeValue)?.toLowerCase();
  if (providerCode !== "banese_card" || !/^\d{1,9}$/.test(candidate)) {
    return candidate;
  }
  return candidate.padStart(9, "0");
};

export const hasRepairableOnlineInscriptionIdentity = (receivable: any) => {
  const providerCode = firstString(receivable?.gateway_provider)?.toLowerCase();
  const environment = firstString(receivable?.gateway_environment)
    ?.toLowerCase();
  return Boolean(
    receivable?.id &&
      receivable?.matricula_id &&
      providerCode && PROVIDERS.has(providerCode) &&
      environment && ENVIRONMENTS.has(environment) &&
      firstString(
        receivable?.gateway_payment_id,
        receivable?.gateway_payment_link_id,
        providerCode === "asaas" ? receivable?.asaas_payment_id : null,
        providerCode === "asaas" ? receivable?.asaas_payment_link_id : null,
        receivable?.gateway_boleto_nosso_numero,
      ),
  );
};

export const normalizeOnlineInscriptionStatus = (
  value: unknown,
  pendingStatus: unknown = ONLINE_INSCRIPTION_PENDING_STATUS,
): OnlineInscriptionStatus => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PAGO") return "PAGO";
  if (["CANCELADO", "CANCELLED", "CANCELED"].includes(normalized)) {
    return "CANCELADO";
  }
  if (normalized === "ERRO") return "ERRO";
  const normalizedPending = String(pendingStatus || "").trim().toUpperCase();
  return normalizedPending === "AGUARDANDO_PAGAMENTO"
    ? "AGUARDANDO_PAGAMENTO"
    : ONLINE_INSCRIPTION_PENDING_STATUS;
};

export const assertCompatibleOnlineInscriptionIdentity = (input: {
  existing?: ExistingOnlineInscriptionIdentity | null;
  matriculaId: string;
  receivableId: string;
  providerCode: string;
  environment: string;
  paymentId: string | null;
  paymentLinkId: string | null;
  attemptId?: string | null;
}) => {
  const existing = input.existing;
  if (!existing?.id) {
    return {
      paymentId: input.paymentId || input.paymentLinkId,
      paymentLinkId: input.paymentLinkId,
    };
  }

  const assertImmutable = (
    label: string,
    current: unknown,
    incoming: unknown,
  ) => {
    const currentValue = firstString(current);
    const incomingValue = firstString(incoming);
    if (currentValue && incomingValue && currentValue !== incomingValue) {
      throw new Error(
        `A inscricao online ja possui ${label} canonico diferente; a segunda cobranca foi recusada.`,
      );
    }
  };

  assertImmutable("matricula", existing.matricula_id, input.matriculaId);
  assertImmutable("recebivel", existing.receivable_id, input.receivableId);
  assertImmutable("tentativa EAD", existing.ead_checkout_attempt_id, input.attemptId);
  assertImmutable("provedor", existing.gateway_provider, input.providerCode);
  assertImmutable(
    "ambiente",
    existing.gateway_environment,
    input.environment,
  );
  assertImmutable(
    "link de pagamento",
    firstString(
      existing.gateway_payment_link_id,
      input.providerCode === "asaas" ? existing.asaas_payment_link_id : null,
    ),
    input.paymentLinkId,
  );

  const existingLinkId = firstString(
    existing.gateway_payment_link_id,
    input.providerCode === "asaas" ? existing.asaas_payment_link_id : null,
  );
  const paymentLinkId = firstString(input.paymentLinkId, existingLinkId);
  const existingPaymentId = normalizeGatewayPaymentIdentity(
    input.providerCode,
    firstString(
      existing.gateway_payment_id,
      input.providerCode === "asaas" ? existing.asaas_payment_id : null,
    ),
  );
  const incomingPaymentId = normalizeGatewayPaymentIdentity(
    input.providerCode,
    input.paymentId,
  );
  if (
    existingPaymentId && incomingPaymentId &&
    existingPaymentId !== incomingPaymentId
  ) {
    const promotesLinkPlaceholder = Boolean(
      existingLinkId &&
        existingPaymentId === existingLinkId &&
        paymentLinkId === existingLinkId,
    );
    if (!promotesLinkPlaceholder) {
      throw new Error(
        "A inscricao online ja possui pagamento remoto canonico diferente; a segunda cobranca foi recusada.",
      );
    }
  }

  return {
    paymentId: incomingPaymentId || existingPaymentId || paymentLinkId,
    paymentLinkId,
  };
};

export const assertStrongIdentity = (input: {
  receivable: any;
  matriculaId: string | null;
  providerCode: string | null;
  environment: string | null;
  remoteIdentity: string | null;
}) => {
  if (!input.receivable?.id) {
    throw new Error(
      "Nao e possivel reparar a inscricao online sem o recebivel canonico.",
    );
  }
  if (!input.matriculaId) {
    throw new Error(
      "Nao e possivel reparar a inscricao online sem a matricula canonica.",
    );
  }
  if (!input.providerCode || !PROVIDERS.has(input.providerCode)) {
    throw new Error("Provedor invalido ao reparar a inscricao online.");
  }
  if (!input.environment || !ENVIRONMENTS.has(input.environment)) {
    throw new Error("Ambiente invalido ao reparar a inscricao online.");
  }
  if (!input.remoteIdentity) {
    throw new Error(
      "A inscricao online so pode ser reparada depois que a cobranca remota estiver identificada.",
    );
  }

  const receivableMatriculaId = firstString(input.receivable.matricula_id);
  if (
    receivableMatriculaId && receivableMatriculaId !== input.matriculaId
  ) {
    throw new Error(
      "A matricula informada nao pertence ao recebivel usado no reparo da inscricao online.",
    );
  }
  const receivableProvider = firstString(
    input.receivable.gateway_provider,
  )?.toLowerCase() || null;
  if (receivableProvider && receivableProvider !== input.providerCode) {
    throw new Error(
      "O provedor da inscricao diverge do provedor do recebivel canonico.",
    );
  }
  const receivableEnvironment = firstString(
    input.receivable.gateway_environment,
  )?.toLowerCase() || null;
  if (
    receivableEnvironment && receivableEnvironment !== input.environment
  ) {
    throw new Error(
      "O ambiente da inscricao diverge do ambiente do recebivel canonico.",
    );
  }
};
