import type {
  RenegociacaoCandidateGroup,
  RenegociacaoCandidatePage,
  RenegociacaoCourseType,
  RenegociacaoFilterOptions,
} from './renegociacoes.types';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Resposta inválida da lista de renegociações.');
  return value as Row;
};
const text = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`O servidor não retornou ${field}.`);
  return value;
};
const count = (value: unknown, field: string) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`O servidor retornou ${field} inválido.`);
  return value;
};
const list = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`O servidor não retornou ${field}.`);
  return value;
};
const courseType = (value: unknown): RenegociacaoCourseType => {
  if (value === 'TECNICO' || value === 'LIVRE' || value === 'ESPECIALIZACAO' || value === 'EAD') return value;
  throw new Error('O servidor retornou um tipo de curso inválido.');
};
const nullableText = (value: unknown) => value == null ? null : text(value, 'o texto esperado');

const parseGroup = (value: unknown): RenegociacaoCandidateGroup => {
  const item = row(value);
  if (item.eligibilityPending !== true)
    throw new Error('A lista de alunos não confirmou a etapa de conferência das parcelas.');
  for (const key of ['eligibleCount', 'blockedCount', 'accruedInterestCents', 'accruedPenaltyCents', 'grossDebtCents']) {
    if (item[key] !== null) throw new Error('A lista resumida não pode antecipar a elegibilidade ou os encargos.');
  }
  return {
    poloId: text(item.poloId, 'o polo'),
    alunoId: text(item.alunoId, 'o aluno'),
    alunoNome: text(item.alunoNome, 'o nome do aluno'),
    matriculaId: text(item.matriculaId, 'a matrícula'),
    matriculaCodigo: nullableText(item.matriculaCodigo),
    turmaId: text(item.turmaId, 'a turma'),
    turmaNome: text(item.turmaNome, 'o nome da turma'),
    policyKind: text(item.policyKind, 'o tipo de política'),
    courseType: courseType(item.courseType),
    openCount: count(item.openCount, 'o número de parcelas abertas'),
    eligibilityPending: true,
    eligibleCount: null,
    blockedCount: null,
    overdueCount: count(item.overdueCount, 'o número de parcelas vencidas'),
    futureCount: count(item.futureCount, 'o número de parcelas a vencer'),
    principalCents: count(item.principalCents, 'o principal nominal'),
    accruedInterestCents: null,
    accruedPenaltyCents: null,
    grossDebtCents: null,
    oldestDueDate: nullableText(item.oldestDueDate),
    nextDueDate: nullableText(item.nextDueDate),
  };
};

const parseFilters = (value: unknown): RenegociacaoFilterOptions => {
  const options = row(value);
  return {
    courseTypes: list(options.courseTypes, 'os tipos de curso').map((value) => {
      const option = row(value);
      return { id: courseType(option.id), label: text(option.label, 'o nome do tipo de curso') };
    }),
    turmas: list(options.turmas, 'as turmas').map((value) => {
      const option = row(value);
      return {
        id: text(option.id, 'a identificação da turma'),
        label: text(option.label, 'o nome da turma'),
        courseType: courseType(option.courseType),
      };
    }),
  };
};

export const parseCandidatePageV2 = (value: unknown): RenegociacaoCandidatePage => {
  const result = row(Array.isArray(value) && value.length === 1 ? value[0] : value);
  if (result.version !== 2 || result.pageBy !== 'STUDENT')
    throw new Error('A listagem por aluno ainda não está disponível neste ambiente.');
  const page = count(result.page, 'a página');
  const pageSize = count(result.pageSize, 'o tamanho da página');
  if (!page || !pageSize) throw new Error('Paginação inválida na lista de renegociações.');
  return {
    version: 2,
    pageBy: 'STUDENT',
    asOf: text(result.asOf, 'a data-base'),
    groups: list(result.groups, 'as matrículas').map(parseGroup),
    totalGroups: count(result.totalGroups, 'o total de matrículas'),
    totalStudents: count(result.totalStudents, 'o total de alunos'),
    page,
    pageSize,
    filterOptions: parseFilters(result.filterOptions),
  };
};
