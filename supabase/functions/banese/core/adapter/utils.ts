import {
  type AdapterCreateChargeInput,
  type AdapterReceivable,
  BANESE_PROVIDER_CODE,
  BaneseAdapterConfigurationError,
  BaneseAdapterError,
  type Environment,
} from "./types.ts";

export const secretName = (environment: Environment, kind: string) =>
  `payment_gateway_${BANESE_PROVIDER_CODE}_${environment}_${kind}`;

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export const pickRecord = (value: unknown, keys: string[]) => {
  const record = asRecord(value);
  return Object.fromEntries(
    keys.filter((key) => record[key] !== undefined).map((key) => [
      key,
      record[key],
    ]),
  );
};

export const sanitizedBoletoSnapshot = (value: unknown) =>
  pickRecord(value, [
    "id",
    "Id",
    "NossoNumero",
    "nossoNumero",
    "CodigoMoeda",
    "DataEmissao",
    "DataVencimento",
    "ValorNominal",
    "NumeroDocumento",
    "CodigoEspecie",
    "QuantidadeDiasBaixaDevolucao",
    "Desconto",
    "desconto",
    "Juros",
    "juros",
    "Multa",
    "multa",
    "CodigoSituacaoBoleto",
    "codigoSituacaoBoleto",
    "DataBaixa",
    "dataBaixa",
    "NumeroLinhaDigitavel",
    "numeroLinhaDigitavel",
    "NumeroCodigoBarras",
    "numeroCodigoBarras",
    "status",
    "Status",
    "url",
    "Url",
    "urlBoleto",
    "UrlBoleto",
  ]);

export const stringValue = (value: unknown) => String(value ?? "").trim();

export const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return "";
};

export const onlyDigits = (value: unknown) =>
  stringValue(value).replace(/\D/g, "");

export const todayIsoDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const BANESE_PIX_GUIA_SCOPE =
  "sab.guiasmanutencao,cobv.write,payloadlocation.read";

export const assertEnvironment = (environment: Environment) => {
  if (environment !== "sandbox" && environment !== "production") {
    throw new BaneseAdapterError("Ambiente Banese Card invalido.");
  }
};

export const assertAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BaneseAdapterError(
      "Valor da cobranca Banese Card deve ser maior que zero.",
    );
  }
};

export const assertIsoDate = (value: unknown, fieldName: string) => {
  const date = stringValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BaneseAdapterError(
      `${fieldName} deve estar no formato YYYY-MM-DD.`,
    );
  }
  return date;
};

export const boundedInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.max(min, Math.min(max, normalized));
};

export const readResponseBody = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const metadataFrom = (receivable: AdapterReceivable) => {
  const direct = asRecord(receivable);
  return {
    ...asRecord(direct.metadata),
    ...asRecord(direct.gateway_metadata),
    ...asRecord(direct.payment_gateway_metadata),
    ...asRecord(direct.provider_metadata),
    ...direct,
  };
};

export const mergeDefined = (
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

export const extractBanesePayload = (
  receivable: AdapterReceivable,
  key: string,
) => {
  const metadata = metadataFrom(receivable);
  return asRecord(metadata[key]);
};

const BANESE_BOLETO_SPECIES = new Set([
  2,
  4,
  8,
  9,
  10,
  11,
  12,
  17,
  20,
  21,
  22,
  23,
  31,
  99,
]);

export const calculateBaneseNossoNumero = (
  agenciaValue: unknown,
  sequenceValue: unknown,
) => {
  const agencia = onlyDigits(agenciaValue).padStart(3, "0").slice(-3);
  const sequence = onlyDigits(sequenceValue).padStart(8, "0").slice(-8);
  if (
    !/^\d{3}$/.test(agencia) || agencia === "000" || !/^\d{8}$/.test(sequence)
  ) {
    throw new BaneseAdapterConfigurationError(
      "Agencia ou sequencia invalida para calcular o Nosso Numero Banese.",
    );
  }

  const base = `${agencia}${sequence}`;
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${sequence}${digit}`;
};

export const boletoSpecies = (value: unknown) => {
  const parsed = Number(value ?? 21);
  if (!Number.isInteger(parsed) || !BANESE_BOLETO_SPECIES.has(parsed)) {
    throw new BaneseAdapterConfigurationError(
      "CodigoEspecie do boleto Banese nao pertence ao dominio homologado.",
    );
  }
  return parsed;
};

export const assertBoletoResponseNumber = (
  value: unknown,
  length: number,
  fieldName: string,
) => {
  const normalized = onlyDigits(value);
  if (normalized.length !== length) {
    const error = new BaneseAdapterError(
      `Banese registrou o boleto, mas retornou ${fieldName} invalido. Nao gere outra cobranca com o mesmo recebivel antes de conciliar.`,
    );
    (error as BaneseAdapterError & { remotePaymentCreated?: boolean })
      .remotePaymentCreated = true;
    throw error;
  }
  return normalized;
};

export const studentBoletoUrl = (
  input: AdapterCreateChargeInput,
  receivableId: string,
) => {
  const base = firstString(input.successUrl, input.pendingUrl);
  if (!base || !receivableId) return null;
  try {
    const url = new URL(base);
    url.pathname = "/aluno";
    url.search = "";
    url.hash = "";
    url.searchParams.set("module", "financeiro");
    url.searchParams.set("banesePayment", receivableId);
    return url.toString();
  } catch {
    return null;
  }
};

export const markRemotePaymentMayExist = (error: unknown) => {
  const wrapped = error instanceof Error
    ? error
    : new BaneseAdapterError(String(error || "Falha na API Banese."));
  (wrapped as Error & { remotePaymentCreated?: boolean }).remotePaymentCreated =
    true;
  return wrapped;
};
