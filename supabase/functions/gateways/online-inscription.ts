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

type ExistingOnlineInscriptionIdentity = {
  id?: string | null;
  matricula_id?: string | null;
  receivable_id?: string | null;
  gateway_provider?: string | null;
  gateway_environment?: string | null;
  gateway_payment_id?: string | null;
  gateway_payment_link_id?: string | null;
  asaas_payment_id?: string | null;
  asaas_payment_link_id?: string | null;
};

const PROVIDERS = new Set(["asaas", "mercado_pago", "banese_card"]);
const ENVIRONMENTS = new Set(["sandbox", "production"]);

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value ?? "").trim();
    if (candidate) return candidate;
  }
  return null;
};

const onlyDigits = (value: unknown) =>
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

const assertStrongIdentity = (input: {
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

const loadAcademicSnapshot = async (
  input: RepairOnlineInscriptionInput,
  matriculaId: string,
) => {
  let matricula = input.academic?.matricula || null;
  if (!matricula?.id || !matricula?.turma_id || !matricula?.aluno_id) {
    const { data, error } = await input.admin
      .from("matriculas")
      .select("id, aluno_id, turma_id")
      .eq("id", matriculaId)
      .maybeSingle();
    if (error) throw error;
    matricula = { ...(data || {}), ...(matricula || {}) };
  }
  if (!matricula?.id) {
    throw new Error("Matricula nao encontrada ao reparar a inscricao online.");
  }

  const turmaId = firstString(
    input.academic?.turma?.id,
    input.receivable?.turma_id,
    matricula.turma_id,
  );
  const alunoId = firstString(
    input.academic?.aluno?.id,
    input.receivable?.cliente_id,
    matricula.aluno_id,
  );
  if (!turmaId || !alunoId) {
    throw new Error(
      "Turma ou aluno nao encontrado ao reparar a inscricao online.",
    );
  }
  let turma = input.academic?.turma || null;
  let aluno = input.academic?.aluno || null;

  const [turmaResult, alunoResult] = await Promise.all([
    input.academic?.course?.id && turma?.id
      ? Promise.resolve({ data: null, error: null })
      : input.admin.from("turmas")
        .select("id, curso_id")
        .eq("id", turmaId)
        .maybeSingle(),
    aluno?.id
      ? Promise.resolve({ data: null, error: null })
      : input.admin.from("parceiros")
        .select("id, nome, cpf_cnpj, email, telefone, asaas_customer_id")
        .eq("id", alunoId)
        .maybeSingle(),
  ]);
  if (turmaResult.error) throw turmaResult.error;
  if (alunoResult.error) throw alunoResult.error;
  turma = { ...(turmaResult.data || {}), ...(turma || {}) };
  aluno = { ...(alunoResult.data || {}), ...(aluno || {}) };

  const courseId = firstString(
    input.academic?.course?.id,
    turma?.curso_id,
  );
  if (!courseId || !turmaId || !alunoId) {
    throw new Error(
      "Curso, turma ou aluno nao encontrado ao reparar a inscricao online.",
    );
  }

  return {
    course: { ...(input.academic?.course || {}), id: courseId },
    turma: { ...(turma || {}), id: turmaId },
    aluno: { ...(aluno || {}), id: alunoId },
    matricula: { ...(matricula || {}), id: matriculaId },
  };
};

const loadExistingIdentity = async (
  input: RepairOnlineInscriptionInput,
  matriculaId: string,
) => {
  const { data, error } = await input.admin
    .from("inscricoes_online")
    .select(
      "id, matricula_id, receivable_id, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, asaas_payment_id, asaas_payment_link_id",
    )
    .eq("matricula_id", matriculaId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as ExistingOnlineInscriptionIdentity | null;
};

const linkGatewayTransaction = async (
  input: RepairOnlineInscriptionInput,
  identity: {
    providerCode: string;
    environment: string;
    remotePaymentId: string;
  },
  inscriptionId: string,
) => {
  const { data, error } = await input.admin
    .from("payment_gateway_transactions")
    .update({
      inscricao_online_id: inscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("receivable_id", input.receivable.id)
    .eq("provider_code", identity.providerCode)
    .eq("environment", identity.environment)
    .eq("remote_payment_id", identity.remotePaymentId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (input.requireGatewayTransaction && !data?.id) {
    throw new Error(
      "A transacao canonica do gateway nao foi encontrada ao vincular a inscricao online.",
    );
  }
  return Boolean(data?.id);
};

/**
 * Reconstroi a projecao de inscricoes_online a partir do recebivel que ja
 * possui identidade remota. A unicidade por matricula torna o UPSERT atomico:
 * retries e requisicoes concorrentes convergem para a mesma linha sem criar
 * uma segunda cobranca.
 */
export const repairOnlineInscription = async (
  input: RepairOnlineInscriptionInput,
) => {
  const matriculaId = firstString(
    input.academic?.matricula?.id,
    input.receivable?.matricula_id,
  );
  const providerCode = firstString(
    input.gatewayProvider,
    input.receivable?.gateway_provider,
  )?.toLowerCase() || null;
  const environment = firstString(
    input.environment,
    input.receivable?.gateway_environment,
  )?.toLowerCase() || null;
  const proposedPaymentLinkId = firstString(
    input.paymentLinkId,
    input.receivable?.gateway_payment_link_id,
    providerCode === "asaas" ? input.receivable?.asaas_payment_link_id : null,
  );
  const proposedPaymentId = firstString(
    input.paymentId,
    input.receivable?.gateway_payment_id,
    providerCode === "asaas" ? input.receivable?.asaas_payment_id : null,
    input.receivable?.gateway_boleto_nosso_numero,
  );

  if (!matriculaId || !input.receivable?.id || !providerCode || !environment) {
    assertStrongIdentity({
      receivable: input.receivable,
      matriculaId,
      providerCode,
      environment,
      remoteIdentity: proposedPaymentId || proposedPaymentLinkId,
    });
  }
  const existingIdentity = await loadExistingIdentity(input, matriculaId!);
  const compatibleIdentity = assertCompatibleOnlineInscriptionIdentity({
    existing: existingIdentity,
    matriculaId: matriculaId!,
    receivableId: String(input.receivable.id),
    providerCode: providerCode!,
    environment: environment!,
    paymentId: proposedPaymentId,
    paymentLinkId: proposedPaymentLinkId,
  });
  const paymentId = compatibleIdentity.paymentId;
  const paymentLinkId = compatibleIdentity.paymentLinkId;

  assertStrongIdentity({
    receivable: input.receivable,
    matriculaId,
    providerCode,
    environment,
    remoteIdentity: paymentId || paymentLinkId,
  });

  const academic = await loadAcademicSnapshot(input, matriculaId!);
  const status = normalizeOnlineInscriptionStatus(
    input.localStatus || input.receivable?.status,
    input.pendingStatus,
  );
  const paid = status === "PAGO";
  const now = new Date().toISOString();
  const customerId = firstString(
    input.customerId,
    input.receivable?.gateway_customer_id,
    providerCode === "asaas" ? academic.aluno?.asaas_customer_id : null,
  );
  const amount = Number(input.receivable?.valor || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Valor invalido ao reparar a inscricao online.");
  }

  const payload: Record<string, unknown> = {
    ...(input.academic?.technicalSchoolSnapshot || {}),
    curso_id: academic.course.id,
    turma_id: academic.turma.id,
    aluno_id: academic.aluno.id,
    matricula_id: academic.matricula.id,
    receivable_id: input.receivable.id,
    asaas_payment_id: providerCode === "asaas" ? paymentId : null,
    asaas_customer_id: providerCode === "asaas" ? customerId : null,
    asaas_payment_link_id: providerCode === "asaas" ? paymentLinkId : null,
    gateway_provider: providerCode,
    gateway_environment: environment,
    gateway_payment_id: paymentId,
    gateway_customer_id: customerId,
    gateway_payment_link_id: paymentLinkId,
    nome: academic.aluno.nome || null,
    cpf_cnpj: onlyDigits(academic.aluno.cpf_cnpj),
    email: academic.aluno.email || null,
    telefone: academic.aluno.telefone || null,
    valor: amount,
    status,
    forma_pagamento: firstString(
      input.legacyPaymentMethod,
      input.receivable?.forma_pagamento,
      input.receivable?.gateway_payment_method,
    ),
    erro: paid ? null : input.errorMessage || null,
    ...(paid
      ? {
        pago_em: firstString(
          input.paidAt,
          input.receivable?.data_pagamento,
          now,
        ),
        confirmado_em: firstString(input.paidAt, now),
      }
      : {}),
    updated_at: now,
  };

  const { data, error } = await input.admin
    .from("inscricoes_online")
    .upsert(payload, { onConflict: "matricula_id" })
    .select("id, status")
    .single();
  if (error) {
    throw new Error(
      `Nao foi possivel reparar a inscricao online: ${
        error?.message || String(error)
      }`,
    );
  }
  if (!data?.id) {
    throw new Error(
      "O reparo da inscricao online terminou sem uma linha canonica.",
    );
  }

  await linkGatewayTransaction(input, {
    providerCode: providerCode!,
    environment: environment!,
    remotePaymentId: paymentId!,
  }, data.id);

  return data as { id: string; status: OnlineInscriptionStatus };
};
