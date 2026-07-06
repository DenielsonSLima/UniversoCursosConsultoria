import { isValidCpf, onlyDigits } from "./customer.ts";
import { callAsaas } from "./http.ts";
import {
  apiSecretName,
  baseUrlFor,
  normalizeEnvironment,
  type AsaasRuntime,
  type Environment,
} from "./runtime.ts";

export const ASAAS_PROVIDER_CODE = "asaas" as const;

export type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";

export type AdapterPayer = Record<string, unknown> & {
  id?: string | null;
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
  admin: any;
  environment: Environment;
  paymentMethod: PaymentMethod;
  receivable: AdapterReceivable;
  payer: AdapterPayer;
  description: string;
  amount: number;
  dueDate?: string | null;
  installments?: number | null;
  successUrl?: string | null;
};

export type AdapterCreateChargeResult = {
  id: string;
  link: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  customer: string | null;
  installmentId: string | null;
  transactionReceiptUrl: string | null;
  status: string;
  raw: unknown;
};

export class AsaasAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsaasAdapterError";
  }
}

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const roundMoney = (value: unknown) => {
  const parsed = Number(value || 0);
  return Math.round((Number.isFinite(parsed) ? parsed : 0) * 100) / 100;
};

const assertAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AsaasAdapterError("Valor da cobranca Asaas deve ser maior que zero.");
  }
};

const assertPaymentMethod = (paymentMethod: PaymentMethod) => {
  if (
    paymentMethod !== "PIX" &&
    paymentMethod !== "BOLETO" &&
    paymentMethod !== "CREDIT_CARD"
  ) {
    throw new AsaasAdapterError("Forma de pagamento Asaas invalida.");
  }
};

const normalizeInstallments = (value: unknown) => {
  const parsed = Number(value || 1);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new AsaasAdapterError("Quantidade de parcelas Asaas invalida.");
  }
  if (parsed > 21) {
    throw new AsaasAdapterError("Asaas aceita no maximo 21 parcelas nesta integracao.");
  }
  return parsed;
};

const payerName = (payer: AdapterPayer) =>
  firstString(payer.name, payer.nome);

const payerDocument = (payer: AdapterPayer) =>
  onlyDigits(payer.cpfCnpj ?? payer.cpf_cnpj ?? payer.cpf ?? payer.cnpj);

const assertPayer = (payer: AdapterPayer) => {
  const name = payerName(payer);
  const document = payerDocument(payer);
  if (!name) throw new AsaasAdapterError("Pagador Asaas deve ter nome.");
  if (!document) throw new AsaasAdapterError("Pagador Asaas deve ter CPF/CNPJ.");
  if (document.length === 11 && !isValidCpf(document)) {
    throw new AsaasAdapterError("CPF invalido para cobranca Asaas.");
  }
  if (document.length !== 11 && document.length !== 14) {
    throw new AsaasAdapterError("CPF/CNPJ invalido para cobranca Asaas.");
  }
};

export const getAsaasApiKey = async (
  admin: any,
  environment: Environment,
) => {
  const { data, error } = await admin.rpc("asaas_get_secret", {
    p_secret_name: apiSecretName(environment),
  });
  if (error) throw error;
  const apiKey = firstString(data);
  if (!apiKey) {
    throw new AsaasAdapterError(`Chave Asaas nao configurada para ${environment}.`);
  }
  return apiKey;
};

const resolveRuntime = async (
  admin: any,
  environment: Environment,
): Promise<AsaasRuntime> => {
  const normalizedEnvironment = normalizeEnvironment(environment);
  return {
    apiKey: await getAsaasApiKey(admin, normalizedEnvironment),
    environment: normalizedEnvironment,
    baseUrl: baseUrlFor(normalizedEnvironment),
  };
};

const notificationsDisabled = async (admin: any) => {
  const { data } = await admin
    .from("asaas_config")
    .select("notifications_enabled, notification_whatsapp_enabled, notification_email_enabled, notification_sms_enabled")
    .maybeSingle();

  const enabled = data?.notifications_enabled === true ||
    data?.notification_whatsapp_enabled === true ||
    data?.notification_email_enabled === true ||
    data?.notification_sms_enabled === true;
  return !enabled;
};

const persistCustomerId = async (
  admin: any,
  payer: AdapterPayer,
  environment: Environment,
  customerId: string,
) => {
  const parceiroId = firstString(payer.id);
  if (!parceiroId) return customerId;

  await admin
    .from("parceiros")
    .update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", parceiroId);

  await admin.from("payment_gateway_customers").upsert({
    parceiro_id: parceiroId,
    provider_code: ASAAS_PROVIDER_CODE,
    environment,
    remote_customer_id: customerId,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: "parceiro_id,provider_code,environment",
  }).then(({ error }: any) => {
    if (error) console.warn("Nao foi possivel espelhar cliente Asaas no gateway bancario:", error);
  });

  return customerId;
};

const customerPayload = (
  payer: AdapterPayer,
  notificationDisabled: boolean,
) => ({
  name: payerName(payer),
  cpfCnpj: payerDocument(payer),
  email: firstString(payer.email) || undefined,
  mobilePhone: firstString(payer.telefone, payer.phone, payer.mobilePhone) || undefined,
  postalCode: onlyDigits(String(payer.cep ?? payer.postalCode ?? "")) || undefined,
  address: firstString(payer.endereco, payer.address) || undefined,
  addressNumber: firstString(payer.numero, payer.addressNumber) || undefined,
  complement: firstString(payer.complemento, payer.complement) || undefined,
  province: firstString(payer.bairro, payer.district, payer.province) || undefined,
  externalReference: firstString(payer.id) || undefined,
  notificationDisabled,
  groupName: "Alunos Universo",
});

const ensureCustomer = async (
  runtime: AsaasRuntime,
  admin: any,
  payer: AdapterPayer,
) => {
  const document = payerDocument(payer);
  const notificationDisabled = await notificationsDisabled(admin);
  const found = await callAsaas(
    runtime,
    `/customers?cpfCnpj=${encodeURIComponent(document)}&limit=1`,
    {},
    "Universo-Cursos-Gateway",
  );
  let customer = found?.data?.[0];

  if (!customer?.id) {
    customer = await callAsaas(runtime, "/customers", {
      method: "POST",
      body: JSON.stringify(customerPayload(payer, notificationDisabled)),
    }, "Universo-Cursos-Gateway");
  } else {
    await callAsaas(runtime, `/customers/${customer.id}`, {
      method: "PUT",
      body: JSON.stringify(customerPayload(payer, notificationDisabled)),
    }, "Universo-Cursos-Gateway").catch((error) => {
      console.warn("Nao foi possivel atualizar cliente Asaas:", error);
    });
  }

  if (!customer?.id) {
    throw new AsaasAdapterError("Asaas retornou cliente sem id.");
  }

  return persistCustomerId(admin, payer, runtime.environment, String(customer.id));
};

const isCanceledPayment = (payment: any) =>
  ["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(
    String(payment?.status || "").toUpperCase(),
  );

const isPaidPayment = (payment: any) =>
  ["RECEIVED", "CONFIRMED"].includes(String(payment?.status || "").toUpperCase());

const remotePaymentMatchesInput = (
  payment: any,
  input: AdapterCreateChargeInput,
) => {
  const expectedBillingType = input.paymentMethod;
  const remoteBillingType = String(payment?.billingType || "").toUpperCase();
  if (remoteBillingType !== expectedBillingType) return false;

  const installments = normalizeInstallments(input.installments);
  const hasInstallments = expectedBillingType === "CREDIT_CARD" && installments > 1;
  const remoteHasInstallments = Boolean(payment?.installment || payment?.installmentId);
  if (hasInstallments !== remoteHasInstallments) return false;

  const expectedValue = hasInstallments
    ? roundMoney(Number(input.amount || 0) / installments)
    : roundMoney(input.amount);
  return Math.abs(roundMoney(payment?.value) - expectedValue) <= 0.01;
};

const cancelPayment = async (
  runtime: AsaasRuntime,
  paymentId: string,
) => {
  const response = await fetch(`${runtime.baseUrl}/payments/${paymentId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Universo-Cursos-Gateway",
      access_token: runtime.apiKey,
    },
  });
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => null);
    const message = payload?.errors?.map((item: any) => item.description).join(" ") ||
      payload?.message ||
      `Erro ${response.status} ao cancelar cobranca Asaas anterior.`;
    throw new AsaasAdapterError(message);
  }
};

const recoverPaymentByReceivable = async (
  runtime: AsaasRuntime,
  input: AdapterCreateChargeInput,
) => {
  const receivableId = firstString(input.receivable?.id);
  if (!receivableId) return null;

  const response = await callAsaas(
    runtime,
    `/payments?externalReference=${encodeURIComponent(receivableId)}&limit=10`,
    {},
    "Universo-Cursos-Gateway",
  ).catch(() => null);

  const payments = Array.isArray(response?.data) ? response.data : [];
  for (const payment of payments) {
    if (String(payment?.externalReference || "") !== receivableId) continue;
    if (isCanceledPayment(payment)) continue;
    if (remotePaymentMatchesInput(payment, input) || isPaidPayment(payment)) return payment;
    if (payment?.id) await cancelPayment(runtime, String(payment.id));
  }

  return null;
};

const buildPaymentPayload = (
  customerId: string,
  input: AdapterCreateChargeInput,
) => {
  const receivableId = firstString(input.receivable?.id);
  if (!receivableId) {
    throw new AsaasAdapterError("Cobranca Asaas requer identificador interno.");
  }

  const payload: Record<string, unknown> = {
    customer: customerId,
    billingType: input.paymentMethod,
    dueDate: input.dueDate,
    description: firstString(input.description).slice(0, 500),
    externalReference: receivableId,
    postalService: false,
  };

  const installments = normalizeInstallments(input.installments);
  if (input.paymentMethod === "CREDIT_CARD" && installments > 1) {
    payload.installmentCount = installments;
    payload.totalValue = Number(input.amount.toFixed(2));
  } else {
    payload.value = Number(input.amount.toFixed(2));
  }

  if (input.successUrl) {
    payload.callback = { successUrl: input.successUrl };
  }

  return payload;
};

const resultFromPayment = (payment: any): AdapterCreateChargeResult => {
  const id = firstString(payment?.id);
  if (!id) throw new AsaasAdapterError("Asaas retornou cobranca sem id.");
  const invoiceUrl = firstString(payment?.invoiceUrl) || null;
  const bankSlipUrl = firstString(payment?.bankSlipUrl) || null;
  return {
    id,
    link: invoiceUrl || bankSlipUrl,
    invoiceUrl,
    bankSlipUrl,
    customer: firstString(payment?.customer) || null,
    installmentId: firstString(payment?.installment, payment?.installmentId) || null,
    transactionReceiptUrl: firstString(payment?.transactionReceiptUrl) || null,
    status: firstString(payment?.status, "PENDING"),
    raw: payment || {},
  };
};

export const createAsaasCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  const environment = normalizeEnvironment(input.environment);
  assertPaymentMethod(input.paymentMethod);
  assertAmount(input.amount);
  assertPayer(input.payer || {});

  const runtime = await resolveRuntime(input.admin, environment);
  const customerId = await ensureCustomer(runtime, input.admin, input.payer || {});
  const recoveredPayment = await recoverPaymentByReceivable(runtime, input);
  if (recoveredPayment?.id) return resultFromPayment(recoveredPayment);

  const payment = await callAsaas(runtime, "/payments", {
    method: "POST",
    body: JSON.stringify(buildPaymentPayload(customerId, input)),
  }, "Universo-Cursos-Gateway");

  return resultFromPayment(payment);
};
