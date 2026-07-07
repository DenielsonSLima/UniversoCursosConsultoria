// Provider identifier for the bank named Banese Card; CREDIT_CARD is not supported.
export const BANESE_PROVIDER_CODE = "banese_card" as const;

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
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  pixEncodedImage?: string | null;
  status: string;
  raw: unknown;
};

export type BaneseClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export type BaneseBoletoCredentials = BaneseClientCredentials;

export type BanesePixCredentials = BaneseClientCredentials & {
  crtAccessToken: string;
};

export type BaneseAccessToken = {
  accessToken: string;
  tokenType: string;
  expiresIn: number | null;
  scope: string | null;
  raw: unknown;
};

export class BaneseAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaneseAdapterError";
  }
}

export class BaneseAdapterConfigurationError extends BaneseAdapterError {
  constructor(message: string) {
    super(message);
    this.name = "BaneseAdapterConfigurationError";
  }
}

export class BaneseAdapterNotImplementedError extends Error {
  constructor(feature: string) {
    super(`Adapter Banese Card ainda nao implementado para ${feature}.`);
    this.name = "BaneseAdapterNotImplementedError";
  }
}

export const BANESE_BOLETO_ENDPOINTS: Record<Environment, {
  baseUrl: string;
  tokenUrl: string;
}> = {
  sandbox: {
    baseUrl: "https://sandbox.banese.b.br/cobranca/v1",
    tokenUrl: "https://sandbox.banese.b.br/autenticacao/oauth/v1/token",
  },
  production: {
    baseUrl: "https://webapi.banese.b.br/cobranca/v1",
    tokenUrl: "https://webapi.banese.b.br/autenticacao/oauth/v1/token",
  },
};

export const BANESE_PIX_ENDPOINTS: Record<Environment, {
  baseUrl: string;
  tokenUrl: string;
  terminal: string;
}> = {
  sandbox: {
    baseUrl: "https://apipix-h.banese.b.br/guias/v1",
    tokenUrl: "https://apipix-h.banese.b.br/security/v3/oauth/token",
    terminal: "99000090054",
  },
  production: {
    baseUrl: "https://apipix.banese.b.br/guias/v1",
    tokenUrl: "https://apipix.banese.b.br/security/v3/oauth/token",
    terminal: "99000090049",
  },
};

const secretName = (environment: Environment, kind: string) =>
  `payment_gateway_${BANESE_PROVIDER_CODE}_${environment}_${kind}`;

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

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const BANESE_PIX_GUIA_SCOPE =
  "sab.guiasmanutencao,cobv.write,payloadlocation.read";

const assertEnvironment = (environment: Environment) => {
  if (environment !== "sandbox" && environment !== "production") {
    throw new BaneseAdapterError("Ambiente Banese Card invalido.");
  }
};

const assertAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BaneseAdapterError(
      "Valor da cobranca Banese Card deve ser maior que zero.",
    );
  }
};

const assertIsoDate = (value: unknown, fieldName: string) => {
  const date = stringValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BaneseAdapterError(
      `${fieldName} deve estar no formato YYYY-MM-DD.`,
    );
  }
  return date;
};

const boundedInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, normalized));
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

const metadataFrom = (receivable: AdapterReceivable) => {
  const direct = asRecord(receivable);
  return {
    ...asRecord(direct.metadata),
    ...asRecord(direct.gateway_metadata),
    ...asRecord(direct.payment_gateway_metadata),
    ...asRecord(direct.provider_metadata),
    ...direct,
  };
};

const mergeDefined = (
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
) => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(extra).filter(([, value]) =>
      value !== undefined && value !== null
    ),
  ),
});

const extractBanesePayload = (receivable: AdapterReceivable, key: string) => {
  const metadata = metadataFrom(receivable);
  return asRecord(metadata[key]);
};

const requestAccessToken = async (
  tokenUrl: string,
  credentials: BaneseClientCredentials,
  scope?: string,
  extraHeaders: Record<string, string> = {},
): Promise<BaneseAccessToken> => {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (scope) body.set("scope", scope);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${
        btoa(`${credentials.clientId}:${credentials.clientSecret}`)
      }`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body,
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new BaneseAdapterError(
      `Banese Card recusou autenticacao (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const rawRecord = asRecord(raw);
  const accessToken = firstString(
    rawRecord.access_token,
    rawRecord.accessToken,
  );
  if (!accessToken) {
    throw new BaneseAdapterError(
      "Banese Card retornou autenticacao sem access token.",
    );
  }

  return {
    accessToken,
    tokenType: firstString(rawRecord.token_type, rawRecord.tokenType, "Bearer"),
    expiresIn: Number.isFinite(Number(rawRecord.expires_in))
      ? Number(rawRecord.expires_in)
      : null,
    scope: firstString(rawRecord.scope) || null,
    raw,
  };
};

export const getBaneseSecret = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  kind: "client_id" | "client_secret" | "crt_access_token",
) => {
  assertEnvironment(environment);
  const { data, error } = await admin.rpc("payment_gateway_get_secret", {
    p_secret_name: secretName(environment, kind),
  });
  if (error) throw error;
  return stringValue(data);
};

export const getBaneseBoletoCredentials = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
): Promise<BaneseBoletoCredentials> => {
  const [clientId, clientSecret] = await Promise.all([
    getBaneseSecret(admin, environment, "client_id"),
    getBaneseSecret(admin, environment, "client_secret"),
  ]);
  if (!clientId || !clientSecret) {
    throw new BaneseAdapterConfigurationError(
      `Client ID e Client Secret do Banese Card nao configurados para ${environment}.`,
    );
  }
  return { clientId, clientSecret };
};

export const getBanesePixCredentials = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
): Promise<BanesePixCredentials> => {
  const [clientId, clientSecret, crtAccessToken] = await Promise.all([
    getBaneseSecret(admin, environment, "client_id"),
    getBaneseSecret(admin, environment, "client_secret"),
    getBaneseSecret(admin, environment, "crt_access_token"),
  ]);
  if (!clientId || !clientSecret || !crtAccessToken) {
    throw new BaneseAdapterConfigurationError(
      `Client ID, Client Secret e CrtAccessToken do Banese Card Pix devem estar configurados para ${environment}.`,
    );
  }
  return { clientId, clientSecret, crtAccessToken };
};

export const requestBaneseBoletoAccessToken = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
) => {
  assertEnvironment(environment);
  const credentials = await getBaneseBoletoCredentials(admin, environment);
  return requestAccessToken(
    BANESE_BOLETO_ENDPOINTS[environment].tokenUrl,
    credentials,
    "boletos",
  );
};

export const requestBanesePixAccessToken = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  scope = BANESE_PIX_GUIA_SCOPE,
) => {
  assertEnvironment(environment);
  const credentials = await getBanesePixCredentials(admin, environment);
  return requestAccessToken(
    BANESE_PIX_ENDPOINTS[environment].tokenUrl,
    credentials,
    scope,
    {
      CrtAccessToken: credentials.crtAccessToken,
      Terminal: BANESE_PIX_ENDPOINTS[environment].terminal,
    },
  );
};

export const buildBaneseBoletoPayload = (input: AdapterCreateChargeInput) => {
  assertAmount(input.amount);
  const dueDate = assertIsoDate(
    input.dueDate,
    "Vencimento do boleto Banese Card",
  );
  const metadata = metadataFrom(input.receivable || {});
  const payer = input.payer || {};

  const payerDocument = onlyDigits(
    payer.cpfCnpj ?? payer.cpf_cnpj ?? payer.cpf ?? payer.cnpj,
  );
  const payerName = firstString(payer.name, payer.nome);
  if (!payerDocument || !payerName) {
    throw new BaneseAdapterError(
      "Pagador do boleto Banese Card deve ter nome e CPF/CNPJ.",
    );
  }

  const externalReference = firstString(
    input.receivable?.id,
    metadata.externalReference,
    metadata.external_reference,
  );
  if (!externalReference) {
    throw new BaneseAdapterError(
      "Boleto Banese Card requer identificador do recebivel.",
    );
  }
  const nossoNumero = onlyDigits(
    metadata.baneseNossoNumero ?? metadata.nossoNumero ?? metadata.NossoNumero,
  );
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese Card requer NossoNumero com 8 digitos + DV, unico por convenio.",
    );
  }

  const address = mergeDefined({}, {
    DescricaoEndereco: firstString(
      payer.endereco,
      payer.address,
      metadata.pagadorEndereco,
      metadata.payerAddress,
    ) || undefined,
    CEP: onlyDigits(payer.cep ?? payer.postalCode ?? metadata.pagadorCep) ||
      undefined,
    Bairro: firstString(payer.bairro, payer.province, metadata.pagadorBairro) ||
      undefined,
    Cidade: firstString(payer.cidade, payer.city, metadata.pagadorCidade) ||
      undefined,
    UnidadeFederativa: firstString(payer.uf, payer.state, metadata.pagadorUf) ||
      undefined,
  });

  const pagador = mergeDefined({
    TipoPessoa: payerDocument.length > 11 ? "J" : "F",
    NumeroCPFCNPJ: payerDocument.slice(0, 14),
    NomeOuRazaoSocial: payerName.slice(0, 50),
    NomeFantasia: payerName.slice(0, 80),
  }, Object.keys(address).length ? { Endereco: address } : {});

  const basePayload = {
    NossoNumero: nossoNumero,
    CodigoMoeda: 9,
    DataEmissao: todayIsoDate(),
    DataVencimento: dueDate,
    ValorNominal: Number(input.amount.toFixed(2)),
    ValorAbatimento: 0,
    NumeroDocumento: externalReference.slice(0, 15),
    CodigoEspecie: boundedInteger(metadata.baneseCodigoEspecie, 21, 1, 99),
    CodigoTipoBaixaDevolucao: 1,
    QuantidadeDiasBaixaDevolucao: boundedInteger(
      metadata.quantidadeDiasBaixaDevolucao,
      30,
      1,
      180,
    ),
    IndicadorPagamentoParcial: false,
    QuantidadePagamentoParcial: 0,
    TipoValorAceito: 3,
    FlAceite: false,
    IdTituloEmpresa: externalReference,
    Pagador: pagador,
  };

  return mergeDefined(
    basePayload,
    extractBanesePayload(input.receivable || {}, "baneseBoletoPayload"),
  );
};

export const createBaneseBoletoCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  assertEnvironment(input.environment);
  if (input.paymentMethod !== "BOLETO") {
    throw new BaneseAdapterError(
      "createBaneseBoletoCharge aceita apenas BOLETO.",
    );
  }

  const metadata = metadataFrom(input.receivable || {});
  const convenio = onlyDigits(
    metadata.baneseBoletoConvenio ?? metadata.baneseConvenio ??
      metadata.convenio ??
      metadata.idConvenio ?? metadata.id_convenio,
  );
  if (!convenio) {
    throw new BaneseAdapterConfigurationError(
      "Boleto Banese Card requer convenio em receivable.metadata.baneseBoletoConvenio ou baneseConvenio.",
    );
  }

  const token = await requestBaneseBoletoAccessToken(
    input.admin,
    input.environment,
  );
  const payload = buildBaneseBoletoPayload(input);
  const endpoint = `${
    BANESE_BOLETO_ENDPOINTS[input.environment].baseUrl
  }/convenios/${convenio}/boletos`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `${token.tokenType} ${token.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new BaneseAdapterError(
      `Banese Card recusou criacao do boleto (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const rawRecord = asRecord(raw);
  return {
    id: firstString(
      rawRecord.id,
      rawRecord.Id,
      rawRecord.NossoNumero,
      rawRecord.nossoNumero,
      rawRecord.NumeroDocumento,
      rawRecord.numeroDocumento,
      payload.NossoNumero,
      payload.IdTituloEmpresa,
    ),
    link: firstString(
      rawRecord.link,
      rawRecord.url,
      rawRecord.Url,
      rawRecord.urlBoleto,
      rawRecord.UrlBoleto,
    ) || null,
    bankSlipUrl: firstString(rawRecord.urlBoleto, rawRecord.UrlBoleto) || null,
    status: firstString(rawRecord.status, rawRecord.Status, "created"),
    raw,
  };
};

export const validateBanesePixChargeInput = async (
  input: AdapterCreateChargeInput,
) => {
  assertEnvironment(input.environment);
  assertAmount(input.amount);
  const metadata = metadataFrom(input.receivable || {});
  const credentials = await getBanesePixCredentials(
    input.admin,
    input.environment,
  );
  const convenio = firstString(
    metadata.banesePixConvenio,
    metadata.baneseConvenio,
    metadata.convenio,
  );
  const chave = firstString(
    metadata.banesePixChave,
    metadata.pixChave,
    metadata.chave,
  );
  if (!credentials.crtAccessToken || !convenio || !chave) {
    throw new BaneseAdapterConfigurationError(
      "Pix Banese Card requer CrtAccessToken configurado, convenio Pix e chave Pix do recebedor.",
    );
  }
  return {
    credentials,
    convenio,
    chave,
    pixPayload: extractBanesePayload(
      input.receivable || {},
      "banesePixPayload",
    ),
    pixEndpointPath: firstString(
      metadata.banesePixEndpointPath,
      metadata.pixEndpointPath,
      "/manutencao/guiaVencimentoFuturo",
    ),
  };
};

export const createBanesePixCharge = async (
  input: AdapterCreateChargeInput,
): Promise<AdapterCreateChargeResult> => {
  if (input.paymentMethod !== "PIX") {
    throw new BaneseAdapterError("createBanesePixCharge aceita apenas PIX.");
  }

  const validation = await validateBanesePixChargeInput(input);
  if (
    !Object.keys(validation.pixPayload).length || !validation.pixEndpointPath
  ) {
    throw new BaneseAdapterConfigurationError(
      "Pix Banese Card nao foi enviado: o manual SAB Guias exige CodigoBarra de 48 digitos e payload por cobranca. Informe o payload homologado em banesePixPayload. Nenhuma cobranca Pix foi simulada.",
    );
  }

  const token = await requestBanesePixAccessToken(
    input.admin,
    input.environment,
  );
  const endpoint = `${BANESE_PIX_ENDPOINTS[input.environment].baseUrl}${
    validation.pixEndpointPath.startsWith("/")
      ? validation.pixEndpointPath
      : `/${validation.pixEndpointPath}`
  }`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `${token.tokenType} ${token.accessToken}`,
      CrtAccessToken: validation.credentials.crtAccessToken,
      Terminal: BANESE_PIX_ENDPOINTS[input.environment].terminal,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validation.pixPayload),
  });
  const raw = await readResponseBody(response);

  if (!response.ok) {
    throw new BaneseAdapterError(
      `Banese Card recusou criacao do Pix (${response.status}): ${
        typeof raw === "string" ? raw : JSON.stringify(raw)
      }`,
    );
  }

  const rawRecord = asRecord(raw);
  // In SAB Guias, brCodeEMV/dsUrl are the Pix copy-paste payload, while
  // base64/qrCode are QR image data.
  const pixPayload = firstString(
    rawRecord.brCodeEMV,
    rawRecord.dsUrl,
  );
  const pixEncodedImage = firstString(
    rawRecord.base64,
    rawRecord.qrCode,
    rawRecord.qrcode,
    rawRecord.qrCodeBase64,
    rawRecord.qr_code_base64,
  );
  return {
    id: firstString(
      rawRecord.id,
      rawRecord.txid,
      rawRecord.txId,
      rawRecord.TxId,
      rawRecord.identificador,
    ),
    link: pixPayload || firstString(rawRecord.link, rawRecord.url) || null,
    pixPayload: pixPayload || null,
    pixEncodedImage: pixEncodedImage || null,
    status: firstString(rawRecord.status, rawRecord.situacao, "created"),
    raw,
  };
};

export const createBaneseCharge = (input: AdapterCreateChargeInput) => {
  if (input.paymentMethod === "BOLETO") return createBaneseBoletoCharge(input);
  if (input.paymentMethod === "PIX") return createBanesePixCharge(input);
  throw new BaneseAdapterError(
    "Banese Card nao suporta CREDIT_CARD neste adapter.",
  );
};

export const requireBaneseAdapter = (feature: string): never => {
  throw new BaneseAdapterNotImplementedError(feature);
};
