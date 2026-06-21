import { supabase } from '../../../lib/supabase';
import { formatMatricula } from '../../../lib/academicUtils';
import { academicosService } from '../../gestor/configuracoes/academicos/academicos.service';
import {
  AcademicDocumentValidationResult,
  CarteirinhaValidationResult,
  DocumentValidationResult,
  ValidationStatus,
} from './validator.types';
import { DOCUMENT_VALIDATION_POLICIES } from '../../shared/document-validation/document-validation.policies';
import { ValidatableDocumentType } from '../../shared/document-validation/document-validation.types';

const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

const maskCpf = (cpf?: string | null) => {
  if (cpf?.includes('*')) return cpf;
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.***.***-${digits.slice(-2)}`;
};

const maskBirthDate = (date?: string | null) => {
  if (date?.includes('*')) return date;
  if (!date) return '**/**/****';
  const [year] = date.split('T')[0].split('-');
  return year ? `**/**/${year}` : '**/**/****';
};

const maskName = (name?: string | null) => {
  if (name?.includes('*')) return name;
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Aluno não identificado';
  return parts.map((part, index) =>
    index === 0 ? part : `${part[0]}${'*'.repeat(Math.max(2, part.length - 1))}`
  ).join(' ');
};

const maskEnrollmentNumber = (value?: string | null) => {
  if (!value) return '****';
  if (value.includes('*')) return value;
  const normalized = value.trim().toUpperCase();
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  const visiblePrefixLength = Math.max(2, normalized.length - 6);
  return `${normalized.slice(0, visiblePrefixLength)}****${normalized.slice(-2)}`;
};

const formatDate = (date?: string | null) => {
  if (!date) return null;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('pt-BR');
};

const calculateStatus = (
  storedStatus?: string | null,
  expiresAt?: string | null
): ValidationStatus => {
  if (storedStatus === 'REVOKED' || storedStatus === 'CANCELADO') return 'revoked';
  if (storedStatus === 'EXPIRED') return 'expired';
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'expired';
  return 'valid';
};

const activeEnrollmentDocuments = new Set<ValidatableDocumentType>([
  'carteirinha',
  'cracha_estagio',
  'declaracao_matricula',
  'declaracao_frequencia',
  'rematricula',
]);

const validateEmissionRegistry = async (
  code: string
): Promise<DocumentValidationResult | null> => {
  const { data: rpcRecord, error: rpcError } = await supabase.rpc(
    'validar_documento_por_codigo',
    { p_codigo: code }
  );

  if (!rpcError && rpcRecord) {
    return await mapValidationRecord(rpcRecord as any, code, true);
  }

  const { data, error } = await supabase
    .from('documentos_templates')
    .select('conteudo')
    .eq('id', `validation_${code}`)
    .maybeSingle();

  if (error || !data?.conteudo) return null;
  return await mapValidationRecord(data.conteudo as any, code);
};

const mapValidationRecord = async (
  record: any,
  code: string,
  statusResolvedByDatabase = false
): Promise<DocumentValidationResult | null> => {
  const type = record.type as ValidatableDocumentType;
  let currentEnrollmentStatus = String(record.enrollmentStatus || '').toUpperCase();

  if (
    !statusResolvedByDatabase &&
    record.enrollmentId &&
    activeEnrollmentDocuments.has(type)
  ) {
    const { data: enrollment } = await supabase
      .from('matriculas')
      .select('status')
      .eq('id', record.enrollmentId)
      .maybeSingle();
    if (enrollment?.status) {
      currentEnrollmentStatus = String(enrollment.status).toUpperCase();
    }
  }

  const status = !statusResolvedByDatabase &&
    activeEnrollmentDocuments.has(type) &&
    currentEnrollmentStatus !== 'ATIVO'
    ? 'revoked'
    : calculateStatus(record.status, record.expiresAt);
  const base = {
    type,
    status,
    code,
    studentName: maskName(record.studentName),
    studentPhotoUrl: record.studentPhotoUrl || null,
    maskedCpf: maskCpf(record.studentCpf),
    maskedBirthDate: maskBirthDate(record.studentBirthDate),
    maskedMotherName: maskName(record.maskedMotherName || record.studentMotherName),
    maskedEnrollmentNumber: maskEnrollmentNumber(
      record.maskedEnrollmentNumber || record.enrollmentNumber
    ),
    courseName: record.courseName || 'Curso não informado',
    className: record.className || 'Turma não informada',
    institutionName: record.institutionName || 'Universo Cursos e Consultoria',
    institutionCnpj: record.institutionCnpj || 'Não informado',
    unitName: record.unitName || 'Unidade não informada',
    enrollmentStatus: currentEnrollmentStatus || 'NÃO INFORMADO',
    issuedAt: formatDate(record.issuedAt),
    lastIssuedAt: formatDate(record.lastIssuedAt || record.issuedAt),
    expiresAt: formatDate(record.expiresAt),
    referencePeriod: record.referencePeriod || null,
    issueCount: Number(record.issueCount || 1),
  };

  if (type === 'carteirinha') {
    return {
      ...base,
      type: 'carteirinha',
      enrollmentDate: formatDate(record.enrollmentDate),
      estimatedValidity: formatDate(record.expiresAt),
      registryMode: 'emission',
    } as CarteirinhaValidationResult;
  }

  if (!DOCUMENT_VALIDATION_POLICIES[type]) return null;
  return {
    ...base,
    type,
    documentTitle: DOCUMENT_VALIDATION_POLICIES[type].title,
    registryMode: 'emission',
  } as AcademicDocumentValidationResult;
};

const validateLegacyCarteirinha = async (
  code: string
): Promise<CarteirinhaValidationResult | null> => {
  const [configs, response] = await Promise.all([
    academicosService.getConfigs(),
    supabase
      .from('matriculas')
      .select(`
        id, status, data_matricula, aluno_id,
        parceiros!inner(nome, cpf_cnpj, data_nascimento, foto_url, nome_mae),
        turmas!inner(nome, codigo, polo_id, cursos!inner(nome), polos!inner(nome, cnpj))
      `),
  ]);

  if (response.error) throw response.error;
  const matched = (response.data || []).find((matricula: any) =>
    normalizeCode(formatMatricula(
      matricula.id,
      matricula.data_matricula,
      matricula.turmas?.polo_id,
      configs
    )) === code
  ) as any;

  if (!matched) return null;
  const enrollmentStatus = String(matched.status || '').toUpperCase();
  const validity = new Date(matched.data_matricula);
  validity.setMonth(validity.getMonth() + (configs.validityMonths || 12));

  return {
    type: 'carteirinha',
    status: enrollmentStatus === 'ATIVO'
      ? calculateStatus(null, validity.toISOString())
      : 'revoked',
    code,
    studentName: maskName(matched.parceiros?.nome),
    studentPhotoUrl: matched.parceiros?.foto_url || null,
    maskedCpf: maskCpf(matched.parceiros?.cpf_cnpj),
    maskedBirthDate: maskBirthDate(matched.parceiros?.data_nascimento),
    maskedMotherName: maskName(matched.parceiros?.nome_mae),
    maskedEnrollmentNumber: maskEnrollmentNumber(
      formatMatricula(matched.id, matched.data_matricula, matched.turmas?.polo_id, configs)
    ),
    courseName: matched.turmas?.cursos?.nome || 'Curso não informado',
    className: matched.turmas?.nome || matched.turmas?.codigo || 'Turma não informada',
    institutionName: 'Universo Cursos e Consultoria',
    institutionCnpj: matched.turmas?.polos?.cnpj || 'Não informado',
    unitName: matched.turmas?.polos?.nome || 'Unidade não informada',
    enrollmentStatus,
    issuedAt: formatDate(matched.data_matricula),
    lastIssuedAt: formatDate(matched.data_matricula),
    expiresAt: validity.toLocaleDateString('pt-BR'),
    referencePeriod: null,
    issueCount: 1,
    enrollmentDate: formatDate(matched.data_matricula),
    estimatedValidity: validity.toLocaleDateString('pt-BR'),
    registryMode: 'enrollment',
  };
};

export const validatorService = {
  async validate(rawCode: string): Promise<DocumentValidationResult | null> {
    const code = normalizeCode(rawCode);
    if (code.length < 5) return null;

    const registered = await validateEmissionRegistry(code);
    if (registered) return registered;
    return validateLegacyCarteirinha(code);
  },
};
