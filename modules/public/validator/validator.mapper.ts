import { DOCUMENT_VALIDATION_POLICIES } from '../../shared/document-validation/document-validation.policies';
import {
  type AcademicDocumentValidationResult,
  type CarteirinhaValidationResult,
  type CarteirinhaPreceptorValidationResult,
  type DocumentValidationResult,
  type ElectronicSignatureValidationResult,
  type ValidationStatus,
} from './validator.types';
import { isPublicAcademicDocumentType } from './validator.rendering';
import {
  REQUIRED_PUBLIC_VALIDATION_FIELDS,
  isPublicValidationFieldAllowedForDocument,
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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MASKED_CPF_PATTERN = /^\*\*\*\.\*\*\*\.\*\*\*-[0-9]{2}$/u;
const ISO_WITH_SECONDS_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;
const hasOwn = (record: ValidationRecord, key: string) => (
  Object.prototype.hasOwnProperty.call(record, key)
);

const asRecord = (value: unknown): ValidationRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as ValidationRecord
    : null
);

const hasExactKeys = (
  record: ValidationRecord,
  allowed: readonly string[],
) => (
  Object.keys(record).length === allowed.length
  && Object.keys(record).every((key) => allowed.includes(key))
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

const minimizeSignatureName = (name?: string | null) => {
  const normalizedName = (name || '')
    .replace(/\*/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const parts = normalizedName.split(' ').filter(Boolean);
  if (!parts.length) return null;
  return parts.length > 1
    ? `${parts[0]} ${parts[1][0]}***`
    : `${parts[0][0]}***`;
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

const mapCanonicalStatus = (storedStatus?: string | null): ValidationStatus | null => {
  if (storedStatus === 'REVOKED' || storedStatus === 'CANCELADO') return 'revoked';
  if (storedStatus === 'EXPIRED') return 'expired';
  if (storedStatus === 'ACTIVE') return 'valid';
  return null;
};

const normalizeValidationCode = (value: string) => (
  value.trim().toUpperCase().replace(/\s+/g, '')
);

const mapElectronicSignatureRecord = (
  record: ValidationRecord,
  queriedCode: string,
): ElectronicSignatureValidationResult | null => {
  if (!hasExactKeys(record, [
    'type',
    'proofKind',
    'status',
    'code',
    'document',
    'signature',
    'institution',
    'schemaVersion',
  ])) return null;

  const document = asRecord(record.document);
  const signature = asRecord(record.signature);
  const institution = asRecord(record.institution);
  if (
    !document || !signature || !institution
    || !hasExactKeys(document, ['type', 'code', 'finalSha256'])
    || !hasExactKeys(signature, [
      'eventId',
      'signerNameMasked',
      'signerCpfMasked',
      'role',
      'roleLabel',
      'signedAt',
      'hash',
    ])
    || !hasExactKeys(institution, ['name'])
  ) return null;

  const code = asOptionalString(record.code);
  const eventId = asOptionalString(signature.eventId);
  const signerNameMasked = asOptionalString(signature.signerNameMasked);
  const signerCpfMasked = asOptionalString(signature.signerCpfMasked);
  const signedAt = asOptionalString(signature.signedAt);
  const signatureHash = asOptionalString(signature.hash);
  const documentCode = asOptionalString(document.code);
  const documentFinalSha256 = asOptionalString(document.finalSha256);
  const institutionName = asOptionalString(institution.name);
  const role = signature.role;
  if (role !== 'PROFESSOR' && role !== 'COORDENADOR') return null;
  const expectedRoleLabel = role === 'PROFESSOR'
    ? 'Professor(a)'
    : 'Coordenador(a) de curso';
  const roleLabel = asOptionalString(signature.roleLabel);
  const minimizedName = minimizeSignatureName(signerNameMasked);
  const normalizedCode = normalizeValidationCode(queriedCode);
  const status = mapCanonicalStatus(asOptionalString(record.status));

  if (
    record.type !== 'assinatura_eletronica'
    || record.proofKind !== 'SIGNATURE_EVENT'
    || record.schemaVersion !== 1
    || (status !== 'valid' && status !== 'revoked')
    || !code || !SIGNATURE_CODE_PATTERN.test(code)
    || code !== normalizedCode
    || !eventId || !UUID_PATTERN.test(eventId)
    || code !== `SIG-${eventId.toUpperCase()}`
    || !signerNameMasked || !minimizedName || signerNameMasked !== minimizedName
    || !signerCpfMasked || !MASKED_CPF_PATTERN.test(signerCpfMasked)
    || roleLabel !== expectedRoleLabel
    || !signedAt || !ISO_WITH_SECONDS_PATTERN.test(signedAt)
    || !Number.isFinite(Date.parse(signedAt))
    || !signatureHash || !SHA256_PATTERN.test(signatureHash)
    || document.type !== 'diario_classe'
    || !documentCode || !UUID_PATTERN.test(documentCode)
    || documentCode !== documentCode.toUpperCase()
    || !documentFinalSha256 || !SHA256_PATTERN.test(documentFinalSha256)
    || !institutionName
  ) return null;

  return {
    type: 'assinatura_eletronica',
    proofKind: 'SIGNATURE_EVENT',
    status,
    code,
    document: {
      type: 'diario_classe',
      code: documentCode,
      finalSha256: documentFinalSha256,
    },
    signature: {
      eventId: eventId.toLowerCase(),
      signerNameMasked,
      signerCpfMasked,
      role,
      roleLabel,
      signedAt,
      hash: signatureHash,
    },
    institution: { name: institutionName },
    schemaVersion: 1,
  };
};

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
  if (type === 'assinatura_eletronica') {
    return mapElectronicSignatureRecord(record, code);
  }
  if (
    type !== 'carteirinha'
    && type !== 'carteirinha_preceptor'
    && !isPublicAcademicDocumentType(type)
  ) return null;

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
  // Status e vencimento são decididos pela RPC. O browser apenas formata a
  // data recebida, sem reinterpretar a validade pelo próprio relógio.
  const status = mapCanonicalStatus(storedStatus);
  const visibilityProfile = resolveVisibilityProfile(record);
  if (!status || !visibilityProfile) return null;

  // Defesa em profundidade: ainda que uma política remota seja configurada de
  // forma inadequada, estes dois documentos não entram em estado público
  // válido se tentarem carregar atributos pessoais fora da allowlist.
  if (
    (type === 'contrato_aluno' || type === 'carteirinha_preceptor')
    && visibilityProfile.visibleFields.some((field) => (
      !isPublicValidationFieldAllowedForDocument(field, type)
    ))
  ) return null;

  const restrictSubjectIdentity = (
    type === 'contrato_aluno' || type === 'carteirinha_preceptor'
  );

  const motherName = asOptionalString(record.maskedMotherName)
    || asOptionalString(record.studentMotherName);
  const base = {
    type,
    status,
    code: recordCode,
    studentName: maskName(asOptionalString(record.studentName)),
    studentPhotoUrl: restrictSubjectIdentity
      ? null
      : asOptionalString(record.studentPhotoUrl),
    maskedCpf: restrictSubjectIdentity
      ? '***.***.***-**'
      : maskCpf(asOptionalString(record.studentCpf)),
    maskedBirthDate: restrictSubjectIdentity
      ? '**/**/****'
      : maskBirthDate(asOptionalString(record.studentBirthDate)),
    maskedMotherName: restrictSubjectIdentity
      ? 'Não informado'
      : (motherName ? maskName(motherName) : 'Não informado'),
    maskedEnrollmentNumber: restrictSubjectIdentity
      ? '****'
      : maskEnrollmentNumber(
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

  if (type === 'carteirinha_preceptor') {
    return {
      ...base,
      type,
      documentTitle: DOCUMENT_VALIDATION_POLICIES[type].title,
      registryMode: 'emission',
    } satisfies CarteirinhaPreceptorValidationResult;
  }

  return {
    ...base,
    type,
    documentTitle: DOCUMENT_VALIDATION_POLICIES[type].title,
    registryMode: 'emission',
  } satisfies AcademicDocumentValidationResult;
};
