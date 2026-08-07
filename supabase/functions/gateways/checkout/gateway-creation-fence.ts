import type { GatewayProviderCode } from "../router.ts";
import {
  applyReceivableSnapshotFields,
  hasAmbiguousGatewaySubmission,
} from "./remote-title-guard.ts";

export const CHECKOUT_MUTABLE_RECEIVABLE_STATUSES = [
  "PENDENTE",
  "VENCIDO",
] as const;

const CHECKOUT_ATTEMPT_SNAPSHOT_FIELDS = [
  "status",
  "origem_pagamento",
  "updated_at",
  "gateway_creation_token",
  "gateway_provider",
  "gateway_environment",
  "gateway_payment_method",
  "gateway_status",
  "gateway_payment_id",
  "gateway_payment_link_id",
  "gateway_boleto_linha_digitavel",
  "gateway_boleto_codigo_barras",
  "gateway_boleto_nosso_numero",
  "gateway_submission_channel",
  "gateway_submission_status",
  "gateway_cnab_file_id",
  "asaas_status",
  "asaas_payment_id",
  "asaas_payment_link_id",
] as const;

export const applyCheckoutAttemptSnapshot = (
  query: any,
  receivable: any,
) =>
  applyReceivableSnapshotFields(
    query,
    receivable,
    CHECKOUT_ATTEMPT_SNAPSHOT_FIELDS,
  );

export const gatewayCreationLockFilter = (
  providerCode: GatewayProviderCode,
  staleCreatingBefore: string,
) =>
  providerCode === "asaas"
    ? "gateway_status.is.null,gateway_status.neq.CREATING"
    : `gateway_status.is.null,gateway_status.neq.CREATING,updated_at.lt.${staleCreatingBefore}`;

export const claimExistingGatewayCheckout = async (input: {
  admin: any;
  receivable: any;
  receivablePayload: Record<string, unknown>;
  providerCode: GatewayProviderCode;
  attemptToken: string;
  claimedAt?: string;
  staleCreatingBefore?: string;
}) => {
  const claimedAt = input.claimedAt || new Date().toISOString();
  const staleCreatingBefore = input.staleCreatingBefore ||
    new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const isAsaas = input.providerCode === "asaas";
  // API_AMBIGUOUS significa que o POST remoto pode ter sido aceito sem que a
  // identidade tenha sido persistida localmente. Esse estado nunca expira
  // para uma nova emissao: somente uma reconciliacao canonica/manual pode
  // alterar o snapshot e liberar outra tentativa.
  if (hasAmbiguousGatewaySubmission(input.receivable)) return null;
  const snapshotHasAsaasCreationInProgress = isAsaas && [
    input.receivable?.gateway_status,
    input.receivable?.asaas_status,
  ].some((value) => String(value || "").toUpperCase() === "CREATING");
  if (snapshotHasAsaasCreationInProgress) return null;

  let query = input.admin
    .from("contas_receber")
    .update({
      ...input.receivablePayload,
      gateway_status: "CREATING",
      gateway_creation_token: input.attemptToken,
      gateway_last_error: null,
      ...(isAsaas
        ? {
          asaas_status: "CREATING",
          asaas_last_error: null,
        }
        : {}),
      updated_at: claimedAt,
    })
    .eq("id", input.receivable.id)
    .in("status", [...CHECKOUT_MUTABLE_RECEIVABLE_STATUSES])
    .or(gatewayCreationLockFilter(input.providerCode, staleCreatingBefore));
  query = applyCheckoutAttemptSnapshot(query, input.receivable);

  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  return data || null;
};

export const gatewayAttemptIsOwned = (
  receivable: any,
  attemptToken: string,
) =>
  Boolean(
    attemptToken &&
      receivable?.gateway_creation_token === attemptToken &&
      String(receivable?.gateway_status || "").toUpperCase() === "CREATING" &&
      CHECKOUT_MUTABLE_RECEIVABLE_STATUSES.includes(
        String(receivable?.status || "")
          .toUpperCase() as (typeof CHECKOUT_MUTABLE_RECEIVABLE_STATUSES)[
            number
          ],
      ),
  );
