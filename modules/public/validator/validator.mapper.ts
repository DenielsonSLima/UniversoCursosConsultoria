import { DOCUMENT_VALIDATION_POLICIES } from '../../shared/document-validation/document-validation.policies';
import {
  type AcademicDocumentValidationResult,
  type CarteirinhaValidationResult,
  type DocumentValidationResult,
  type ValidationStatus,
} from './validator.types';
import { isPublicAcademicDocumentType } from './validator.rendering';
import {
  REQUIRED_PUBLIC_VALIDATION_FIELDS,
  isPublicValidationField,
  normalizeVisibleFields,
  type PublicValidationField,
} from './validator.fields';

type ValidationRecord = Record<string, unknown>;
type AliasedRecordValue = {
  present: boolean;
  value: unknown;
};

const VALIDATION_TIME_ZONE = 'America/Maceio';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const hasOwn = (record: ValidationRecord, key: string) => (
  Object.prototype.hasOwnProperty.call(record, key)
);

const asOptionalString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const maskCpf = (cpf?: string | null) => {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length < 2) return '***.***.***-**';
  return `***.***.***-${digits.slice(-2)}`;
};

const maskBirthDate = (date?: string | null) => {
  const year = (date || '').match(/(?:^|\D)([12]\d{3})(?:\D|$)/)?.[1];
  return year ? `**/**/${year}` : '**/**/****';
};

const maskName = (name?: string | null) => {
  const normalizedName = (name || '')
    .replace(/\*/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (normalizedName.toLocaleLowerCase('pt-BR') === 'não informado') {
    return 'Não informado';
  }
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Aluno não identificado';
  return parts.length > 1
    ? `${parts[0]} ${parts[1][0]}***`
    : parts[0];
};

const maskEnrollmentNumber = (value?: string | null) => {
  if (!value) return '****';
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!normalized) return '****';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  const visiblePrefixLength = Math.max(2, normalized.length - 6);
  return `${normalized.slice(0, visiblePrefixLength)}****${normalized.slice(-2)}`;
};

const readAliasedValue = (
  record: ValidationRecord,
  aliases: readonly string[],
): AliasedRecordValue => {
  const key = aliases.find((alias) => hasOwn(record, alias));
  return key
    ? { present: true, value: record[key] }
    : { present: false, value: undefined };
};

const parseDateOnly = (value: string) => {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

const getMaceioDateKey = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VALIDATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value || ''
  );
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const formatPublicValidationDate = (date?: string | null) => {
  if (!date) return null;
  const isDateOnlyInput = DATE_ONLY_PATTERN.test(date);
  const dateOnly = parseDateOnly(date);
  if (isDateOnlyInput && !dateOnly) return null;
  if (dateOnly) {
    return `${String(dateOnly.day).padStart(2, '0')}/${String(dateOnly.month).padStart(2, '0')}/${dateOnly.year}`;
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? null
    : new Intl.DateTimeFormat('pt-BR', {
        timeZone: VALIDATION_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(parsed);
};

export const isPublicValidationDateExpired = (
  date: string,
  now: Date = new Date(),
): boolean | null => {
  const isDateOnlyInput = DATE_ONLY_PATTERN.test(date);
  const dateOnly = parseDateOnly(date);
  if (isDateOnlyInput && !dateOnly) return null;
  if (dateOnly) {
    return date < getMaceioDateKey(now);
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime() < now.getTime();
};

const calculateStatus = (
  storedStatus?: string | null,
  expiresAt?: string | null,
): ValidationStatus | null => {
  if (storedStatus === 'REVOKED' || storedStatus === 'CANCELADO') return 'revoked';
  if (storedStatus === 'EXPIRED') return 'expired';
  if (storedStatus !== 'ACTIVE') return null;
  if (!expiresAt) return 'valid';
  const expired = isPublicValidationDateExpired(expiresAt);
  if (expired === null) return null;
  return expired ? 'expired' : 'valid';
};

const normalizeValidationCode = (value: string) => (
  value.trim().toUpperCase().replace(/\s+/g, '')
);

const resolveVisibilityProfile = (
  record: ValidationRecord,
): {
  visibleFields: PublicValidationField[];
  schemaVersion: number;
} | null => {
  const schema = readAliasedValue(record, [
    'schemaVersion',
    'schema_version',
    'versaoPublica',
    'versao_publica',
  ]);
  const fields = readAliasedValue(record, [
    'visibleFields',
    'visible_fields',
    'camposPublicos',
    'campos_publicos',
  ]);

  if (!schema.present) {
    if (fields.present) return null;
    return {
      visibleFields: [...REQUIRED_PUBLIC_VALIDATION_FIELDS],
      schemaVersion: 1,
    };
  }

  if (
    typeof schema.value !== 'number'
    || !Number.isInteger(schema.value)
    || schema.value < 1
    || !fields.present
    || !Array.isArray(fields.value)
  ) {
    return null;
  }

  const fieldValues = fields.value;
  if (
    fieldValues.some((field) => !isPublicValidationField(field))
    || REQUIRED_PUBLIC_VALIDATION_FIELDS.some(
      (required) => !fieldValues.includes(required),
    )
  ) {
    return null;
  }

  return {
    visibleFields: normalizeVisibleFields(fieldValues),
    schemaVersion: schema.value,
  };
};

/**
 * Converte somente o contrato retornado pela RPC canônica. Tipos desconhecidos
 * são recusados antes de a página entrar no estado válido.
 */
export const mapCanonicalValidationRecord = (
  value: unknown,
  code: string,
): DocumentValidationResult | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as ValidationRecord;
  const type = record.type;
  if (type !== 'carteirinha' && !isPublicAcademicDocumentType(type)) return null;

  const queriedCode = normalizeValidationCode(code);
  const recordCode = asOptionalString(record.code);
  if (
    !queriedCode
    || !recordCode
    || recordCode !== normalizeValidationCode(recordCode)
    || recordCode !== queriedCode
  ) {
    return null;
  }

  const expiresAt = asOptionalString(record.expiresAt);
  const storedStatus = asOptionalString(record.status);
  const status = calculateStatus(storedStatus, expiresAt);
  const visibilityProfile = resolveVisibilityProfile(record);
  if (!status || !visibilityProfile) return null;

  const motherName = asOptionalString(record.maskedMotherName)
    || asOptionalString(record.studentMotherName);
  const base = {
    type,
    status,
    code: recordCode,
    studentName: maskName(asOptionalString(record.studentName)),
    studentPhotoUrl: asOptionalString(record.studentPhotoUrl),
    maskedCpf: maskCpf(asOptionalString(record.studentCpf)),
    maskedBirthDate: maskBirthDate(asOptionalString(record.studentBirthDate)),
    maskedMotherName: motherName ? maskName(motherName) : 'Não informado',
    maskedEnrollmentNumber: maskEnrollmentNumber(
      asOptionalString(record.maskedEnrollmentNumber)
      || asOptionalString(record.enrollmentNumber),
    ),
    courseName: asOptionalString(record.courseName) || 'Curso não informado',
    className: asOptionalString(record.className) || 'Turma não informada',
    institutionName: asOptionalString(record.institutionName)
      || 'Universo Cursos e Consultoria',
    institutionCnpj: asOptionalString(record.institutionCnpj) || 'Não informado',
    unitName: asOptionalString(record.unitName) || 'Unidade não informada',
    enrollmentStatus: asOptionalString(record.enrollmentStatus) || 'NÃO INFORMADO',
    issuedAt: formatPublicValidationDate(asOptionalString(record.issuedAt)),
    lastIssuedAt: formatPublicValidationDate(
      asOptionalString(record.lastIssuedAt) || asOptionalString(record.issuedAt),
    ),
    expiresAt: formatPublicValidationDate(expiresAt),
    referencePeriod: asOptionalString(record.referencePeriod),
    issueCount: Number(record.issueCount || 1),
    enrollmentDate: formatPublicValidationDate(
      asOptionalString(record.enrollmentDate)
      || asOptionalString(record.enrollment_date),
    ),
    visibleFields: visibilityProfile.visibleFields,
    schemaVersion: visibilityProfile.schemaVersion,
  };

  if (type === 'carteirinha') {
    return {
      ...base,
      type,
      enrollmentDate: formatPublicValidationDate(asOptionalString(record.enrollmentDate)),
      estimatedValidity: formatPublicValidationDate(expiresAt),
      registryMode: record.registryMode === 'enrollment'
        ? 'enrollment'
        : 'emission',
    } satisfies CarteirinhaValidationResult;
  }

  return {
    ...base,
    type,
    documentTitle: DOCUMENT_VALIDATION_POLICIES[type].title,
    registryMode: 'emission',
  } satisfies AcademicDocumentValidationResult;
};
