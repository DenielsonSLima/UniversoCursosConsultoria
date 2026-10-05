import type { EadCheckoutContext } from "./types.ts";
import { UUID_RE, publicBaseUrl } from "./utils.ts";

export type EadCheckoutAttempt = {
  action: "CREATE" | "REUSE" | "AWAITING_CONFIRMATION" | "ALREADY_PAID" | "REVIEW";
  attemptId: string | null;
  matriculaId: string;
  receivableId: string | null;
  inscricaoId: string | null;
  creationToken: string | null;
  receivable: any | null;
};

export const parseEadCheckoutAttempt = (value: any): EadCheckoutAttempt => {
  const actions = ["CREATE", "REUSE", "AWAITING_CONFIRMATION", "ALREADY_PAID", "REVIEW"];
  if (!value || !actions.includes(value.action) || !UUID_RE.test(value.matriculaId || "")) {
    throw new Error("A reserva da compra EAD retornou uma identidade inválida.");
  }
  for (const key of ["attemptId", "receivableId", "inscricaoId", "creationToken"]) {
    if (value[key] != null && !UUID_RE.test(value[key])) {
      throw new Error("A reserva da compra EAD retornou uma identidade inválida.");
    }
  }
  if (["CREATE", "REUSE"].includes(value.action)) {
    if (!value.attemptId || !value.receivableId || !value.inscricaoId ||
      value.receivable?.id !== value.receivableId ||
      value.receivable?.matricula_id !== value.matriculaId ||
      value.receivable?.ead_checkout_attempt_id !== value.attemptId ||
      !Number.isFinite(Number(value.receivable?.valor)) || Number(value.receivable.valor) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}/.test(String(value.receivable?.data_vencimento || ""))) {
      throw new Error("A tentativa EAD não corresponde à cobrança reservada.");
    }
  }
  if (value.action === "CREATE" && (!value.creationToken ||
    value.receivable?.gateway_creation_token !== value.creationToken ||
    value.receivable?.gateway_status !== "CREATING")) {
    throw new Error("A nova compra EAD não possui uma reserva exclusiva de emissão.");
  }
  if (value.action !== "CREATE" && value.creationToken) {
    throw new Error("A tentativa EAD existente não autoriza outra emissão.");
  }
  return { ...value, receivable: value.receivable || null };
};

export const prepareEadCheckoutAttempt = async (
  context: Omit<EadCheckoutContext, "matricula" | "checkoutAttempt">,
) => {
  const requestId = String(context.body.requestId || crypto.randomUUID());
  if (!UUID_RE.test(requestId)) throw new Error("Identificador da compra inválido.");
  const { data, error } = await context.admin.rpc("ead_prepare_checkout_attempt", {
    p_aluno_id: context.aluno.id,
    p_turma_id: context.turma.id,
    p_request_id: requestId,
    p_provider: context.route.providerCode,
    p_environment: context.environment,
    p_payment_method: context.charge.method,
    p_amount: context.charge.value,
    p_due_date: context.charge.dueDate,
    p_description: context.charge.description,
    p_fee_value: null,
    p_net_value: null,
  });
  if (error) throw error;
  const attempt = parseEadCheckoutAttempt(data);
  const targetedId = String(context.body.receivableId || "");
  if (targetedId && targetedId !== attempt.receivableId) {
    throw new Error("Esta cobrança pertence ao histórico. Atualize a compra atual antes de pagar.");
  }
  return attempt;
};

export const blockedEadCheckoutResponse = (context: EadCheckoutContext) => {
  const attempt = context.checkoutAttempt;
  if (!attempt || ["CREATE", "REUSE"].includes(attempt.action)) return null;
  return {
    response: {
      url: `${publicBaseUrl()}/aluno`,
      matriculaId: attempt.matriculaId,
      receivableId: attempt.receivableId,
      attemptId: attempt.attemptId,
      alreadyPaid: attempt.action === "ALREADY_PAID",
      awaitingConfirmation: attempt.action === "AWAITING_CONFIRMATION",
      paymentReviewRequired: attempt.action === "REVIEW",
    },
    createdRemotePayment: false,
    receivableId: attempt.receivableId,
  };
};

export const bindEadCheckoutAttempt = async (context: EadCheckoutContext, receivable: any) => {
  const attempt = context.checkoutAttempt;
  if (!attempt?.attemptId) return;
  const { data: transaction, error: transactionError } = await context.admin
    .from("payment_gateway_transactions").select("id")
    .eq("receivable_id", receivable.id)
    .eq("provider_code", receivable.gateway_provider)
    .eq("environment", receivable.gateway_environment)
    .eq("remote_payment_id", receivable.gateway_payment_id)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction?.id) throw new Error("A compra EAD aguarda o vínculo bancário canônico.");
  const { data, error } = await context.admin.rpc("ead_bind_checkout_attempt", {
    p_attempt_id: attempt.attemptId,
    p_receivable_id: receivable.id,
    p_transaction_id: transaction.id,
    p_inscription_id: attempt.inscricaoId,
  });
  if (error) throw error;
  if (data?.attemptId !== attempt.attemptId || data?.receivableId !== receivable.id ||
    data?.inscricaoId !== attempt.inscricaoId || data?.transactionId !== transaction.id ||
    !["OPEN", "PAYMENT_RECOVERY_FENCED"].includes(data?.state)) {
    throw new Error("A compra EAD aguarda revisão do vínculo bancário.");
  }
  if (data.state === "PAYMENT_RECOVERY_FENCED") {
    context.checkoutAttempt = { ...attempt, action: "REVIEW", creationToken: null };
  }
};

export const validateEadCheckoutIssuance = async (context: EadCheckoutContext, receivable: any) => {
  const attempt = context.checkoutAttempt;
  if (!attempt?.attemptId) return;
  const { data, error } = await context.admin.rpc("ead_validate_checkout_attempt_for_issuance", {
    p_attempt_id: attempt.attemptId,
    p_receivable_id: receivable.id,
    p_creation_token: attempt.creationToken,
  });
  if (error) throw error;
  if (data?.allowed !== true) throw new Error("A compra aguarda confirmação do pagamento anterior. Nenhum novo boleto foi emitido.");
};

export const issueReservedEadCheckout = async <T>(
  context: EadCheckoutContext,
  receivable: any,
  emit: () => Promise<T>,
) => {
  try {
    await validateEadCheckoutIssuance(context, receivable);
  } catch (error) {
    const blocked = error instanceof Error ? error : new Error(String((error as any)?.message || error));
    Object.assign(blocked, { eadCheckoutIssuanceBlocked: true });
    throw blocked;
  }
  return await emit();
};
