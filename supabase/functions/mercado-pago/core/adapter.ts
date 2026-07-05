export const MERCADO_PAGO_PROVIDER_CODE = "mercado_pago" as const;

export type Environment = "sandbox" | "production";
export type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";

export type SupabaseAdminRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type AdapterPayer = Record<string, unknown> & {
  name?: string | null;
  nome?: string | null;
  email?: string | null;
  cpfCnpj?: string | null;
  cpf_cnpj?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
};

export type AdapterReceivable = Record<string, unknown> & {
  id?: string | number | null;
};

export type AdapterCreateChargeInput = {
  admin: SupabaseAdminRpcClient;
  supabaseUrl: string;
  environment: Environment;
  paymentMethod: PaymentMethod;
  receivable: AdapterReceivable;
  payer: AdapterPayer;
  description: string;
  amount: number;
  dueDate?: string | null;
};

export type AdapterCreateChargeResult = {
  id: string;
  link: string | null;
  status: string;
  raw: unknown;
};

export class MercadoPagoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoAdapterError";
  }
}

export class MercadoPagoAdapterNotImplementedError extends Error {
  constructor(feature: string) {
    super(`Adapter Mercado Pago ainda nao implementado para ${feature}.`);
    this.name = "MercadoPagoAdapterNotImplementedError";
  }
}

const MERCADO_PAGO_CHECKOUT_PREFERENCES_URL =
  "https://api.mercadopago.com/checkout/preferences";

const secretName = (environment: Environment, kind: string) =>
  `payment_gateway_${MERCADO_PAGO_PROVIDER_CODE}_${environment}_${kind}`;

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const stringValue = (value: unknown) => String(value ?? "").trim();

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return "";
};

const onlyDigits = (value: unknown) => stringValue(value).replace(/\D/g, "");

const assertEnvironment = (environment: Environment) => {
  if (environment !== "sandbox" && environment !== "production") {
    throw new MercadoPagoAdapterError("Ambiente Mercado Pago invalido.");
  }
};

const assertPaymentMethod = (paymentMethod: PaymentMethod) => {
  if (
    paymentMethod !== "PIX" &&
    paymentMethod !== "BOLETO" &&
    paymentMethod !== "CREDIT_CARD"
  ) {
    throw new MercadoPagoAdapterError("Forma de pagamento Mercado Pago invalida.");
  }
};

const assertAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MercadoPagoAdapterError("Valor da cobranca Mercado Pago deve ser maior que zero.");
  }
};

const readResponseBody = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const endpointUrl = (baseSupabaseUrl: string, providerCode: string, environment: Environment) => {
  const normalizedBase = baseSupabaseUrl.replace(/\/+$/, "");
  return `${normalizedBase}/functions/v1/payment-gateway-webhook/${providerCode}?environment=${environment}`;
};

const payerNameParts = (payer: AdapterPayer) => {
  const fullName = firstString(payer.name, payer.nome);
  const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
  };
};

const payerIdentification = (payer: AdapterPayer) => {
  const document = onlyDigits(
    payer.cpfCnpj ?? payer.cpf_cnpj ?? payer.cpf ?? payer.cnpj,
  );
  if (!document) return undefined;
  return {
    type: document.length > 11 ? "CNPJ" : "CPF",
    number: document,
  };
};

export const getMercadoPagoAccessToken = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
) => {
  assertEnvironment(environment);
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name: secretName(environment, "access_token"),
  });
  if (error) throw error;
  const accessToken = stringValue(data);
  if (!accessToken) {
    throw new MercadoPagoAdapterError(
      `Access token do Mercado Pago nao configurado para ${environment}.`,
    );
  }
  return accessToken;
};

export const buildMercadoPagoPreferencePayload = (input: AdapterCreateChargeInput) => {
  assertEnvironment(input.environment);
  assertPaymentMethod(input.paymentMethod);
  assertAmount(input.amount);

  const description = stringValue(input.description);
  if (!description) {
    throw new MercadoPagoAdapterError("Descricao da cobranca Mercado Pago e obrigatoria.");
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

  return {
    external_reference: externalReference || undefined,
    notification_url: endpointUrl(
      input.supabaseUrl,
      MERCADO_PAGO_PROVIDER_CODE,
      input.environment,
    ),
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
  };
};

export const createMercadoPagoPreference = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  const accessToken = await getMercadoPagoAccessToken(input.admin, input.environment);
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
    throw new MercadoPagoAdapterError("Mercado Pago retornou preferencia sem id.");
  }

  return {
    id,
    link: firstString(
      input.environment === "sandbox" ? rawRecord.sandbox_init_point : undefined,
      rawRecord.init_point,
      rawRecord.sandbox_init_point,
    ) || null,
    status: firstString(rawRecord.status, "created"),
    raw,
  };
};

export const createMercadoPagoCharge = createMercadoPagoPreference;

export const requireMercadoPagoAdapter = (feature: string): never => {
  throw new MercadoPagoAdapterNotImplementedError(feature);
};
