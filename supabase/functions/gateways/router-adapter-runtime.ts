import type { BaneseFinancialTermsInput } from "../banese/internal/financial-terms.ts";

export type GatewayEnvironment = "sandbox" | "production";
export type GatewayPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type GatewayProviderCode = "asaas" | "mercado_pago" | "banese_card";

export type GatewayIssuer = {
  id: string;
  companyId: string;
  name: string;
  cnpj: string;
  city: string;
  state: string;
};

export type GatewayChargeInput = {
  admin: any;
  supabaseUrl: string;
  providerCode: GatewayProviderCode;
  environment: GatewayEnvironment;
  paymentMethod: GatewayPaymentMethod;
  credentialId?: string | null;
  receivable: any;
  payer: Record<string, unknown>;
  amount: number;
  description: string;
  dueDate?: string | null;
  installments?: number | null;
  successUrl?: string | null;
  failureUrl?: string | null;
  pendingUrl?: string | null;
  issuer?: GatewayIssuer | null;
  financialTerms?: BaneseFinancialTermsInput | null;
  allowPendingBolePix?: boolean;
};

export type GatewayChargeResult = {
  providerCode: GatewayProviderCode;
  remotePaymentId: string | null;
  remotePaymentLinkId: string | null;
  remoteCustomerId: string | null;
  remoteStatus: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  pixPayload: string | null;
  pixEncodedImage: string | null;
  bankSlipDigitableLine: string | null;
  bankSlipBarcode: string | null;
  bankSlipOurNumber: string | null;
  issuerPoloId: string | null;
  financialTerms: Record<string, unknown> | null;
  rawPayload: Record<string, unknown>;
};

const paymentIssuer = async (admin: any): Promise<GatewayIssuer> => {
  const { data: config, error: configError } = await admin
    .from("payment_gateway_issuer_config")
    .select("issuer_polo_id, active, applies_to_all_polos")
    .eq("id", 1)
    .maybeSingle();
  if (configError) throw configError;
  if (
    !config?.issuer_polo_id ||
    config.active !== true ||
    config.applies_to_all_polos !== true
  ) {
    throw new Error(
      "O emissor financeiro global da matriz nao esta configurado.",
    );
  }

  const { data: issuer, error: issuerError } = await admin
    .from("polos")
    .select("id, company_id, nome, cnpj, cidade, estado, status, is_matriz")
    .eq("id", config.issuer_polo_id)
    .maybeSingle();
  if (issuerError) throw issuerError;
  if (
    !issuer ||
    issuer.is_matriz !== true ||
    String(issuer.status || "").toLowerCase() !== "ativo"
  ) {
    throw new Error(
      "O polo matriz emissor nao esta ativo ou deixou de ser matriz.",
    );
  }

  return {
    id: issuer.id,
    companyId: issuer.company_id,
    name: issuer.nome,
    cnpj: issuer.cnpj,
    city: issuer.cidade,
    state: issuer.estado,
  };
};

const providerMetadata = async (
  admin: any,
  providerCode: GatewayProviderCode,
  environment: GatewayEnvironment,
  credentialId?: string | null,
) => {
  let query = admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", providerCode)
    .eq("environment", environment);
  if (credentialId) query = query.eq("id", credentialId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (credentialId && !data) {
    throw new Error(
      "Credencial bancaria da rota nao pertence ao provedor/ambiente selecionado.",
    );
  }
  return data?.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
};

export const withProviderMetadata = async (
  input: GatewayChargeInput,
): Promise<GatewayChargeInput> => {
  const [metadata, issuer] = await Promise.all([
    input.providerCode === "asaas" ? Promise.resolve({}) : providerMetadata(
      input.admin,
      input.providerCode,
      input.environment,
      input.credentialId,
    ),
    paymentIssuer(input.admin),
  ]);
  return {
    ...input,
    issuer,
    receivable: {
      ...(input.receivable || {}),
      gateway_issuer_polo_id: issuer.id,
      metadata: {
        ...(input.receivable?.metadata || {}),
        ...metadata,
      },
      payment_gateway_metadata: metadata,
      payment_gateway_issuer: issuer,
    },
  };
};

export const normalizeGatewayAdapterResult = (
  providerCode: GatewayProviderCode,
  paymentMethod: GatewayPaymentMethod,
  result: any,
): GatewayChargeResult => {
  const raw = result?.raw && typeof result.raw === "object" ? result.raw : {};
  const isHostedCheckoutProvider = providerCode === "mercado_pago" ||
    providerCode === "asaas";
  const explicitPaymentLinkId = result?.paymentLinkId || result?.paymentLink ||
    null;
  return {
    providerCode,
    remotePaymentId: result?.id || null,
    remotePaymentLinkId: explicitPaymentLinkId ||
      (providerCode === "mercado_pago" ? result?.id : null) || null,
    remoteCustomerId: result?.customer || result?.customerId || null,
    remoteStatus: result?.status || "created",
    invoiceUrl: result?.invoiceUrl || result?.link || null,
    bankSlipUrl: result?.bankSlipUrl ||
      (paymentMethod === "BOLETO" ? result?.link || null : null),
    pixPayload: result?.pixPayload ||
      (!isHostedCheckoutProvider && paymentMethod === "PIX"
        ? result?.link || null
        : null),
    pixEncodedImage: result?.pixEncodedImage ||
      result?.pixEncodedImageBase64 ||
      null,
    bankSlipDigitableLine: result?.bankSlipDigitableLine || null,
    bankSlipBarcode: result?.bankSlipBarcode || null,
    bankSlipOurNumber: result?.bankSlipOurNumber || null,
    issuerPoloId: null,
    financialTerms: result?.financialTerms &&
        typeof result.financialTerms === "object"
      ? result.financialTerms
      : null,
    rawPayload: raw,
  };
};

export const withIssuerSnapshot = (
  result: GatewayChargeResult,
  issuer?: GatewayIssuer | null,
): GatewayChargeResult => ({
  ...result,
  issuerPoloId: issuer?.id || null,
});

export const assertGatewayChargeAdapterReady = (
  input: Pick<
    GatewayChargeInput,
    "providerCode" | "environment" | "paymentMethod"
  >,
) => {
  if (input.providerCode === "asaas") {
    throw new Error(
      "Asaas foi desativado para novas cobrancas; o historico permanece somente para auditoria.",
    );
  }
  if (input.providerCode === "mercado_pago") {
    if (input.paymentMethod !== "CREDIT_CARD") {
      throw new Error(
        "Mercado Pago atende somente cartao; boleto e Pix devem usar Banese.",
      );
    }
    throw new Error(
      "Mercado Pago permanece bloqueado ate concluir a homologacao segura do cartao e da recuperacao de criacoes ambiguas.",
    );
  }
  if (input.providerCode !== "banese_card") {
    throw new Error(
      "Provedor bancario sem adapter homologado para novas cobrancas.",
    );
  }
  if (input.paymentMethod === "PIX") {
    throw new Error(
      "Pix Banese direto permanece bloqueado em sandbox e producao; o BolePix deve usar a rota BOLETO.",
    );
  }
  if (input.paymentMethod === "CREDIT_CARD") {
    throw new Error(
      "Banese nao aceita cartao de credito neste fluxo de checkout. Use Mercado Pago para cartão.",
    );
  }
};
