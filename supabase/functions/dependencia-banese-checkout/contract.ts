export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYABLE_STATUSES = new Set(["PENDENTE", "VENCIDO"]);
const PIX_ARTIFACT_KEY_RE =
  /(pix|qr|copiaecola|encodedimage|base64image|imagemcodificada)/i;
const PIX_EMV_MARKER_RE = /BR\.GOV\.BCB\.PIX/i;
const DATA_IMAGE_RE = /^data:image\//i;

export class DependencyCheckoutContractError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DependencyCheckoutContractError";
  }
}

const normalized = (value: unknown) => String(value ?? "").trim();
const normalizedUpper = (value: unknown) => normalized(value).toUpperCase();
const digits = (value: unknown) => normalized(value).replace(/\D/g, "");

const requireEqualId = (
  actual: unknown,
  expected: unknown,
  message: string,
) => {
  if (!actual || !expected || normalized(actual) !== normalized(expected)) {
    throw new DependencyCheckoutContractError(409, message);
  }
};

export const normalizeDependencyCheckoutRequest = (body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DependencyCheckoutContractError(400, "Requisição inválida.");
  }
  const receivableId = normalized(
    (body as Record<string, unknown>).receivableId,
  );
  if (!UUID_RE.test(receivableId)) {
    throw new DependencyCheckoutContractError(
      400,
      "Conta a receber inválida.",
    );
  }
  return { receivableId };
};

export const assertDependencyReceivableContract = (input: {
  receivable: Record<string, unknown> | null;
  link: Record<string, unknown> | null;
  attempt: Record<string, unknown> | null;
  component: Record<string, unknown> | null;
  enrollment: Record<string, unknown> | null;
  payer: Record<string, unknown> | null;
}) => {
  const {
    receivable,
    link,
    attempt,
    component,
    enrollment,
    payer,
  } = input;
  if (!receivable) {
    throw new DependencyCheckoutContractError(
      404,
      "Conta a receber não encontrada.",
    );
  }
  if (!link || link.principal !== true) {
    throw new DependencyCheckoutContractError(
      409,
      "A conta não é a cobrança principal da dependência.",
    );
  }
  if (!attempt || !component || !enrollment || !payer) {
    throw new DependencyCheckoutContractError(
      409,
      "O vínculo acadêmico da dependência está incompleto.",
    );
  }

  requireEqualId(
    link.conta_receber_id,
    receivable.id,
    "A cobrança diverge do vínculo principal da dependência.",
  );
  requireEqualId(
    link.tentativa_id,
    attempt.id,
    "A tentativa diverge do vínculo financeiro da dependência.",
  );
  requireEqualId(
    attempt.componente_id,
    component.id,
    "A tentativa diverge do componente curricular.",
  );
  requireEqualId(
    component.matricula_id,
    enrollment.id,
    "O componente diverge da matrícula de origem.",
  );
  requireEqualId(
    enrollment.aluno_id,
    payer.id,
    "O aluno da matrícula de origem não foi localizado.",
  );
  requireEqualId(
    receivable.cliente_id,
    enrollment.aluno_id,
    "A conta a receber pertence a outro aluno.",
  );
  requireEqualId(
    receivable.turma_id,
    attempt.turma_id,
    "A conta a receber pertence a outra turma de reoferta.",
  );
  requireEqualId(
    attempt.disciplina_id,
    component.disciplina_id,
    "A disciplina da tentativa diverge do componente curricular.",
  );

  if (normalizedUpper(receivable.tipo_lancamento) !== "DEPENDENCIA") {
    throw new DependencyCheckoutContractError(
      409,
      "A conta a receber não é uma cobrança de dependência.",
    );
  }
  if (!PAYABLE_STATUSES.has(normalizedUpper(receivable.status))) {
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança de dependência não está pendente para emissão.",
    );
  }
  if (normalizedUpper(attempt.status) !== "AGUARDANDO_PAGAMENTO") {
    throw new DependencyCheckoutContractError(
      409,
      "A tentativa acadêmica não está aguardando pagamento.",
    );
  }
  if (receivable.matricula_id !== null) {
    throw new DependencyCheckoutContractError(
      409,
      "Cobrança de dependência não pode gerar parcelas pela matrícula.",
    );
  }
  if (normalized(receivable.gateway_provider) !== "banese_card") {
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança de dependência deve usar exclusivamente o Banese.",
    );
  }
  if (normalizedUpper(receivable.gateway_payment_method) !== "BOLETO") {
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança de dependência aceita somente boleto Banese.",
    );
  }
  if (normalizedUpper(receivable.forma_pagamento) !== "BOLETO") {
    throw new DependencyCheckoutContractError(
      409,
      "A forma de pagamento da dependência diverge do boleto Banese.",
    );
  }
  if (
    !["sandbox", "production"].includes(
      normalized(receivable.gateway_environment),
    )
  ) {
    throw new DependencyCheckoutContractError(
      409,
      "O ambiente Banese da cobrança não foi definido.",
    );
  }
  const amount = Number(receivable.valor);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança de dependência possui valor inválido.",
    );
  }
  const attemptAmount = Number(attempt.valor_cobrado_snapshot);
  if (
    !Number.isFinite(attemptAmount) ||
    Math.round(attemptAmount * 100) !== Math.round(amount * 100)
  ) {
    throw new DependencyCheckoutContractError(
      409,
      "O valor da cobrança diverge do snapshot acadêmico-financeiro.",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized(receivable.data_vencimento).slice(0, 10),
    )
  ) {
    throw new DependencyCheckoutContractError(
      409,
      "A cobrança de dependência possui vencimento inválido.",
    );
  }
};

export const hasCompleteBaneseBoleto = (
  receivable: Record<string, unknown> | null | undefined,
) =>
  Boolean(
    receivable &&
      digits(receivable.gateway_boleto_linha_digitavel).length === 47 &&
      digits(receivable.gateway_boleto_codigo_barras).length === 44 &&
      digits(receivable.gateway_boleto_nosso_numero).length > 0,
  );

const redactPixArtifacts = (
  value: unknown,
  seen = new WeakSet<object>(),
): unknown => {
  if (
    typeof value === "string" &&
    (PIX_EMV_MARKER_RE.test(value) || DATA_IMAGE_RE.test(value))
  ) {
    return "[SUPPRESSED_BY_DEPENDENCY_POLICY]";
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactPixArtifacts(item, seen));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "");
    redacted[key] = PIX_ARTIFACT_KEY_RE.test(normalizedKey)
      ? "[SUPPRESSED_BY_DEPENDENCY_POLICY]"
      : redactPixArtifacts(item, seen);
  }
  return redacted;
};

export const sanitizeDependencyBaneseResult = <
  T extends Record<string, unknown>,
>(result: T): T => ({
  ...result,
  invoiceUrl: null,
  bankSlipUrl: null,
  pixPayload: null,
  pixEncodedImage: null,
  rawPayload: {
    ...(
      redactPixArtifacts(result.rawPayload) as Record<string, unknown> | null ??
        {}
    ),
    dependencyPolicy: {
      pixSuppressed: true,
      publicDocumentUrlSuppressed: true,
    },
  },
});

export const buildDependencyCheckoutResponse = (
  receivable: Record<string, unknown>,
  reused: boolean,
) => ({
  success: true,
  reused,
  receivable: {
    id: normalized(receivable.id),
    status: normalizedUpper(receivable.status),
    amount: Number(receivable.valor),
    dueDate: normalized(receivable.data_vencimento).slice(0, 10),
    provider: "banese_card",
    paymentMethod: "BOLETO",
    gatewayStatus: normalized(receivable.gateway_status) || null,
    submissionStatus: normalized(receivable.gateway_submission_status) || null,
  },
  boleto: {
    digitableLine: normalized(
      receivable.gateway_boleto_linha_digitavel,
    ) || null,
    barcode: normalized(receivable.gateway_boleto_codigo_barras) || null,
    ourNumber: normalized(receivable.gateway_boleto_nosso_numero) || null,
  },
  pix: {
    available: false,
    reason: "BANESE_PIX_FORMAL_RELEASE_PENDING",
  },
});
