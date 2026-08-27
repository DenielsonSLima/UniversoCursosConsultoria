import type {
  BaneseDocumentGroup,
  BaneseDocumentGroupsResponse,
} from './carnes-alunos.types';

const DATABASE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MASKED_CPF_RE = /^\*{3}\.\*{3}\.\*{3}-(?:\d{2}|\*{2})$/;

const nonEmptyText = (value: unknown, field: string) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`O catálogo de carnês não retornou ${field}.`);
  return normalized;
};

const uuid = (value: unknown, field: string) => {
  const normalized = nonEmptyText(value, field);
  if (!DATABASE_UUID_RE.test(normalized)) {
    throw new Error(`O catálogo de carnês retornou ${field} inválido.`);
  }
  return normalized;
};

const positiveInteger = (value: unknown, field: string) => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`O catálogo de carnês retornou ${field} inválido.`);
  }
  return normalized;
};

const date = (value: unknown, field: string) => {
  const normalized = nonEmptyText(value, field).slice(0, 10);
  if (!ISO_DATE_RE.test(normalized)) {
    throw new Error(`O catálogo de carnês retornou ${field} inválida.`);
  }
  return normalized;
};

const parseGroup = (value: unknown): BaneseDocumentGroup => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O catálogo de carnês retornou um grupo inválido.');
  }
  const row = value as Record<string, unknown>;
  const receivableIds = Array.isArray(row.receivableIds)
    ? row.receivableIds.map((item) => uuid(item, 'um título Banese'))
    : [];
  const representativeReceivableId = uuid(row.representativeReceivableId, 'o título representativo');
  const groupId = nonEmptyText(row.id, 'o identificador do grupo');
  if (groupId !== `banese:${representativeReceivableId}`) {
    throw new Error('O catálogo de carnês retornou um identificador de grupo fora do escopo Banese.');
  }
  const installmentCount = positiveInteger(row.installmentCount, 'a quantidade de parcelas');
  const documentType = row.documentType === 'carnet' || row.documentType === 'boletos'
    ? row.documentType
    : null;
  if (!documentType || receivableIds.length !== installmentCount) {
    throw new Error('O catálogo de carnês retornou uma composição documental inconsistente.');
  }
  if (!receivableIds.includes(representativeReceivableId)) {
    throw new Error('O título representativo não pertence ao grupo documental retornado.');
  }
  if (new Set(receivableIds).size !== receivableIds.length) {
    throw new Error('O grupo documental retornou títulos Banese duplicados.');
  }
  if ((documentType === 'carnet' && (installmentCount < 3 || installmentCount > 30))
    || (documentType === 'boletos' && installmentCount > 2)) {
    throw new Error('O tipo de documento não corresponde à quantidade de parcelas.');
  }
  const totalAmount = Number(row.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('O catálogo de carnês retornou um total inválido.');
  }
  const maskedCpf = nonEmptyText(row.maskedCpf, 'o CPF mascarado');
  if (!MASKED_CPF_RE.test(maskedCpf)) {
    throw new Error('O catálogo de carnês tentou retornar um CPF fora do formato mascarado.');
  }
  return {
    id: groupId,
    representativeReceivableId,
    receivableIds,
    studentName: nonEmptyText(row.studentName, 'o nome do aluno'),
    maskedCpf,
    enrollmentId: uuid(row.enrollmentId, 'a matrícula'),
    enrollmentCode: nonEmptyText(row.enrollmentCode, 'o código da matrícula'),
    courseId: uuid(row.courseId, 'o curso'),
    courseName: nonEmptyText(row.courseName, 'o nome do curso'),
    classId: uuid(row.classId, 'a turma'),
    className: nonEmptyText(row.className, 'o nome da turma'),
    installmentCount,
    totalAmount,
    firstDueDate: date(row.firstDueDate, 'a primeira data de vencimento'),
    lastDueDate: date(row.lastDueDate, 'a última data de vencimento'),
    documentType,
  };
};

export const parseDocumentGroupsResponse = (value: unknown): BaneseDocumentGroupsResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O servidor não retornou o catálogo de carnês esperado.');
  }
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.groups)) {
    throw new Error('O servidor não retornou os grupos documentais esperados.');
  }
  const filters = payload.filters;
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    throw new Error('O servidor não retornou os filtros do catálogo de carnês.');
  }
  const filterPayload = filters as Record<string, unknown>;
  if (!Array.isArray(filterPayload.courses) || !Array.isArray(filterPayload.classes)) {
    throw new Error('O servidor retornou filtros de curso ou turma inválidos.');
  }
  const courses = filterPayload.courses.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('O catálogo de carnês retornou um filtro de curso inválido.');
    }
    const row = item as Record<string, unknown>;
    return { id: uuid(row.id, 'um curso dos filtros'), name: nonEmptyText(row.name, 'o nome de um curso') };
  });
  const classes = filterPayload.classes.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('O catálogo de carnês retornou um filtro de turma inválido.');
    }
    const row = item as Record<string, unknown>;
    return {
      id: uuid(row.id, 'uma turma dos filtros'),
      name: nonEmptyText(row.name, 'o nome de uma turma'),
      courseId: uuid(row.courseId, 'o curso de uma turma dos filtros'),
    };
  });
  if (new Set(courses.map((course) => course.id)).size !== courses.length
    || new Set(classes.map((classItem) => classItem.id)).size !== classes.length) {
    throw new Error('O catálogo de carnês retornou filtros duplicados.');
  }
  const courseIds = new Set(courses.map((course) => course.id));
  if (classes.some((classItem) => !courseIds.has(classItem.courseId))) {
    throw new Error('O catálogo de carnês retornou uma turma sem curso correspondente.');
  }
  const page = positiveInteger(payload.page, 'a página');
  const pageSize = positiveInteger(payload.pageSize, 'o tamanho da página');
  const total = Number(payload.total);
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('O catálogo de carnês retornou um total de grupos inválido.');
  }
  return {
    groups: payload.groups.map(parseGroup),
    total,
    page,
    pageSize,
    filters: { courses, classes },
  };
};
