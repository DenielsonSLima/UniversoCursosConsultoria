export type Environment = "sandbox" | "production";
export type PaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";
export type Modalidade =
  | "EAD"
  | "TECNICO"
  | "LIVRE"
  | "ESPECIALIZACAO"
  | "OUTROS_CREDITOS";
export type ProviderCode =
  | "asaas"
  | "mercado_pago"
  | "banco_inter"
  | "banese_card";

export const GESTOR_ACTIONS = new Set([
  "get-overview",
  "save-credential",
  "save-route",
  "save-issuer",
  "test-connection",
  "reconcile-banese-receivable",
  "import-banese-cnab240-return",
]);

export const GLOBAL_ACTIONS = new Set([
  "save-credential",
  "save-route",
  "save-issuer",
  "test-connection",
  "reconcile-banese-receivable",
  "import-banese-cnab240-return",
]);

export const PROVIDERS: Record<ProviderCode, { supports: PaymentMethod[] }> = {
  asaas: { supports: ["PIX", "BOLETO", "CREDIT_CARD"] },
  mercado_pago: { supports: ["CREDIT_CARD"] },
  banco_inter: { supports: ["PIX", "BOLETO"] },
  banese_card: { supports: ["BOLETO"] },
};

export const assertProviderAdapterReady = (
  providerCode: ProviderCode,
  paymentMethod: PaymentMethod,
) => {
  if (providerCode === "banco_inter") {
    throw new Error(
      "As credenciais do Banco Inter podem ser configuradas e testadas, mas a rota de cobranca so sera liberada apos homologar a emissao e os callbacks.",
    );
  }
  if (providerCode !== "banese_card") return;
  if (paymentMethod === "CREDIT_CARD") {
    throw new Error(
      "Banese nao aceita cartao de credito neste fluxo. Use Asaas ou Mercado Pago para cartao.",
    );
  }
};

export const normalizeEnvironment = (value: unknown): Environment =>
  value === "production" ? "production" : "sandbox";

export const normalizeProviderCode = (value: unknown): ProviderCode => {
  const code = String(value || "").trim().toLowerCase();
  if (
    code === "asaas" || code === "mercado_pago" ||
    code === "banco_inter" || code === "banese_card"
  ) {
    return code;
  }
  throw new Error("Provedor bancario invalido.");
};

export const normalizeMethod = (value: unknown): PaymentMethod => {
  const method = String(value || "").trim().toUpperCase();
  if (method === "PIX" || method === "BOLETO" || method === "CREDIT_CARD") {
    return method;
  }
  if (method === "CARTAO" || method === "CARTÃO") return "CREDIT_CARD";
  throw new Error("Forma de pagamento invalida.");
};

export const normalizeModalidade = (value: unknown): Modalidade => {
  const modalidade = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (
    modalidade === "EAD" ||
    modalidade === "TECNICO" ||
    modalidade === "LIVRE" ||
    modalidade === "ESPECIALIZACAO" ||
    modalidade === "OUTROS_CREDITOS"
  ) {
    return modalidade;
  }
  throw new Error("Modalidade invalida.");
};

export const webhookUrlFor = (
  supabaseUrl: string,
  providerCode: ProviderCode,
) => {
  if (providerCode === "asaas") {
    return `${supabaseUrl}/functions/v1/asaas-webhook`;
  }
  return `${supabaseUrl}/functions/v1/payment-gateway-webhook/${providerCode}`;
};

export const credentialWebhookUrlFor = (
  supabaseUrl: string,
  providerCode: ProviderCode,
  environment: Environment,
) => {
  const baseUrl = webhookUrlFor(supabaseUrl, providerCode);
  if (providerCode === "asaas") return baseUrl;
  return `${baseUrl}?environment=${environment}`;
};

export const extractSecretInput = (body: any) => ({
  api_key: String(body.apiKey || "").trim(),
  access_token: String(body.accessToken || "").trim(),
  public_key: String(body.publicKey || "").trim(),
  client_id: String(body.clientId || "").trim(),
  client_secret: String(body.clientSecret || "").trim(),
  certificate_pem: String(body.certificatePem || "").trim(),
  private_key_pem: String(body.privateKeyPem || "").trim(),
  crt_access_token: String(body.crtAccessToken || "").trim(),
  webhook_secret: String(body.webhookSecret || "").trim(),
  webhook_token: String(body.webhookToken || "").trim(),
});

export const pickMetadata = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const allowed = [
    "walletId",
    "merchantId",
    "interPixKey",
    "interScopes",
    "baneseConvenio",
    "baneseBoletoConvenio",
    "baneseBeneficiarioNome",
    "baneseBeneficiarioInscricao",
    "baneseCodigoBeneficiario",
    "banesePixConvenio",
    "banesePixChave",
    "baneseCarteira",
    "baneseAgencia",
    "baneseConta",
    "baneseContaDisplay",
    "baneseCodigoEspecie",
    "quantidadeDiasBaixaDevolucao",
    "banesePixHomologacaoDisponivel",
    "notes",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => raw[key] !== undefined)
      .map((key) => [key, raw[key]]),
  );
};

export const BANESE_FIXED_METADATA = Object.freeze({
  baneseBeneficiarioNome: "UNIVERSO CURSOS E CONSULTORIA LTDA",
  baneseBeneficiarioInscricao: "13.278.137/0001-54",
  baneseAgencia: "033",
  baneseConta: "03/100649-0",
  baneseContaDisplay: "03/100649-0",
  baneseCodigoBeneficiario: "03/100649-0",
  baneseConvenio: "15528",
  baneseBoletoConvenio: "15528",
});

export const enforceProviderFixedMetadata = (
  providerCode: ProviderCode,
  metadata: Record<string, unknown>,
) => providerCode === "banese_card"
  ? { ...metadata, ...BANESE_FIXED_METADATA }
  : metadata;

export const providerOverviewRow = (provider: any) => {
  if (provider?.code === "mercado_pago") {
    return {
      ...provider,
      description: "Gateway reservado para pagamentos por cartao de credito.",
      supports_pix: false,
      supports_boleto: false,
      supports_credit_card: true,
      metadata: {
        ...(provider?.metadata || {}),
        intended_role: "credit_card",
      },
    };
  }
  if (provider?.code === "banco_inter") {
    return {
      ...provider,
      name: "Banco Inter",
      description:
        "API oficial do Inter Empresas para Pix Cobranca e Boleto com Pix, autenticada por OAuth e certificado mTLS.",
      supports_pix: true,
      supports_boleto: true,
      supports_credit_card: false,
      metadata: {
        ...(provider?.metadata || {}),
        intended_role: "pix_bolepix",
        account_header_optional: true,
        checkout_blocked: true,
        checkout_block_reason:
          "Aguardando homologacao das credenciais, emissao e callbacks do Banco Inter.",
      },
    };
  }
  if (provider?.code !== "banese_card") return provider;
  return {
    ...provider,
    name: "Banese",
    description:
      "Boleto em homologacao; o Banese ativara o BolePix no mesmo titulo em producao.",
    supports_pix: false,
    supports_boleto: true,
    supports_credit_card: false,
    has_public_api: true,
    metadata: {
      ...(provider?.metadata || {}),
      checkout_blocked: false,
      intended_role: "bolepix_boleto",
      homologation_only: true,
      pix_homologation_note:
        "Homologacao devolve apenas linha e barras; em producao o QR BolePix vira parte do boleto, sem rota Pix separada.",
    },
  };
};
