import { formatCpf, onlyDigits } from '../../../../shared/utils/identityValidation';
import { resolveSnapshotStudentIdentity } from '../../../../shared/utils/student-document-presentation';
import {
  CIN_DOCUMENT_TYPE,
  CNH_DOCUMENT_TYPE,
  LEGACY_RG_DOCUMENT_TYPE,
} from '../../../../shared/utils/technicalEnrollmentRequirements';
import type { CertificadoAcademico } from '../certificados.types';

/** Formatting a CPF slot does not classify the student's identity document. */
const formatCompleteCpf = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return /^[\d.\-\s]+$/.test(text) && onlyDigits(text).length === 11
    ? formatCpf(text) : text;
};

const identityForCertificate = (certificate: CertificadoAcademico) => {
  if (certificate.modalidade !== 'EAD') throw new Error('Identidade exclusiva do certificado EAD.');
  const snapshot = certificate.metadados || {};
  const identity = resolveSnapshotStudentIdentity(snapshot, certificate.aluno);
  const cpf = Object.prototype.hasOwnProperty.call(snapshot, 'studentCpf')
    ? snapshot.studentCpf : certificate.aluno?.cpf_cnpj;
  const labels: Record<string, string> = {
    [CIN_DOCUMENT_TYPE]: 'CIN',
    [CNH_DOCUMENT_TYPE]: 'CNH',
    [LEGACY_RG_DOCUMENT_TYPE]: 'RG',
  };
  return {
    identity,
    cpf: formatCompleteCpf(cpf),
    label: labels[identity.type] || identity.type,
    number: identity.isCin ? formatCompleteCpf(identity.number) : identity.number,
  };
};

/** Raw values only: the shared EAD renderer escapes them once during interpolation. */
export const buildEadCertificateIdentityVars = (certificate: CertificadoAcademico): Record<string, string> => {
  const { cpf, label, number } = identityForCertificate(certificate);
  const documentNumber = number || '________________';
  return {
    cpf,
    rg: documentNumber,
    documento_tipo: label,
    tipo_documento: label,
    documento_numero: documentNumber,
    numero_documento: documentNumber,
    ALUNO_CPF: cpf,
    ALUNO_RG: documentNumber,
    ALUNO_DOCUMENTO_TIPO: label,
    ALUNO_TIPO_DOCUMENTO: label,
    ALUNO_DOCUMENTO_NUMERO: documentNumber,
    ALUNO_NUMERO_DOCUMENTO: documentNumber,
  };
};

/** Change the label next to a student token, never punctuation, markup or fiscal CPF. */
export const prepareEadCertificateIdentityTemplate = (
  source: string,
  certificate: CertificadoAcademico,
): string => {
  const { identity, label } = identityForCertificate(certificate);
  const text = String(source || '');
  if (/\{\{(?:ANO_CALENDARIO|VALOR_TOTAL|VALOR_EXTENSO|RESPONSAVEL_FINANCEIRO_)/.test(text)) return text;

  const inline = '(?:\\s|&nbsp;|&#160;|<\\/?(?:b|strong|span|i|em)\\b[^>]*>)*';
  const separator = `${inline}(?::${inline})?(?:n\\.?(?:[º°o]|&ordm;|&deg;)?\\.?${inline})?(?::${inline})?`;
  const cpf = '\\{\\{(?:cpf|ALUNO_CPF)\\}\\}';
  const number = '\\{\\{(?:rg|ALUNO_RG|documento_numero|numero_documento|ALUNO_DOCUMENTO_NUMERO|ALUNO_NUMERO_DOCUMENTO)\\}\\}';
  let result = text.replace(new RegExp(`\\b(?:CPF|CIN|CNI)(?=${separator}${cpf})`, 'gi'), identity.isCin ? 'CIN' : 'CPF');

  // Only known labels enter model markup; an unknown type is exposed as escaped variable data.
  if (['CIN', 'CNH', 'RG', 'PASSAPORTE', 'CARTEIRA PROFISSIONAL'].includes(label)) {
    result = result.replace(new RegExp(`\\b(?:RG(?:\\s*/\\s*Documento)?|CPF|CIN|CNI|CNH|Documento)(?=${separator}${number})`, 'gi'),
      label);
  }
  return result;
};
