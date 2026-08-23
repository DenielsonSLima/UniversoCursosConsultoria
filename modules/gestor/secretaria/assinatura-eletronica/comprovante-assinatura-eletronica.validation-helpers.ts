import type {
  ElectronicSignatureReceiptEventType,
  ElectronicSignatureReceiptHash,
  ElectronicSignatureReceiptMethod,
  ElectronicSignatureReceiptStatus,
} from "./comprovante-assinatura-eletronica.types.ts";

const HASH_LENGTH_BY_ALGORITHM = {
  "SHA-256": 64,
  "SHA-512": 128,
} as const;
const SENSITIVE_PUBLIC_CONTENT = [
  /\b\d{3}[.]?\d{3}[.]?\d{3}-?\d{2}\b/u,
  /\b(?:\d{1,3}[.]){3}\d{1,3}\b/u,
  /\b(?:cpf|ip|sess[aã]o|session|senha|password|pin|otp|token|bearer|cookie)\b/iu,
];
const UNSAFE_EDITOR_TEXT = /(?:https?:\/\/|www\.|<[^>]*>|\[[^\]]+\]\s*\()/iu;

export const statusLabels: Record<ElectronicSignatureReceiptStatus, string> = {
  ASSINADO: "ASSINADO",
  RECUSADO: "RECUSADO",
  CANCELADO: "CANCELADO",
  SUBSTITUIDO: "SUBSTITUÍDO",
};

export const statusColors: Record<
  ElectronicSignatureReceiptStatus,
  readonly [number, number, number]
> = {
  ASSINADO: [22, 101, 52],
  RECUSADO: [185, 28, 28],
  CANCELADO: [146, 64, 14],
  SUBSTITUIDO: [30, 64, 175],
};

export const eventLabels: Record<ElectronicSignatureReceiptEventType, string> = {
  DOCUMENTO_FECHADO: "Documento fechado e integridade registrada",
  DOCUMENTO_DISPONIBILIZADO: "Documento disponibilizado aos participantes",
  LEITURA_CONFIRMADA: "Leitura e concordância registradas",
  AUTENTICACAO_CONFIRMADA: "Autenticação confirmada",
  ASSINATURA_CONCLUIDA: "Assinatura eletrônica concluída",
  RECUSA_REGISTRADA: "Recusa registrada",
  CANCELAMENTO_REGISTRADO: "Cancelamento registrado",
  VERSAO_SUBSTITUIDA: "Versão substituída com preservação do original",
};

export const methodLabels: Record<ElectronicSignatureReceiptMethod, string> = {
  SENHA_REAUTENTICADA: "Senha da conta reautenticada",
  CONTA_E_PIN: "Conta autenticada e PIN",
  CONTA_E_OTP: "Conta autenticada e segundo fator",
  ASSINATURA_AVANCADA_EXTERNA: "Assinatura avançada externa",
  ICP_BRASIL: "Certificado ICP-Brasil",
};

export const assertString = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) {
    throw new Error(`${label} e obrigatorio para gerar o comprovante.`);
  }
  if (normalized.length > maximumLength) {
    throw new Error(`${label} excede o limite permitido para o comprovante.`);
  }
  if (SENSITIVE_PUBLIC_CONTENT.some((pattern) => pattern.test(normalized))) {
    throw new Error(
      `${label} contem dado tecnico ou pessoal que nao pode constar no comprovante.`,
    );
  }
  return normalized;
};

export const assertIdentifier = (value: unknown, label: string) => {
  const normalized = assertString(value, label, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(normalized)) {
    throw new Error(`${label} possui formato invalido para o comprovante.`);
  }
  return normalized;
};

export const assertEditorText = (
  value: unknown,
  label: string,
  maximumLength: number,
) => {
  const normalized = assertString(value, label, maximumLength);
  if (UNSAFE_EDITOR_TEXT.test(normalized)) {
    throw new Error(
      `${label} contem HTML, Markdown ou URL livre que nao pode constar no modelo.`,
    );
  }
  return normalized;
};

export const parseOccurredAt = (value: string, label: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} possui data e hora invalidas.`);
  }
  return parsed;
};

export const formatOccurredAt = (value: string) => {
  const instant = parseOccurredAt(value, "O evento");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const displayedUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMinutes = Math.round((displayedUtc - instant.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  return [
    `${parts.day}/${parts.month}/${parts.year}`,
    `${parts.hour}:${parts.minute}:${parts.second} UTC${sign}${offsetHours}:${offsetRemainder}`,
  ] as const;
};

export const validateHash = (
  hash: ElectronicSignatureReceiptHash,
) => {
  const expectedLength = HASH_LENGTH_BY_ALGORITHM[hash.algorithm];
  const value = String(hash.value || "").trim().toLowerCase();
  if (
    !expectedLength ||
    !new RegExp(`^[a-f0-9]{${expectedLength}}$`, "u").test(value)
  ) {
    throw new Error(`O hash ${hash.algorithm} do documento e invalido.`);
  }
  return value;
};

export type EditorRecord = Record<string, unknown>;

export const asEditorRecord = (value: unknown, label: string): EditorRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} e invalido.`);
  }
  return value as EditorRecord;
};

export const assertExactEditorKeys = (
  source: EditorRecord,
  expected: readonly string[],
  label: string,
) => {
  const keys = Object.keys(source).sort();
  const canonical = [...expected].sort();
  if (
    keys.length !== canonical.length ||
    keys.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} nao corresponde ao contrato autorizado.`);
  }
};

export const ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
