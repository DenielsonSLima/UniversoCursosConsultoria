import { resolveStudentIdentityDocument, type StudentIdentitySource } from './studentIdentityDocument';

/** Ausência legada admite fallback; valor explícito do snapshot nunca é substituído. */
export const resolveSnapshotStudentIdentity = (snapshot: Record<string, any>, live?: StudentIdentitySource | null) => {
  const field = (key: string, fallback: unknown) => Object.prototype.hasOwnProperty.call(snapshot, key)
    ? snapshot[key] : fallback;
  return resolveStudentIdentityDocument({
    tipo_documento: field('studentDocumentType', live?.tipo_documento ?? live?.tipoDocumento),
    cpf_cnpj: field('studentCpf', live?.cpf_cnpj ?? live?.cpf),
    rg: field('studentRg', live?.rg),
    orgao_emissor: field('studentRgIssuer', live?.orgao_emissor ?? live?.orgaoEmissor),
    rg_uf_emissao: field('studentRgState', live?.rg_uf_emissao ?? live?.rgUfEmissao),
    rg_data_emissao: field('studentRgIssueDate', live?.rg_data_emissao ?? live?.rgDataEmissao),
  });
};

/** Somente tokens do aluno; CPF fiscal ou do responsável não é reclassificado. */
export const prepareStudentIdentityTemplate = (source: string, isCin: boolean, fiscal = false): string => {
  if (!isCin || fiscal || /\{\{?(?:ANO_CALENDARIO|VALOR_TOTAL|VALOR_EXTENSO|RESPONSAVEL_FINANCEIRO_)/.test(source)) return source;
  const cpf = '\\{\\{?(?:ALUNO_CPF|cpf)\\}\\}?';
  const rg = '\\{\\{?(?:ALUNO_RG|rg)\\}\\}?';
  const inline = '(?:\\s|&nbsp;|<\\/?(?:b|strong|span|i|em)\\b[^>]*>)*';
  const numberLabel = '(?:n[º°o.]?\\s*)?';
  // Forma conhecida da declaração: conserva a primeira identidade e retira só a cláusula redundante do aluno.
  let result = source.replace(new RegExp(`(CPF${inline}${numberLabel}${inline}${cpf}${inline}),${inline}\\{\\{?ALUNO_(?:DOCUMENTO_TIPO|TIPO_DOCUMENTO)\\}\\}?${inline}${numberLabel}${inline}${rg}${inline}`, 'gi'), '$1');
  const hasIdentitySlot = new RegExp(rg).test(result);
  result = result.replace(/(<div\b[^>]*>)((?:(?!<\/?div\b)[\s\S])*?)(<\/div>)/gi,
    (cell, open: string, content: string, close: string) => {
      if (hasIdentitySlot && new RegExp(cpf).test(content) && !new RegExp(rg).test(content)) return `${open}${close}`;
      if (!new RegExp(rg).test(content)) return cell;
      return `${open}${content.replace(/(<strong\b[^>]*>)[\s\S]*?(<\/strong>)/i, '$1CIN$2')}${close}`;
    });
  // Rótulos textuais só mudam quando imediatamente associados ao token correspondente.
  result = result.replace(new RegExp(`\\bCPF(?=${inline}${numberLabel}${inline}${cpf})`, 'gi'), 'CIN');
  return result.replace(new RegExp(`\\bRG(?:\\s*\\/\\s*Documento)?(?=${inline}${numberLabel}${inline}${rg})`, 'gi'), 'CIN');
};
