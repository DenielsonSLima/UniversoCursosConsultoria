const ACCESS_STATUSES = new Set(["ATIVO", "TRANCADO", "CONCLUIDO"]);
const PENDING_STATUSES = new Set(["PENDENTE", "AGUARDANDO_PAGAMENTO", "AGUARDANDO_CONFIRMACAO"]);
const CLOSED_STATUSES = new Set(["CANCELADO", "DESISTENTE", "TRANSFERIDO"]);
const PAID_ASAAS_STATUSES = new Set(["RECEIVED", "CONFIRMED"]);
const CANCELED_ASAAS_STATUSES = new Set(["DELETED", "REFUNDED", "CANCELLED", "CANCELED"]);
const OPEN_RECEIVABLE_STATUSES = new Set(["PENDENTE", "VENCIDO", "AGUARDANDO_CONFIRMACAO"]);

export type ExistingCourseCheckoutState = "paid" | "pending";

export interface ExistingCourseCheckout {
  state: ExistingCourseCheckoutState;
  matricula: any;
  turma: any;
  receivable: any | null;
  url: string | null;
}

const normalizeStatus = (status: unknown) => String(status || "").trim().toUpperCase();

const getPaymentUrl = (receivable: any) =>
  receivable?.asaas_invoice_url || receivable?.asaas_bank_slip_url || null;

const isPaidReceivable = (receivable: any) => {
  const status = normalizeStatus(receivable?.status);
  const asaasStatus = normalizeStatus(receivable?.asaas_status);
  return status === "PAGO" || PAID_ASAAS_STATUSES.has(asaasStatus);
};

const isReusablePendingReceivable = (receivable: any) => {
  const status = normalizeStatus(receivable?.status);
  const asaasStatus = normalizeStatus(receivable?.asaas_status);
  if (CANCELED_ASAAS_STATUSES.has(asaasStatus)) return false;
  return OPEN_RECEIVABLE_STATUSES.has(status) && Boolean(getPaymentUrl(receivable));
};

const chooseReceivable = (receivables: any[], matcher: (receivable: any) => boolean) =>
  receivables.find(matcher) || null;

export const findExistingCourseCheckout = async (
  admin: any,
  alunoId: string,
  courseId: string,
): Promise<ExistingCourseCheckout | null> => {
  const { data: matriculas, error: matriculasError } = await admin
    .from("matriculas")
    .select(`
      id,
      status,
      turma_id,
      data_matricula,
      turmas!inner(id, curso_id, nome, polo_id, status)
    `)
    .eq("aluno_id", alunoId)
    .eq("turmas.curso_id", courseId)
    .order("data_matricula", { ascending: false });
  if (matriculasError) throw matriculasError;
  if (!matriculas?.length) return null;

  const matriculaIds = matriculas.map((matricula: any) => matricula.id).filter(Boolean);
  const receivablesByMatricula = new Map<string, any[]>();
  if (matriculaIds.length > 0) {
    const { data: receivables, error: receivablesError } = await admin
      .from("contas_receber")
      .select(`
        id,
        matricula_id,
        status,
        asaas_status,
        asaas_payment_id,
        asaas_payment_link_id,
        asaas_invoice_url,
        asaas_bank_slip_url,
        asaas_transaction_receipt_url,
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
        turma: Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas,
        receivable,
        url: getPaymentUrl(receivable),
      };
    }
  }

  for (const matricula of matriculas) {
    const matriculaStatus = normalizeStatus(matricula.status);
    if (CLOSED_STATUSES.has(matriculaStatus)) continue;
    const receivables = receivablesByMatricula.get(matricula.id) || [];
    const pendingReceivable = chooseReceivable(receivables, isReusablePendingReceivable);
    if (PENDING_STATUSES.has(matriculaStatus) || pendingReceivable) {
      const receivable = pendingReceivable || receivables[0] || null;
      return {
        state: "pending",
        matricula,
        turma: Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas,
        receivable,
        url: getPaymentUrl(receivable),
      };
    }
  }

  return null;
};
