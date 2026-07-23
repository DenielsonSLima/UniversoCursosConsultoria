import {
  BANESE_BOLETO_ENDPOINTS,
  BANESE_PIX_ENDPOINTS,
  type BaneseAccessToken,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  type BaneseBoletoCredentials,
  type BaneseClientCredentials,
  type BanesePixCredentials,
  type Environment,
  type SupabaseAdminRpcClient,
} from "./types.ts";
import {
  asRecord,
  assertEnvironment,
  BANESE_PIX_GUIA_SCOPE,
  calculateBaneseNossoNumero,
  firstString,
  onlyDigits,
  readResponseBody,
  secretName,
  stringValue,
} from "./utils.ts";

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

export const allocateBaneseNossoNumero = async (
  admin: SupabaseAdminRpcClient,
  environment: Environment,
  convenio: string,
  agencia: string,
) => {
  const { data, error } = await admin.rpc("next_banese_nosso_numero", {
    p_environment: environment,
    p_convenio: convenio,
    p_agencia: agencia,
  });
  if (error) throw error;
  const nossoNumero = onlyDigits(data);
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Nao foi possivel reservar um Nosso Numero Banese valido.",
    );
  }
  if (
    calculateBaneseNossoNumero(agencia, nossoNumero.slice(0, 8)) !== nossoNumero
  ) {
    throw new BaneseAdapterConfigurationError(
      "Digito verificador do Nosso Numero Banese nao confere com a agencia beneficiaria.",
    );
  }
  return nossoNumero;
};

export const reserveBaneseNossoNumero = async (
  admin: SupabaseAdminRpcClient,
  input: {
    receivableId: string;
    environment: Environment;
    convenio: string;
    agencia: string;
  },
) => {
  const { data, error } = await admin.rpc(
    "reserve_banese_nosso_numero_for_receivable",
    {
      p_receivable_id: input.receivableId,
      p_environment: input.environment,
      p_convenio: input.convenio,
      p_agencia: input.agencia,
    },
  );
  if (error) throw error;
  const result = asRecord(data);
  const nossoNumero = onlyDigits(result.nossoNumero ?? result.nosso_numero);
  const convenio = onlyDigits(result.convenio ?? input.convenio);
  const agencia = onlyDigits(result.agencia ?? input.agencia)
    .padStart(3, "0").slice(-3);
  if (!convenio || agencia === "000") {
    throw new BaneseAdapterConfigurationError(
      "Snapshot de convenio/agencia da reserva Banese e invalido.",
    );
  }
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new BaneseAdapterConfigurationError(
      "Nao foi possivel reservar o Nosso Numero Banese no recebivel.",
    );
  }
  if (
    calculateBaneseNossoNumero(agencia, nossoNumero.slice(0, 8)) !==
      nossoNumero
  ) {
    throw new BaneseAdapterConfigurationError(
      "Digito verificador do Nosso Numero Banese reservado nao confere.",
    );
  }
  return {
    nossoNumero,
    convenio,
    agencia,
    alreadyReserved: result.alreadyReserved === true ||
      result.already_reserved === true,
  };
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
  if (!clientId || !clientSecret) {
    throw new BaneseAdapterConfigurationError(
      `Client ID e Client Secret do Banese Card devem estar configurados para ${environment}.`,
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
  const requestHeaders = {
    ...(credentials.crtAccessToken
      ? { CrtAccessToken: credentials.crtAccessToken }
      : {}),
    Terminal: BANESE_PIX_ENDPOINTS[environment].terminal,
  };
  return requestAccessToken(
    BANESE_PIX_ENDPOINTS[environment].tokenUrl,
    credentials,
    scope,
    requestHeaders,
  );
};
