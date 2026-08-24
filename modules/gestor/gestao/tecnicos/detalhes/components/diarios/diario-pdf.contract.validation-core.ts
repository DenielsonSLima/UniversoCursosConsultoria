import type {
  DiarioPdfCoverField,
  DiarioPdfGradeSnapshot,
} from "./diario-pdf.contract.types.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
export const VALIDATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{7,127}$/;
const INLINE_WATERMARK_DATA_URI_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u;
const INLINE_WATERMARK_MAX_BYTES = 1024 * 1024;

export const RESULT_VALUES = new Set<
  DiarioPdfGradeSnapshot["resultado_final"]
>([
  "APROVEITADO",
  "SEM_LANCAMENTO",
  "FREQUENCIA_PENDENTE",
  "REPROVADO_FREQUENCIA",
  "APROVADO",
  "EM_RECUPERACAO",
  "REPROVADO",
]);

export const COVER_FIELD_IDS = new Set<DiarioPdfCoverField["id"]>([
  "curso",
  "modulo",
  "areaTematica",
  "disciplina",
  "turma",
  "professor",
]);

export function fail(path: string, reason: string): never {
  throw new Error(
    `Snapshot acadêmico do Diário inválido em ${path}: ${reason}.`,
  );
}

export const asRecord = (
  value: unknown,
  path: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "objeto obrigatório");
  }
  return value as Record<string, unknown>;
};

export const assertExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  path: string,
) => {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) =>
    !Object.prototype.hasOwnProperty.call(value, key)
  );
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length || extra.length) {
    fail(
      path,
      [
        missing.length ? `faltam ${missing.join(", ")}` : "",
        extra.length ? `sobram ${extra.join(", ")}` : "",
      ].filter(Boolean).join("; "),
    );
  }
};

export function assertText(
  value: unknown,
  path: string,
  { allowEmpty = false, max = 5000 }: { allowEmpty?: boolean; max?: number } =
    {},
): asserts value is string {
  if (
    typeof value !== "string" || value.length > max ||
    (!allowEmpty && !value.trim())
  ) {
    fail(path, "texto fora do contrato");
  }
}

export function assertBoolean(
  value: unknown,
  path: string,
): asserts value is boolean {
  if (typeof value !== "boolean") fail(path, "booleano obrigatório");
}

export function assertNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    fail(path, "número fora do contrato");
  }
}

export function assertUuid(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(path, "UUID obrigatório");
  }
}

export function assertSha256(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "SHA-256 hexadecimal minúsculo obrigatório");
  }
}

export function assertTimestamp(
  value: unknown,
  path: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(path, "instante ISO 8601 obrigatório");
  }
}

export function assertIsoDate(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string") fail(path, "data ISO obrigatória");
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) fail(path, "data ISO YYYY-MM-DD obrigatória");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(path, "data inexistente");
  }
}

export const assertCanonicalAssetUrl = (
  value: unknown,
  path: string,
  nullable = false,
) => {
  if (nullable && value === null) return;
  if (typeof value !== "string") fail(path, "URL HTTPS canônica obrigatória");
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.href !== value
    ) {
      fail(path, "URL HTTPS canônica sem credenciais, query ou fragmento");
    }
  } catch {
    fail(path, "URL HTTPS canônica obrigatória");
  }
};

export const assertCanonicalWatermarkSource = (
  value: unknown,
  path: string,
  nullable = false,
) => {
  if (nullable && value === null) return;
  if (typeof value !== "string") {
    fail(path, "URL HTTPS ou data URI canônica obrigatória");
  }
  const inline = INLINE_WATERMARK_DATA_URI_PATTERN.exec(value);
  if (!inline) {
    assertCanonicalAssetUrl(value, path);
    return;
  }
  const encoded = inline[2];
  if (encoded.length % 4 !== 0) fail(path, "base64 canônico obrigatório");
  try {
    const decoded = globalThis.atob(encoded);
    if (
      decoded.length === 0 ||
      decoded.length > INLINE_WATERMARK_MAX_BYTES ||
      globalThis.btoa(decoded) !== encoded
    ) {
      fail(path, "data URI canônica de até 1 MiB obrigatória");
    }
  } catch {
    fail(path, "data URI base64 inválida");
  }
};

export const assertNullableGrade = (value: unknown, path: string) => {
  if (value !== null) assertNumber(value, path, 0, 10);
};

export const sameKeys = (
  actual: Record<string, unknown>,
  expected: readonly string[],
  path: string,
) => {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(path, "chaves não correspondem ao conjunto acadêmico congelado");
  }
};

export const nearlyEqual = (
  left: number,
  right: number,
  tolerance = 0.011,
) => Math.abs(left - right) <= tolerance;
