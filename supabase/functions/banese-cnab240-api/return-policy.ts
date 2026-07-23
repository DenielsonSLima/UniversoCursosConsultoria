import {
  cnab240Field,
  splitCnab240Lines,
} from "../gateways/api/banese-cnab240.codec.ts";
import type { ParsedEvent } from "../gateways/api/banese-cnab240.types.ts";
import { BANESE_CNAB_PROVIDER } from "./policy.ts";
import { type CnabContext, digits, sha256Text } from "./shared.ts";

const PROCESSING_LEASE_TIMEOUT_MS = 10 * 60 * 1_000;
const PROCESSING_BATCH_MAX_RECORDS = 100;
const PROCESSING_BATCH_BUDGET_MS = 35_000;

export const canProcessNextCnabRecord = (
  processedRecords: number,
  startedAt: number,
  now = Date.now(),
) =>
  processedRecords < PROCESSING_BATCH_MAX_RECORDS &&
  (processedRecords === 0 || now - startedAt < PROCESSING_BATCH_BUDGET_MS);

export const isCnabProcessingLeaseExpired = (
  updatedAt: unknown,
  now = Date.now(),
) => {
  const processingStartedAt = Date.parse(String(updatedAt || ""));
  return Number.isFinite(processingStartedAt) &&
    now - processingStartedAt >= PROCESSING_LEASE_TIMEOUT_MS;
};

export const resolveCnabFailureTransition = (status: unknown) => {
  const currentStatus = String(status || "");
  if (
    ["ACTIVATED", "RECORDED", "REVIEW_REQUIRED", "SKIPPED"].includes(
      currentStatus,
    )
  ) {
    return { terminal: true, status: currentStatus, action: null } as const;
  }
  if (currentStatus === "ACTIVATION_PENDING") {
    return {
      terminal: false,
      status: "ACTIVATION_PENDING",
      action: "ATIVACAO_FALHOU",
    } as const;
  }
  if (["MATCHED", "ERROR"].includes(currentStatus)) {
    return {
      terminal: false,
      status: "ERROR",
      action: "RETORNO_REVISAO",
    } as const;
  }
  throw new Error(
    "O estado do registro CNAB mudou durante o tratamento da falha.",
  );
};

export const assertCnabFileScope = (
  file: Record<string, unknown>,
  context: CnabContext,
  direction: "REMESSA" | "RETORNO",
) => {
  if (
    file.provider_code !== BANESE_CNAB_PROVIDER ||
    file.direction !== direction ||
    file.environment !== context.environment ||
    digits(file.convenio) !== context.convenio
  ) {
    throw new Error("Arquivo CNAB incompatível com o escopo Banese ativo.");
  }
};

const canonicalAgreement = (value: unknown) =>
  digits(value).replace(/^0+(?=\d)/, "");

export const assertReturnAgreement = (
  payload: string,
  expectedAgreement: string,
) => {
  const lines = splitCnab240Lines(payload);
  const header = lines[0]?.text || "";
  const lotAgreements = lines
    .filter((line) => cnab240Field(line.text, 8, 8) === "1")
    .map((line) => canonicalAgreement(cnab240Field(line.text, 34, 53)));
  const fileAgreement = canonicalAgreement(cnab240Field(header, 33, 52));
  const expected = canonicalAgreement(expectedAgreement);
  if (
    !expected ||
    fileAgreement !== expected ||
    !lotAgreements.length ||
    lotAgreements.some((agreement) => agreement !== expected)
  ) {
    throw new Error(
      "O convênio dos headers do retorno diverge da configuração Banese ativa.",
    );
  }
};

export const decodeReturnBase64 = (value: unknown) => {
  const encoded = String(value || "").trim();
  if (
    !encoded || encoded.length > 7_100_000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new Error("Conteúdo Base64 do retorno é inválido.");
  }
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("Conteúdo Base64 do retorno é inválido.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!bytes.length) throw new Error("O arquivo de retorno está vazio.");
  return bytes;
};

export const assertCnabReturnPayloadSafety = (
  bytes: Uint8Array,
  maximumRecords = 25_000,
) => {
  let lineBreaks = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte < 0x20 && byte !== 0x0a && byte !== 0x0d) {
      throw new Error("O retorno CNAB contém caractere de controle inválido.");
    }
    if (byte === 0x0a || (byte === 0x0d && bytes[index + 1] !== 0x0a)) {
      lineBreaks += 1;
      if (lineBreaks > maximumRecords) {
        throw new Error(
          "O retorno CNAB excede o limite de registros permitido.",
        );
      }
    }
  }
  const endsWithBreak = bytes.at(-1) === 0x0a || bytes.at(-1) === 0x0d;
  if (lineBreaks + (endsWithBreak ? 0 : 1) > maximumRecords) {
    throw new Error("O retorno CNAB excede o limite de registros permitido.");
  }
};

const moneyCents = (value: number) =>
  String(Math.round(Number(value || 0) * 100));

export const returnEventFingerprint = (
  context: CnabContext,
  event: ParsedEvent,
) =>
  sha256Text([
    BANESE_CNAB_PROVIDER,
    context.environment,
    context.convenio,
    event.nossoNumero,
    event.movementCode,
    moneyCents(event.nominalAmount),
    moneyCents(event.paidAmount),
    event.occurrenceDate || "",
    [...event.liquidationReasonCodes].sort().join(","),
  ].join("|"));
