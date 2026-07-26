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
  "save-runtime-config",
  "save-credential",
  "save-route",
  "save-issuer",
  "test-connection",
  "reconcile-banese-receivable",
  "import-banese-cnab240-return",
]);

export const GLOBAL_ACTIONS = new Set([
  "save-runtime-config",
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
  banese_card: { supports: ["PIX", "BOLETO"] },
};

export const CONFIGURABLE_PROVIDER_CODES = [
  "banese_card",
  "mercado_pago",
] as const satisfies readonly ProviderCode[];

const configurableProviderCodes = new Set<ProviderCode>(
  CONFIGURABLE_PROVIDER_CODES,
);

export const assertProviderInFinancialScope = (
  providerCode: ProviderCode,
) => {
  if (configurableProviderCodes.has(providerCode)) return;
  throw new Error(
    providerCode === "asaas"
      ? "Asaas foi desativado para novas cobrancas. O historico permanece somente para auditoria e encerramento seguro."
      : "Banco Inter foi removido do escopo financeiro. Use Banese para boleto/Pix ou Mercado Pago para cartao.",
  );
};

export const assertProviderMethodInFinancialScope = (
  providerCode: ProviderCode,
  paymentMethod: PaymentMethod,
) => {
  assertProviderInFinancialScope(providerCode);
  const valid = providerCode === "banese_card"
    ? paymentMethod === "PIX" || paymentMethod === "BOLETO"
    : paymentMethod === "CREDIT_CARD";
  if (!valid) {
    throw new Error(
      providerCode === "banese_card"
        ? "Banese atende somente boleto e Pix; cartao deve usar Mercado Pago."
        : "Mercado Pago atende somente cartao neste sistema; boleto e Pix devem usar Banese.",
    );
  }
};

export const assertProviderAdapterReady = (
  providerCode: ProviderCode,
  paymentMethod: PaymentMethod,
  environment?: Environment,
) => {
  assertProviderMethodInFinancialScope(providerCode, paymentMethod);
  if (providerCode === "mercado_pago") {
    throw new Error(
      "A rota Mercado Pago permanece bloqueada ate homologar a recuperacao de criacao ambigua de preferencias, sem risco de gerar dois links pagaveis.",
    );
  }
  if (providerCode !== "banese_card") return;
  if (paymentMethod === "PIX") {
    throw new Error(
      "O BolePix Banese e emitido pela rota BOLETO em producao. Nao existe uma cobranca PIX Banese separada neste convenio.",
    );
  }
  if (paymentMethod === "CREDIT_CARD") {
    throw new Error(
      "Banese nao aceita cartao de credito neste fluxo. Use Mercado Pago para cartao.",
    );
  }
};

export const assertHomologationStageRoute = (
  modalidade: Modalidade,
  paymentMethod: PaymentMethod,
  providerCode: ProviderCode,
  environment: Environment,
) => {
  if (
    modalidade === "EAD" &&
    paymentMethod === "BOLETO" &&
    providerCode === "banese_card" &&
    (environment === "sandbox" || environment === "production")
  ) return;
  throw new Error(
    "Nesta etapa, somente Cursos EAD com boleto Banese podem ser ativados. Em producao, o Pix e devolvido no proprio BolePix.",
  );
};

export const normalizeEnvironment = (value: unknown): Environment => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized === "production" || normalized === "producao"
    ? "production"
    : "sandbox";
};

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

export const assertStoredProviderAdapterReady = (
  providerCode: unknown,
  paymentMethod: unknown,
  environment?: unknown,
) =>
  assertProviderAdapterReady(
    normalizeProviderCode(providerCode),
    normalizeMethod(paymentMethod),
    environment === undefined ? undefined : normalizeEnvironment(environment),
  );

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
    "baneseEdi7Code",
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

export const DEFAULT_BANCO_INTER_SCOPES =
  "boleto-cobranca.read boleto-cobranca.write";

export const normalizeBancoInterScopes = (value: unknown) => {
  // A integracao atual homologa apenas Cobranca V3/BolePix. Os scopes nao
  // sao configuraveis pelo cliente para evitar ampliacao acidental de
  // privilegios (pix.*, webhook.* ou produtos ainda sem adapter canonico).
  void value;
  return DEFAULT_BANCO_INTER_SCOPES;
};

export const baneseFixedMetadata = (environment?: Environment) => ({
  baneseBeneficiarioNome: environment === "sandbox"
    ? "API Boletos - Universo Cursos e Consultoria LTDA"
    : "UNIVERSO CURSOS E CONSULTORIA LTDA",
  baneseBeneficiarioInscricao: "13.278.137/0001-54",
  baneseAgencia: "033",
  baneseConta: "03/100649-0",
  baneseContaDisplay: "03/100649-0",
  baneseCodigoBeneficiario: "03/100649-0",
  baneseConvenio: environment === "sandbox" ? "15528" : "15261",
  baneseBoletoConvenio: environment === "sandbox" ? "15528" : "15261",
  banesePixConvenio: environment === "sandbox" ? "15528" : "15261",
  ...(environment === "production" ? { banesePixChave: "79998617614" } : {}),
});

export const BANESE_FIXED_METADATA = baneseFixedMetadata("production");

export const normalizeBaneseEdi7Code = (value: unknown) => {
  const normalized = String(value || "").replace(/\D/g, "");
  if (normalized && !/^\d{6}$/.test(normalized)) {
    throw new Error("Código EDI7 Banese deve possuir exatamente 6 dígitos.");
  }
  return normalized;
};

export const enforceProviderFixedMetadata = (
  providerCode: ProviderCode,
  metadata: Record<string, unknown>,
  environment?: Environment,
) => {
  if (providerCode === "banco_inter") {
    return {
      ...metadata,
      interScopes: normalizeBancoInterScopes(metadata.interScopes),
    };
  }
  if (providerCode === "banese_card") {
    const hasEdi7 = Object.prototype.hasOwnProperty.call(
      metadata,
      "baneseEdi7Code",
    );
    return {
      ...metadata,
      ...(hasEdi7
        ? { baneseEdi7Code: normalizeBaneseEdi7Code(metadata.baneseEdi7Code) }
        : {}),
      ...baneseFixedMetadata(environment),
    };
  }
  return metadata;
};

export const providerOverviewRow = (provider: any) => {
  if (provider?.code === "mercado_pago") {
    return {
      ...provider,
      description:
        "Checkout Pro para cartao; rota bloqueada ate homologar a recuperacao idempotente de preferencias.",
      supports_pix: false,
      supports_boleto: false,
      supports_credit_card: true,
      metadata: {
        ...(provider?.metadata || {}),
        intended_role: "credit_card",
        checkout_blocked: true,
        checkout_block_reason:
          "Aguardando homologacao da recuperacao de tentativas ambiguas na criacao de preferencias Mercado Pago.",
      },
    };
  }
  if (provider?.code === "banco_inter") {
    return {
      ...provider,
      name: "Banco Inter",
      description:
        "Credenciais da Cobranca/BolePix V3; emissao e callbacks ainda bloqueados ate homologacao.",
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
      "Boleto e Pix via API do Banese em producao, com retorno no layout próprio.",
    supports_pix: true,
    supports_boleto: true,
    supports_credit_card: false,
    has_public_api: true,
    metadata: {
      ...(provider?.metadata || {}),
      checkout_blocked: false,
      intended_role: "bolepix_boleto",
      pix_homologation_note:
        "O servico Pix esta disponivel em producao; em sandbox permanece bloqueado.",
    },
  };
};
