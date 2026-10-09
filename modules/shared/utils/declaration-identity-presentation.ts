import { formatCpf, onlyDigits } from '../../../lib/documentFormatters';
import { prepareStudentIdentityTemplate } from './student-document-presentation';
import type { resolveStudentIdentityDocument } from './studentIdentityDocument';

type Identity = ReturnType<typeof resolveStudentIdentityDocument>;
const space = '(?:\\s|&nbsp;|&#160;)*';
const open = `(?:<(?:b|strong|span|i|em)\\b[^>]*>${space})*`;
const close = `(?:${space}<\\/(?:b|strong|span|i|em)>)*`;
const slot = (name: string) => `${open}\\{\\{?(?:${name})\\}\\}?${close}`;
const numberPrefix = `(?:n\\.?(?:[º°o]|&ordm;|&deg;)?\\.?${space})?`;
const separator = `${space}(?::${space})?${numberPrefix}(?::${space})?`;
const optionalPrefix = `(?:[,;]${space})?`;
const escaped = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));
const present = (value: unknown) => {
  const text = String(value ?? '').trim();
  return /^(?:n[aã]o informad[oa]|documento n[aã]o informado|[—-])$/i.test(text) ? '' : text;
};
const completeCpf = (value: unknown) => {
  const text = present(value);
  return /^[\d.\-\s]+$/.test(text) && onlyDigits(text).length === 11 ? formatCpf(text) : text;
};

export const isEnrollmentDeclaration = (documentType?: string) => (
  documentType === 'declaracao_matricula' || documentType === 'declaracao_frequencia'
);

/** Presentation only: identity classification and snapshot selection happen upstream. */
export const renderDeclarationIdentity = (
  source: string,
  identity: Identity,
  cpfValue: unknown,
): string => {
  const cpf = completeCpf(cpfValue);
  const number = identity.isCin ? completeCpf(identity.number) : present(identity.number);
  const hasDocument = Boolean(present(identity.type) && number);
  const issuer = hasDocument ? present(identity.issuer) : '';
  const state = hasDocument ? present(identity.state) : '';
  const date = hasDocument ? present(identity.issueDate) : '';
  const values: Record<string, string> = {
    ALUNO_CPF: cpf,
    ALUNO_RG: hasDocument ? number : '',
    ALUNO_DOCUMENTO_TIPO: hasDocument ? present(identity.label) : '',
    ALUNO_TIPO_DOCUMENTO: hasDocument ? present(identity.label) : '',
    ALUNO_RG_ORGAO: issuer,
    ALUNO_RG_UF: state,
    ALUNO_RG_EMISSAO: /^\d{4}-\d{2}-\d{2}/.test(date)
      ? date.slice(0, 10).split('-').reverse().join('/') : date,
  };
  let result = prepareStudentIdentityTemplate(source, identity.isCin);
  const literalLabel = (label: string) => `${open}(?:${label})${close}`;
  const documentLabel = identity.isCin ? 'CIN'
    : identity.type === 'RG (ANTIGO)' ? 'RG' : identity.type === 'CNH' ? 'CNH' : '';
  result = result.replace(new RegExp(`\\b(?:CPF|CIN|CNI)(?=${close}${separator}${slot('ALUNO_CPF')})`, 'gi'), identity.isCin ? 'CIN' : 'CPF');
  if (documentLabel) {
    result = result.replace(new RegExp(`\\b(?:RG|CIN|CNI|CNH)(?=${close}${separator}${slot('ALUNO_RG')})`, 'gi'), documentLabel);
  }
  if (!hasDocument) {
    // Existing saved models use this optional clause after the CPF; preserve the surrounding prose.
    result = result.replace(new RegExp(`${optionalPrefix}${slot('ALUNO_(?:DOCUMENTO_TIPO|TIPO_DOCUMENTO)')}${separator}${slot('ALUNO_RG')}`, 'gi'), '');
    result = result.replace(new RegExp(`${optionalPrefix}${literalLabel('RG|CIN|CNI|CNH|Documento')}${separator}${slot('ALUNO_RG')}`, 'gi'), '');
  }
  if (!cpf) {
    result = result.replace(new RegExp(`${optionalPrefix}(?:portador\\(a\\)${space}d[oa]${space}|inscrito\\(a\\)${space}no${space})?${literalLabel('CPF|CIN|CNI')}${separator}${slot('ALUNO_CPF')}`, 'gi'), '');
  }
  // Paired issuer/state slots keep only available metadata, without a dangling slash.
  const issuerState = `${slot('ALUNO_RG_ORGAO')}${space}/${space}${slot('ALUNO_RG_UF')}`;
  if (!issuer && !state) {
    result = result.replace(new RegExp(`${optionalPrefix}[óo]rg[ãa]o(?:${space}(?:emissor|expedidor))?${separator}${issuerState}`, 'gi'), '');
  }
  result = result.replace(new RegExp(issuerState, 'gi'),
    () => escaped([issuer, state].filter(Boolean).join(' / ')));
  const optionalLabels: Record<string, string> = {
    ALUNO_RG_ORGAO: '(?:[óo]rg[ãa]o(?:${SPACE}(?:emissor|expedidor))?|(?:expedido|emitido)(?:\\(a\\))?${SPACE}pelo)',
    ALUNO_RG_UF: 'UF(?:${SPACE}de${SPACE}(?:emiss[ãa]o|expedi[çc][ãa]o))?',
    ALUNO_RG_EMISSAO: '(?:data${SPACE}de${SPACE}(?:emiss[ãa]o|expedi[çc][ãa]o)|(?:expedido|emitido)(?:\\(a\\))?${SPACE}em)',
  };
  for (const [token, label] of Object.entries(optionalLabels)) {
    if (values[token]) continue;
    result = result.replace(new RegExp(`${optionalPrefix}${label.replaceAll('${SPACE}', space)}${separator}${slot(token)}`, 'gi'), '');
  }
  // Explicit conditional fields also work in custom models, including complete labelled blocks.
  result = result.replace(/\{\{#(ALUNO_(?:CPF|RG(?:_ORGAO|_UF|_EMISSAO)?|DOCUMENTO_TIPO|TIPO_DOCUMENTO))\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, token: string, content: string) => values[token] ? content : '');
  return result.replace(/\{\{?(ALUNO_(?:CPF|RG(?:_ORGAO|_UF|_EMISSAO)?|DOCUMENTO_TIPO|TIPO_DOCUMENTO))\}\}?/g,
    (_, token: string) => escaped(values[token]));
};
