import type { GatewayWebhookContext } from "../../types.ts";
import {
  asRecord,
  firstString,
  MERCADO_PAGO_WEBHOOK_PROVIDER_CODE,
} from "./shared.ts";

export type PaymentValidationInput = {
  environment: GatewayWebhookContext["environment"];
  receivable: Record<string, unknown>;
  payment: Record<string, unknown>;
  merchantId?: string | null;
};

const booleanValue = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
};

const moneyInCents = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 1e-7) return null;
  return cents;
};

export const configuredMercadoPagoMerchantId = async (
  context: GatewayWebhookContext,
) => {
  const { data, error } = await context.admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", MERCADO_PAGO_WEBHOOK_PROVIDER_CODE)
    .eq("environment", context.environment)
    .maybeSingle();
  if (error) throw error;

  const metadata = asRecord(data?.metadata);
  return firstString(metadata.merchantId, metadata.merchant_id) || null;
};

export const assertMercadoPagoPaymentMatches = (
  input: PaymentValidationInput,
) => {
  const receivableId = firstString(input.receivable.id);
  const externalReference = firstString(input.payment.external_reference);
  if (
    !receivableId || !externalReference ||
    externalReference.toLowerCase() !== receivableId.toLowerCase()
  ) {
    throw new Error(
      "Pagamento Mercado Pago com external_reference divergente do recebivel.",
    );
  }

  const expectedCents = moneyInCents(input.receivable.valor);
  const paidCents = moneyInCents(input.payment.transaction_amount);
  if (
    expectedCents === null || paidCents === null ||
    paidCents !== expectedCents
  ) {
    throw new Error(
      "Pagamento Mercado Pago com valor divergente do recebivel.",
    );
  }

  const currency = firstString(input.payment.currency_id).toUpperCase();
  if (currency !== "BRL") {
    throw new Error(
      "Pagamento Mercado Pago em moeda diferente de BRL.",
    );
  }

  const liveMode = booleanValue(input.payment.live_mode);
  const expectedLiveMode = input.environment === "production";
  if (liveMode === null || liveMode !== expectedLiveMode) {
    throw new Error(
      "Pagamento Mercado Pago em ambiente diferente do webhook configurado.",
    );
  }

  const configuredMerchantId = firstString(input.merchantId);
  if (!configuredMerchantId) {
    throw new Error(
      "Pagamento Mercado Pago nao pode ser processado sem merchantId configurado.",
    );
  }

  const collector = asRecord(input.payment.collector);
  const collectorId = firstString(
    input.payment.collector_id,
    collector.id,
  );
  if (!collectorId || collectorId !== configuredMerchantId) {
    throw new Error(
      "Pagamento Mercado Pago para collector_id diferente da credencial configurada.",
    );
  }
};
