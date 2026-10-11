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

/** Remove texto reconhecido sem apagar tags, estilos ou conteúdo vizinho. */
const removeTextKeepingMarkup = (source: string, pattern: RegExp): string => {
  const text = source.replace(/<[^>]*>/g, '');
  const ranges = [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
  let textOffset = 0;
  return source.replace(/<[^>]*>|[^<]+|</g, (part) => {
    if (part.startsWith('<') && part.endsWith('>')) return part;
    const offset = textOffset;
    textOffset += part.length;
    let result = '';
    let cursor = 0;
    for (const [start, end] of ranges) {
      const from = Math.max(0, start - offset);
      const to = Math.min(part.length, end - offset);
      if (to <= from) continue;
      result += part.slice(cursor, from);
      cursor = to;
    }
    return result + part.slice(cursor);
  });
};

/** Somente tokens do aluno; CPF fiscal ou do responsável não é reclassificado. */
export const prepareStudentIdentityTemplate = (source: string, isCin: boolean, fiscal = false): string => {
  if (!isCin || fiscal || /\{\{?(?:ANO_CALENDARIO|VALOR_TOTAL|VALOR_EXTENSO|RESPONSAVEL_FINANCEIRO_)/.test(source)) return source;
  const cpf = '\\{\\{?(?:ALUNO_CPF|cpf)\\}\\}?';
  const rg = '\\{\\{?(?:ALUNO_RG|rg)\\}\\}?';
  const inline = '(?:\\s|&nbsp;|<\\/?(?:b|strong|span|i|em)\\b[^>]*>)*';
  const numberLabel = '(?:n\\.?(?:[º°o]|&ordm;|&deg;)?\\.?(?:\\s|&nbsp;|&#160;)*)?';
  const separator = `${inline}(?::${inline})?${numberLabel}${inline}(?::${inline})?`;
  // Forma conhecida da declaração: conserva a primeira identidade e retira só a cláusula redundante do aluno.
  let result = source.replace(new RegExp(`(CPF${separator}${cpf}${inline}),${inline}\\{\\{?ALUNO_(?:DOCUMENTO_TIPO|TIPO_DOCUMENTO)\\}\\}?${separator}${rg}${inline}`, 'gi'), '$1');
  const hasIdentitySlot = new RegExp(rg).test(result.replace(/<[^>]*>/g, ''));
  const space = '(?:\\s|&nbsp;|&#160;)*';
  const cpfClause = `(?:[,;]${space})?\\bCPF${space}(?::${space})?`
    + `(?:n\\.?(?:[º°o]|&ordm;|&deg;)?\\.?${space})?(?::${space})?${cpf}`;
  result = result.replace(/(<(div|p|td)\b[^>]*>)((?:(?!<\/?(?:div|p|td)\b)[\s\S])*?)(<\/\2>)/gi,
    (cell, open: string, _tag: string, content: string, close: string) => {
      if (!hasIdentitySlot || !new RegExp(cpf).test(content)) return cell;
      const text = content.replace(/<[^>]*>/g, '');
      const standalone = new RegExp(`^${space}${cpf}${space}$`, 'i').test(text);
      const prepared = removeTextKeepingMarkup(content, new RegExp(standalone ? cpf : cpfClause, 'gi'));
      const onlyIdentity = new RegExp(`^${space}$`, 'i').test(prepared.replace(/<[^>]*>/g, ''));
      return `${open}${onlyIdentity ? '' : prepared}${close}`;
    });
  // Rótulos textuais só mudam quando imediatamente associados ao token correspondente.
  result = result.replace(new RegExp(`\\bCPF(?=${separator}${cpf})`, 'gi'), 'CIN');
  return result.replace(new RegExp(`\\bRG(?:\\s*\\/\\s*Documento)?(?=${separator}${rg})`, 'gi'), 'CIN');
};
