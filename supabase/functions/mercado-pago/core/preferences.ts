import {
  MERCADO_PAGO_CHECKOUT_PREFERENCES_URL,
  MERCADO_PAGO_PROVIDER_CODE,
} from "./constants.ts";
import { MercadoPagoAdapterError } from "./errors.ts";
import { getMercadoPagoAccessToken } from "./auth.ts";
import type {
  AdapterCreateChargeInput,
  AdapterCreateChargeResult,
  PaymentMethod,
} from "./types.ts";
import {
  asRecord,
  firstString,
  mercadoPagoWebhookUrl,
  payerIdentification,
  payerNameParts,
  readResponseBody,
  stringValue,
} from "./utils.ts";
import {
  assertAmount,
  assertEnvironment,
  assertPaymentMethod,
  normalizeInstallments,
} from "./validators.ts";

export const paymentMethodOptions = (
  paymentMethod: PaymentMethod,
  installments?: number | null,
) => {
  // Checkout Pro does not allow excluding account_money. Keep method filtering
  // limited to payment types the Mercado Pago API accepts in preferences.
  if (paymentMethod === "PIX") {
    return {
      payment_methods: {
        excluded_payment_types: [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "prepaid_card" },
          { id: "ticket" },
          { id: "atm" },
        ],
        installments: 1,
        default_installments: 1,
      },
    };
  }

  if (paymentMethod === "CREDIT_CARD") {
    const cardInstallments = normalizeInstallments(installments);
    return {
      payment_methods: {
        excluded_payment_types: [
          { id: "debit_card" },
          { id: "prepaid_card" },
          { id: "ticket" },
          { id: "bank_transfer" },
          { id: "atm" },
        ],
        installments: cardInstallments,
        default_installments: cardInstallments,
      },
    };
  }

  if (paymentMethod === "BOLETO") {
    return {
      payment_methods: {
        excluded_payment_types: [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "prepaid_card" },
          { id: "bank_transfer" },
          { id: "atm" },
        ],
      },
    };
  }

  return {};
};

export const buildMercadoPagoPreferencePayload = (
  input: AdapterCreateChargeInput,
) => {
  assertEnvironment(input.environment);
  assertPaymentMethod(input.paymentMethod);
  assertAmount(input.amount);

  const description = stringValue(input.description);
  if (!description) {
    throw new MercadoPagoAdapterError(
      "Descricao da cobranca Mercado Pago e obrigatoria.",
    );
  }

  const payer = input.payer || {};
  const { firstName, lastName } = payerNameParts(payer);
  const externalReference = firstString(
    input.receivable?.id,
    input.receivable?.externalReference,
    input.receivable?.external_reference,
  );
  const email = firstString(payer.email);
  const identification = payerIdentification(payer);
  const backUrls = {
    success: firstString(input.successUrl),
    failure: firstString(input.failureUrl),
    pending: firstString(input.pendingUrl),
  };
  const hasBackUrls = Boolean(
    backUrls.success || backUrls.failure || backUrls.pending,
  );

  return {
    external_reference: externalReference || undefined,
    notification_url: mercadoPagoWebhookUrl(input.supabaseUrl, input.environment),
    back_urls: hasBackUrls ? backUrls : undefined,
    auto_return: backUrls.success ? "approved" : undefined,
    items: [
      {
        id: externalReference || undefined,
        title: description.slice(0, 255),
        description,
        quantity: 1,
        unit_price: Number(input.amount.toFixed(2)),
        currency_id: "BRL",
      },
    ],
    payer: {
      email: email || undefined,
      name: firstName,
      surname: lastName,
      identification,
    },
    metadata: {
      provider_code: MERCADO_PAGO_PROVIDER_CODE,
      environment: input.environment,
      payment_method: input.paymentMethod,
      receivable_id: externalReference || undefined,
      due_date: input.dueDate || undefined,
    },
    ...paymentMethodOptions(input.paymentMethod, input.installments),
  };
};

export const createMercadoPagoPreference = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  const accessToken = await getMercadoPagoAccessToken(
    input.admin,
    input.environment,
    input,
  );
  const payload = buildMercadoPagoPreferencePayload(input);

  const response = await fetch(MERCADO_PAGO_CHECKOUT_PREFERENCES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new MercadoPagoAdapterError(
      `Mercado Pago recusou a criacao da preferencia (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const rawRecord = asRecord(raw);
  const id = stringValue(rawRecord.id);
  if (!id) {
    throw new MercadoPagoAdapterError(
      "Mercado Pago retornou preferencia sem id.",
    );
  }

  return {
    id,
    link: firstString(
      input.environment === "sandbox"
        ? rawRecord.sandbox_init_point
        : undefined,
      rawRecord.init_point,
      rawRecord.sandbox_init_point,
    ) || null,
    status: firstString(rawRecord.status, "created"),
    raw,
  };
};

export const createMercadoPagoCharge = createMercadoPagoPreference;
