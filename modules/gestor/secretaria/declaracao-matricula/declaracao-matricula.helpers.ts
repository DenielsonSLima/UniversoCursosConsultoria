import { renderDeclarationIdentity } from '../../../shared/utils/declaration-identity-presentation';
import { onlyDigits } from '../../../../lib/documentFormatters';
import { matchesSecretariaSearch } from '../secretaria-search';
import { resolveStudentIdentityDocument } from '../../../shared/utils/studentIdentityDocument';
import type { DeclaracaoAluno } from './declaracao-matricula.types';

export const matchesDeclaracaoAlunoSearch = (aluno: DeclaracaoAluno, term: string) => {
  const digits = onlyDigits(term);
  return matchesSecretariaSearch(term, [aluno.nome, aluno.curso, aluno.turmaNome])
    || Boolean(aluno.cpf && (aluno.cpf.includes(term) || (digits && onlyDigits(aluno.cpf).includes(digits))))
    || Boolean(aluno.rg && aluno.rg.includes(term));
};

interface ParseDeclaracaoTemplateOptions {
  frequenciesByStudent: Record<string, number>;
  validationExpiresAt?: string | null;
}

export const parseDeclaracaoTemplate = (
  htmlText: string,
  aluno: DeclaracaoAluno,
  options: ParseDeclaracaoTemplateOptions,
) => {
  if (!htmlText) return '';
  let parsed = htmlText;
  const today = new Date();
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const dataExtenso = `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;
  const horaAtual = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const expiresAt = options.validationExpiresAt ? new Date(options.validationExpiresAt) : null;
  const validityDays = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
    : null;
  const validadeFormatada = expiresAt
    ? `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`
    : 'Sem vencimento';
  const formatarData = (dataStr?: string) => {
    if (!dataStr) return 'Não informada';
    const dateOnly = dataStr.split('T')[0];
    const parts = dateOnly.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dataStr;
  };
  const identity = resolveStudentIdentityDocument(aluno);
  parsed = renderDeclarationIdentity(parsed, identity, aluno.cpf);

  parsed = parsed.replace(/{{ALUNO_NOME}}/g, aluno.nome.toUpperCase());
  parsed = parsed.replace(/{{ALUNO_NASCIMENTO}}/g, formatarData(aluno.nascimento));
  parsed = parsed.replace(/{{ALUNO_MATRICULA}}/g, aluno.matricula || 'Não gerada');
  parsed = parsed.replace(/{{CURSO_NOME}}/g, aluno.curso || '');
  parsed = parsed.replace(/{{TURMA_NOME}}/g, aluno.turmaNome || '');
  parsed = parsed.replace(/{{POLO_NOME}}/g, aluno.poloNome || 'Universo Cursos e Consultoria');
  parsed = parsed.replace(/{{POLO_CNPJ}}/g, aluno.poloCnpj || '');
  parsed = parsed.replace(/{{CIDADE_POLO}}/g, aluno.cidadePolo || 'Aracaju');
  parsed = parsed.replace(/{{DATA_ATUAL}}/g, dataExtenso);
  parsed = parsed.replace(/{{HORA_ATUAL}}/g, horaAtual);
  parsed = parsed.replace(
    /{{DATA_GERACAO}}/g,
    `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()} às ${horaAtual}`,
  );
  parsed = parsed.replace(
    /{{VALIDADE_DIAS}}/g,
    validityDays === null ? 'Sem vencimento' : String(validityDays),
  );
  parsed = parsed.replace(/{{VALIDADE_DATA}}/g, validadeFormatada);
  parsed = parsed.replace(
    /{{FREQUENCIA_GERAL}}/g,
    options.frequenciesByStudent[aluno.id] === undefined
      ? 'Não consolidada'
      : `${options.frequenciesByStudent[aluno.id].toFixed(2).replace('.', ',')}%`,
  );
  return parsed;
};

