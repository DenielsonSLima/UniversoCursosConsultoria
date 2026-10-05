import { assertCompatibleOnlineInscriptionIdentity, assertStrongIdentity, firstString, onlyDigits, normalizeOnlineInscriptionStatus, type RepairOnlineInscriptionInput, type ExistingOnlineInscriptionIdentity, type OnlineInscriptionStatus } from "./online-inscription-identity.ts";
export { ONLINE_INSCRIPTION_PENDING_STATUS, normalizeGatewayPaymentIdentity, hasRepairableOnlineInscriptionIdentity, normalizeOnlineInscriptionStatus, assertCompatibleOnlineInscriptionIdentity } from "./online-inscription-identity.ts";
export type { OnlineInscriptionStatus, OnlineInscriptionAcademicSnapshot, RepairOnlineInscriptionInput } from "./online-inscription-identity.ts";

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
  let query = input.admin
    .from("inscricoes_online")
    .select(
      "id, matricula_id, receivable_id, ead_checkout_attempt_id, updated_at, gateway_provider, gateway_environment, gateway_payment_id, gateway_payment_link_id, asaas_payment_id, asaas_payment_link_id",
    );
  query = input.receivable.ead_checkout_attempt_id
    ? query.eq("receivable_id", input.receivable.id)
    : query.eq("matricula_id", matriculaId).is("ead_checkout_attempt_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data || null) as ExistingOnlineInscriptionIdentity | null;
};

const persistInscription = async (
  input: RepairOnlineInscriptionInput,
  payload: Record<string, unknown>,
  existing: ExistingOnlineInscriptionIdentity | null,
) => {
  if (existing?.id) {
    let update = input.admin.from("inscricoes_online").update(payload)
      .eq("id", existing.id).eq("matricula_id", payload.matricula_id);
    update = existing.updated_at ? update.eq("updated_at", existing.updated_at) : update.is("updated_at", null);
    return await update.select("id, status").maybeSingle();
  }
  return await input.admin.from("inscricoes_online").insert(payload).select("id, status").single();
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
 * possui identidade remota. A identidade existente é atualizada por CAS;
 * inserts concorrentes convergem pela unicidade global do recebível.
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
    attemptId: input.receivable.ead_checkout_attempt_id || null,
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
    ...(existingIdentity?.id ? { id: existingIdentity.id } : {}),
    ...(input.receivable.ead_checkout_attempt_id
      ? { ead_checkout_attempt_id: input.receivable.ead_checkout_attempt_id }
      : {}),
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

  let { data, error } = await persistInscription(input, payload, existingIdentity);
  if (error?.code === "23505" && !existingIdentity?.id) {
    const winner = await loadExistingIdentity(input, matriculaId!);
    if (!winner?.id) throw new Error("Outra inscrição foi criada. Atualize a compra antes de tentar novamente.");
    assertCompatibleOnlineInscriptionIdentity({ existing: winner, matriculaId: matriculaId!,
      receivableId: String(input.receivable.id), providerCode: providerCode!, environment: environment!,
      paymentId, paymentLinkId, attemptId: input.receivable.ead_checkout_attempt_id || null });
    ({ data, error } = await persistInscription(input, { ...payload, id: winner.id }, winner));
  }
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
