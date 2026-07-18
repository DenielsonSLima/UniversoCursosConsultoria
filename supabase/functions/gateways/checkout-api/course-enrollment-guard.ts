const ACCESS_STATUSES = new Set(["ATIVO", "TRANCADO", "CONCLUIDO"]);
const PENDING_STATUSES = new Set([
  "PENDENTE",
  "AGUARDANDO_PAGAMENTO",
  "AGUARDANDO_CONFIRMACAO",
]);
const CLOSED_STATUSES = new Set(["CANCELADO", "DESISTENTE", "TRANSFERIDO"]);
const PAID_GATEWAY_STATUSES = new Set([
  "RECEIVED",
  "CONFIRMED",
  "APPROVED",
  "PAID",
]);
const CANCELED_GATEWAY_STATUSES = new Set([
  "DELETED",
  "REFUNDED",
  "CANCELLED",
  "CANCELED",
  "CANCELLED_BY_USER",
]);
const OPEN_RECEIVABLE_STATUSES = new Set([
  "PENDENTE",
  "VENCIDO",
  "AGUARDANDO_CONFIRMACAO",
]);

export type ExistingCourseCheckoutState = "paid" | "pending";

export interface ExistingCourseCheckout {
  state: ExistingCourseCheckoutState;
  matricula: any;
  turma: any;
  receivable: any | null;
  url: string | null;
}

export interface FindExistingCourseCheckoutOptions {
  ignorePending?: boolean;
}

const normalizeStatus = (status: unknown) =>
  String(status || "").trim().toUpperCase();
const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const firstHttpUrl = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return null;
};

const getPaymentUrl = (receivable: any) =>
  firstHttpUrl(
    receivable?.gateway_invoice_url,
    receivable?.gateway_bank_slip_url,
    receivable?.gateway_payment_link_id,
    receivable?.asaas_invoice_url,
    receivable?.asaas_bank_slip_url,
    receivable?.asaas_payment_link_id,
  );

const isPaidReceivable = (receivable: any) => {
  const status = normalizeStatus(receivable?.status);
  const gatewayStatus = normalizeStatus(receivable?.gateway_status);
  const asaasStatus = normalizeStatus(receivable?.asaas_status);
  return status === "PAGO" ||
    PAID_GATEWAY_STATUSES.has(gatewayStatus) ||
    PAID_GATEWAY_STATUSES.has(asaasStatus);
};

const isReusablePendingReceivable = (receivable: any) => {
  const status = normalizeStatus(receivable?.status);
  const gatewayStatus = normalizeStatus(receivable?.gateway_status);
  const asaasStatus = normalizeStatus(receivable?.asaas_status);
  if (
    CANCELED_GATEWAY_STATUSES.has(gatewayStatus) ||
    CANCELED_GATEWAY_STATUSES.has(asaasStatus)
  ) {
    return false;
  }
  return OPEN_RECEIVABLE_STATUSES.has(status) &&
    Boolean(getPaymentUrl(receivable));
};

const isReceivablePastDue = (receivable: any) => {
  const dueDate = String(receivable?.data_vencimento || "").slice(0, 10);
  return Boolean(dueDate) && dueDate < todayIsoDate();
};

const getMatriculaTurma = (matricula: any) =>
  Array.isArray(matricula?.turmas) ? matricula.turmas[0] : matricula?.turmas;

const isEadMatricula = (matricula: any) =>
  normalizeStatus(getMatriculaTurma(matricula)?.cursos?.modalidade) === "EAD";

const chooseReceivable = (
  receivables: any[],
  matcher: (receivable: any) => boolean,
) => receivables.find(matcher) || null;

export const findExistingCourseCheckout = async (
  admin: any,
  alunoId: string,
  courseId: string,
  options: FindExistingCourseCheckoutOptions = {},
): Promise<ExistingCourseCheckout | null> => {
  const { data: matriculas, error: matriculasError } = await admin
    .from("matriculas")
    .select(`
      id,
      status,
      turma_id,
      data_matricula,
      turmas!inner(id, curso_id, nome, polo_id, status, cursos(id, modalidade))
    `)
    .eq("aluno_id", alunoId)
    .eq("turmas.curso_id", courseId)
    .order("data_matricula", { ascending: false });
  if (matriculasError) throw matriculasError;
  if (!matriculas?.length) return null;

  const matriculaIds = matriculas.map((matricula: any) => matricula.id).filter(
    Boolean,
  );
  const receivablesByMatricula = new Map<string, any[]>();
  if (matriculaIds.length > 0) {
    const { data: receivables, error: receivablesError } = await admin
      .from("contas_receber")
      .select(`
        id,
        matricula_id,
        status,
        gateway_provider,
        gateway_environment,
        gateway_payment_method,
        gateway_payment_id,
        gateway_payment_link_id,
        gateway_installment_id,
        gateway_installments,
        gateway_status,
        gateway_invoice_url,
        gateway_bank_slip_url,
        gateway_pix_payload,
        gateway_pix_encoded_image,
        gateway_transaction_receipt_url,
        asaas_status,
        asaas_payment_id,
        asaas_payment_link_id,
        asaas_installment_id,
        asaas_invoice_url,
        asaas_bank_slip_url,
        asaas_transaction_receipt_url,
        valor,
        forma_pagamento,
        data_vencimento,
        data_pagamento,
        updated_at,
        created_at
      `)
      .in("matricula_id", matriculaIds)
      .eq("tipo_lancamento", "MATRICULA")
      .order("created_at", { ascending: false });
    if (receivablesError) throw receivablesError;
    for (const receivable of receivables || []) {
      const current = receivablesByMatricula.get(receivable.matricula_id) || [];
      current.push(receivable);
      receivablesByMatricula.set(receivable.matricula_id, current);
    }
  }

  for (const matricula of matriculas) {
    const matriculaStatus = normalizeStatus(matricula.status);
    if (CLOSED_STATUSES.has(matriculaStatus)) continue;
    const receivables = receivablesByMatricula.get(matricula.id) || [];
    const paidReceivable = chooseReceivable(receivables, isPaidReceivable);
    if (ACCESS_STATUSES.has(matriculaStatus) || paidReceivable) {
      const receivable = paidReceivable || receivables[0] || null;
      return {
        state: "paid",
        matricula,
        turma: Array.isArray(matricula.turmas)
          ? matricula.turmas[0]
          : matricula.turmas,
        receivable,
        url: getPaymentUrl(receivable),
      };
    }
  }

  if (!options.ignorePending) {
    for (const matricula of matriculas) {
      const matriculaStatus = normalizeStatus(matricula.status);
      if (CLOSED_STATUSES.has(matriculaStatus)) continue;
      const receivables = receivablesByMatricula.get(matricula.id) || [];
      const isEad = isEadMatricula(matricula);
      const pendingReceivable = chooseReceivable(
        receivables,
        (receivable) =>
          isReusablePendingReceivable(receivable) &&
          (!isEad || !isReceivablePastDue(receivable)),
      );
      const hasFreshPendingMatricula = PENDING_STATUSES.has(matriculaStatus) &&
        (!isEad || receivables.length === 0 ||
          receivables.some((receivable) => !isReceivablePastDue(receivable)));
      if (hasFreshPendingMatricula || pendingReceivable) {
        const receivable = pendingReceivable || receivables[0] || null;
        return {
          state: "pending",
          matricula,
          turma: getMatriculaTurma(matricula),
          receivable,
          url: getPaymentUrl(receivable),
        };
      }
    }
  }

  return null;
};
