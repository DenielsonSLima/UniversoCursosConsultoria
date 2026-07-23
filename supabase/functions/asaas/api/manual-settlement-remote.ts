import { cancelBaneseReceivableBeforeManualSettlement } from "../../gateways/api/banese-cancellation.ts";
import {
  assertMercadoPagoManualSettlementAllowed,
  assertNoActiveCnabSubmission,
  hasRemoteTitleReference,
} from "../../gateways/checkout/remote-title-guard.ts";
import type {
  AsaasRuntime,
  ManualSettlementServiceDependencies,
} from "./manual-settlement.types.ts";

const normalized = (value: unknown) => String(value || "").trim().toUpperCase();

const PAID_REMOTE_STATUSES = new Set([
  "PAID",
  "PAGO",
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "LIQUIDATED",
  "REFUND_REQUESTED",
  "REFUNDED",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

const CANCELED_REMOTE_STATUSES = new Set([
  "DELETED",
  "CANCELED",
  "CANCELLED",
  "EXPIRED",
  "INACTIVE",
]);

const ASAAS_CANCELLABLE_STATUSES = new Set([
  "PENDING",
  "OVERDUE",
]);

const responsePayload = async (response: Response) => {
  if (response.status === 204) return null;
  return await response.json().catch(() => null);
};

const providerError = (payload: any, fallback: string) =>
  payload?.errors?.map((item: any) => item?.description).filter(Boolean)
    .join(" ") || payload?.message || fallback;

const asaasFetch = (
  fetcher: typeof fetch,
  runtime: AsaasRuntime,
  path: string,
  init: RequestInit = {},
) =>
  fetcher(`${runtime.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Universo-Cursos-Gestao",
      access_token: runtime.apiKey,
      ...(init.headers || {}),
    },
  });

const assertNotPaid = (status: unknown, provider = "Asaas") => {
  if (PAID_REMOTE_STATUSES.has(normalized(status))) {
    throw new Error(
      `O ${provider} já registrou pagamento ou movimentação financeira neste título. A baixa manual foi bloqueada para evitar duplicidade.`,
    );
  }
};

const confirmAsaasPaymentCanceled = async (
  fetcher: typeof fetch,
  runtime: AsaasRuntime,
  paymentId: string,
) => {
  const confirmation = await asaasFetch(
    fetcher,
    runtime,
    `/payments/${paymentId}`,
  );
  if (confirmation.status === 404) return;
  const payload = await responsePayload(confirmation);
  if (!confirmation.ok) {
    throw new Error(providerError(
      payload,
      `Não foi possível confirmar o cancelamento Asaas (${confirmation.status}).`,
    ));
  }
  assertNotPaid(payload?.status);
  if (!CANCELED_REMOTE_STATUSES.has(normalized(payload?.status))) {
    throw new Error(
      "O Asaas não confirmou o título como cancelado. A baixa local não foi registrada e exige revisão.",
    );
  }
};

const cancelAsaasPayment = async (
  fetcher: typeof fetch,
  runtime: AsaasRuntime,
  receivable: any,
) => {
  const paymentId = String(receivable.asaas_payment_id || "").trim();
  if (!paymentId) return false;

  const lookup = await asaasFetch(fetcher, runtime, `/payments/${paymentId}`);
  const current = await responsePayload(lookup);
  if (lookup.status === 404) {
    if (normalized(receivable.asaas_status) === "DELETED") return true;
    throw new Error(
      "Cobrança Asaas não encontrada no ambiente original. Reconcilie o título antes de registrar a baixa manual.",
    );
  }
  if (!lookup.ok) {
    throw new Error(providerError(
      current,
      `Erro ${lookup.status} ao consultar cobrança no Asaas.`,
    ));
  }

  const currentStatus = normalized(current?.status);
  assertNotPaid(currentStatus);
  if (CANCELED_REMOTE_STATUSES.has(currentStatus)) return true;
  if (!ASAAS_CANCELLABLE_STATUSES.has(currentStatus)) {
    throw new Error(
      `Cobrança Asaas na situação ${
        currentStatus || "DESCONHECIDA"
      }; o cancelamento automático foi bloqueado para revisão.`,
    );
  }

  const deletion = await asaasFetch(
    fetcher,
    runtime,
    `/payments/${paymentId}`,
    { method: "DELETE" },
  );
  const deletionPayload = await responsePayload(deletion);
  if (!deletion.ok && deletion.status !== 404) {
    throw new Error(providerError(
      deletionPayload,
      `Erro ${deletion.status} ao cancelar cobrança no Asaas.`,
    ));
  }
  await confirmAsaasPaymentCanceled(fetcher, runtime, paymentId);
  return true;
};

const cancelAsaasPaymentLink = async (
  fetcher: typeof fetch,
  runtime: AsaasRuntime,
  receivable: any,
) => {
  const paymentLinkId = String(receivable.asaas_payment_link_id || "").trim();
  if (!paymentLinkId) return false;

  const lookup = await asaasFetch(
    fetcher,
    runtime,
    `/paymentLinks/${paymentLinkId}`,
  );
  const current = await responsePayload(lookup);
  if (lookup.status === 404) {
    if (normalized(receivable.asaas_status) === "DELETED") return true;
    throw new Error(
      "Link Asaas não encontrado no ambiente original. Reconcilie o vínculo antes da baixa manual.",
    );
  }
  if (!lookup.ok) {
    throw new Error(providerError(
      current,
      `Erro ${lookup.status} ao consultar link no Asaas.`,
    ));
  }

  const deletion = await asaasFetch(
    fetcher,
    runtime,
    `/paymentLinks/${paymentLinkId}`,
    { method: "DELETE" },
  );
  const deletionPayload = await responsePayload(deletion);
  if (!deletion.ok && deletion.status !== 404) {
    throw new Error(providerError(
      deletionPayload,
      `Erro ${deletion.status} ao remover link no Asaas.`,
    ));
  }

  const confirmation = await asaasFetch(
    fetcher,
    runtime,
    `/paymentLinks/${paymentLinkId}`,
  );
  if (confirmation.status === 404) return true;
  const confirmationPayload = await responsePayload(confirmation);
  if (!confirmation.ok) {
    throw new Error(providerError(
      confirmationPayload,
      `Não foi possível confirmar a exclusão do link Asaas (${confirmation.status}).`,
    ));
  }
  if (!CANCELED_REMOTE_STATUSES.has(normalized(confirmationPayload?.status))) {
    throw new Error(
      "O link Asaas continua apto a receber pagamento. A baixa manual foi bloqueada para revisão.",
    );
  }
  return true;
};

export interface ManualSettlementRemoteCancellation {
  required: boolean;
  providerCode: string | null;
  environment: "sandbox" | "production" | null;
  remotePaymentId: string | null;
  remotePaymentLinkId: string | null;
  receivable: any;
  asaasPaymentCanceled: boolean;
  asaasPaymentLinkCanceled: boolean;
  baneseCanceled: boolean;
}

export const cancelRemoteTitleBeforeManualSettlement = async (
  dependencies: Pick<
    ManualSettlementServiceDependencies,
    | "admin"
    | "getAsaasRuntime"
    | "fetcher"
    | "cancelBanese"
  >,
  receivable: any,
): Promise<ManualSettlementRemoteCancellation> => {
  assertNoActiveCnabSubmission(receivable);
  assertMercadoPagoManualSettlementAllowed(receivable);

  const providerCode = String(receivable?.gateway_provider || "")
    .trim()
    .toLowerCase() ||
    (receivable?.asaas_payment_id || receivable?.asaas_payment_link_id
      ? "asaas"
      : null);
  const required = hasRemoteTitleReference(receivable);
  const base = {
    required,
    providerCode,
    environment: null,
    remotePaymentId: null,
    remotePaymentLinkId: null,
    receivable,
    asaasPaymentCanceled: false,
    asaasPaymentLinkCanceled: false,
    baneseCanceled: false,
  } satisfies ManualSettlementRemoteCancellation;

  if (!required) return base;

  if (providerCode === "banese_card") {
    const cancellation = await (
      dependencies.cancelBanese ??
        cancelBaneseReceivableBeforeManualSettlement
    )(dependencies.admin, receivable);
    return {
      ...base,
      environment: receivable.gateway_environment,
      remotePaymentId: cancellation.remotePaymentId,
      receivable: cancellation.receivable,
      baneseCanceled: true,
    };
  }

  if (providerCode === "asaas") {
    const runtime = await dependencies.getAsaasRuntime(receivable);
    const fetcher = dependencies.fetcher ?? fetch;
    const [asaasPaymentCanceled, asaasPaymentLinkCanceled] = await Promise.all([
      cancelAsaasPayment(fetcher, runtime, receivable),
      cancelAsaasPaymentLink(fetcher, runtime, receivable),
    ]);
    return {
      ...base,
      environment: runtime.environment,
      remotePaymentId: receivable.asaas_payment_id || null,
      remotePaymentLinkId: receivable.asaas_payment_link_id || null,
      asaasPaymentCanceled,
      asaasPaymentLinkCanceled,
    };
  }

  throw new Error(
    "A cobrança possui título remoto sem cancelador oficial homologado. A baixa manual foi bloqueada para revisão.",
  );
};

export const assertNoKnownRemotePayment = (receivable: any) => {
  for (const status of [receivable?.asaas_status, receivable?.gateway_status]) {
    assertNotPaid(status, "provedor bancário");
  }
};
