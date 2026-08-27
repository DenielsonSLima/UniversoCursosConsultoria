import {
  BANESE_CARNET_MAX_ITEMS,
  type BaneseCarnetReceivableRow,
  isRegisteredBaneseDocumentRow,
  readBaneseCarnetScope,
  selectBaneseDocumentGroupRows,
} from "../banese-carnet-document/document-policy.ts";

export type StudentCatalogRow = {
  id: string;
  nome: string | null;
  cpf_cnpj: string | null;
};

export type EnrollmentCatalogRow = {
  id: string;
  aluno_id: string;
  turma_id: string;
  data_matricula: string | null;
};

export type ClassCatalogRow = {
  id: string;
  nome: string | null;
  codigo: string | null;
  curso_id: string;
  polo_id: string;
};

export type CourseCatalogRow = {
  id: string;
  nome: string | null;
};

export type BaneseDocumentGroup = {
  id: string;
  representativeReceivableId: string;
  receivableIds: string[];
  studentName: string;
  maskedCpf: string;
  enrollmentId: string;
  enrollmentCode: string;
  courseId: string;
  courseName: string;
  classId: string;
  className: string;
  installmentCount: number;
  totalAmount: number;
  firstDueDate: string;
  lastDueDate: string;
  documentType: "carnet" | "boletos";
};

export type BaneseDocumentFilters = {
  courses: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string; courseId: string }>;
};

type BuildGroupsInput = {
  receivables: BaneseCarnetReceivableRow[];
  students: StudentCatalogRow[];
  enrollments: EnrollmentCatalogRow[];
  classes: ClassCatalogRow[];
  courses: CourseCatalogRow[];
  enrollmentConfig?: unknown;
  search?: string;
  poloId?: string;
};

const SPECIAL_POLO_ID = "55555555-5555-5555-5555-555555555555";
const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const indexById = <T extends { id: string }>(rows: T[]) =>
  new Map(rows.map((row) => [row.id, row]));
const normalizedSearchText = (value: unknown) =>
  text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const maskStudentCpf = (value: unknown) => {
  const cpf = digits(value);
  return cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : "***.***.***-**";
};

export const formatEnrollmentCode = (
  enrollmentId: string,
  createdAt: string | null,
  poloId: string,
  rawConfig?: unknown,
) => {
  const config = asRecord(rawConfig);
  const prefix = text(config.matriculaPrefix) || "UNIV-";
  const rawConfiguredDigits = text(config.matriculaDigits);
  const configuredDigits = Number(rawConfiguredDigits);
  const sequenceDigits =
    rawConfiguredDigits && Number.isInteger(configuredDigits)
      ? Math.min(10, Math.max(1, configuredDigits))
      : 4;
  const yearFormat = ["none", "yyyy", "yy"].includes(
      text(config.yearFormat),
    )
    ? text(config.yearFormat)
    : "yy";
  const rawYear = /^\d{4}/.exec(text(createdAt))?.[0] ||
    String(new Date().getUTCFullYear());
  const year = yearFormat === "none"
    ? ""
    : yearFormat === "yyyy"
    ? rawYear
    : rawYear.slice(-2);
  const poloCode = config.usePoloCode === true
    ? poloId === SPECIAL_POLO_ID ? "02" : "01"
    : "";
  const cleanId = enrollmentId.replace(/[^0-9a-f]/gi, "");
  const tail = cleanId.slice(-4) || "0";
  const sequence = Number.parseInt(tail, 16) % (10 ** sequenceDigits);
  const paddedSequence = String(sequence).padStart(sequenceDigits, "0");
  return `${prefix}${year}${poloCode}${paddedSequence}`.toUpperCase();
};

const groupKey = (row: BaneseCarnetReceivableRow) => {
  const scope = readBaneseCarnetScope(row);
  return [
    scope.clientId,
    scope.enrollmentId,
    scope.poloId ?? "",
    scope.environment,
    scope.issuerId,
    scope.agreement,
    scope.agency,
  ].join("\u001f");
};

const matchesSearch = (
  student: StudentCatalogRow,
  rawSearch: string | undefined,
  searchableLabels: string[],
) => {
  const search = text(rawSearch);
  if (!search) return true;
  const normalized = normalizedSearchText(search);
  if (
    searchableLabels.some((label) =>
      normalizedSearchText(label).includes(normalized)
    )
  ) return true;
  const cpfSearch = /^[\d.\-/\s]+$/.test(search) ? digits(search) : "";
  return Boolean(cpfSearch) && digits(student.cpf_cnpj).includes(cpfSearch);
};

const buildGroup = (
  candidates: BaneseCarnetReceivableRow[],
  input: BuildGroupsInput,
  indexes: {
    students: Map<string, StudentCatalogRow>;
    enrollments: Map<string, EnrollmentCatalogRow>;
    classes: Map<string, ClassCatalogRow>;
    courses: Map<string, CourseCatalogRow>;
  },
): BaneseDocumentGroup | null => {
  const selected = candidates[0];
  let rows: BaneseCarnetReceivableRow[];
  try {
    rows = selectBaneseDocumentGroupRows(selected, candidates);
  } catch {
    return null;
  }
  if (rows.length > BANESE_CARNET_MAX_ITEMS) return null;
  const scope = readBaneseCarnetScope(selected);
  if (input.poloId && scope.poloId !== input.poloId) return null;
  const enrollment = indexes.enrollments.get(scope.enrollmentId);
  if (!enrollment) return null;
  const student = indexes.students.get(enrollment.aluno_id);
  if (!student) return null;
  const classRow = indexes.classes.get(enrollment.turma_id);
  if (
    !classRow ||
    (input.poloId && classRow.polo_id !== input.poloId) ||
    rows.some((row) => text(row.turma_id) && text(row.turma_id) !== classRow.id)
  ) return null;
  const course = indexes.courses.get(classRow.curso_id);
  const studentName = text(student.nome);
  const className = text(classRow.nome) || text(classRow.codigo);
  const courseName = text(course?.nome);
  if (!course || !studentName || !className || !courseName) return null;
  const enrollmentCode = formatEnrollmentCode(
    enrollment.id,
    enrollment.data_matricula,
    scope.poloId ?? classRow.polo_id,
    input.enrollmentConfig,
  );
  if (
    !matchesSearch(student, input.search, [
      studentName,
      enrollmentCode,
      courseName,
      className,
      text(classRow.codigo),
    ])
  ) return null;

  const dueDates = rows.map((row) => text(row.data_vencimento).slice(0, 10));
  const totalAmount = Math.round(
    rows.reduce((total, row) => total + Number(row.valor), 0) * 100,
  ) / 100;
  const representativeReceivableId = rows[0].id;
  return {
    id: `banese:${representativeReceivableId}`,
    representativeReceivableId,
    receivableIds: rows.map((row) => row.id),
    studentName,
    maskedCpf: maskStudentCpf(student.cpf_cnpj),
    enrollmentId: enrollment.id,
    enrollmentCode,
    courseId: course.id,
    courseName,
    classId: classRow.id,
    className,
    installmentCount: rows.length,
    totalAmount,
    firstDueDate: dueDates[0],
    lastDueDate: dueDates[dueDates.length - 1],
    documentType: rows.length >= 3 ? "carnet" : "boletos",
  };
};

export const buildBaneseDocumentGroups = (
  input: BuildGroupsInput,
): BaneseDocumentGroup[] => {
  const grouped = new Map<string, BaneseCarnetReceivableRow[]>();
  for (const row of input.receivables) {
    if (!isRegisteredBaneseDocumentRow(row)) continue;
    let key: string;
    try {
      key = groupKey(row);
    } catch {
      continue;
    }
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  const indexes = {
    students: indexById(input.students),
    enrollments: indexById(input.enrollments),
    classes: indexById(input.classes),
    courses: indexById(input.courses),
  };
  return [...grouped.values()]
    .map((rows) => buildGroup(rows, input, indexes))
    .filter((group): group is BaneseDocumentGroup => Boolean(group))
    .sort((left, right) =>
      left.studentName.localeCompare(right.studentName, "pt-BR") ||
      left.enrollmentCode.localeCompare(right.enrollmentCode, "pt-BR") ||
      left.firstDueDate.localeCompare(right.firstDueDate) ||
      left.id.localeCompare(right.id)
    );
};

export const paginateBaneseDocumentGroups = (
  groups: BaneseDocumentGroup[],
  page: number,
  pageSize: number,
) => ({
  groups: groups.slice((page - 1) * pageSize, page * pageSize),
  total: groups.length,
  page,
  pageSize,
});

export const filterBaneseDocumentGroups = (
  groups: BaneseDocumentGroup[],
  courseId?: string | null,
  classId?: string | null,
) =>
  groups.filter((group) =>
    (!courseId || group.courseId === courseId) &&
    (!classId || group.classId === classId)
  );

export const buildBaneseDocumentFilters = (
  groups: BaneseDocumentGroup[],
): BaneseDocumentFilters => {
  const courses = new Map<string, { id: string; name: string }>();
  const classes = new Map<
    string,
    { id: string; name: string; courseId: string }
  >();
  for (const group of groups) {
    courses.set(group.courseId, { id: group.courseId, name: group.courseName });
    classes.set(group.classId, {
      id: group.classId,
      name: group.className,
      courseId: group.courseId,
    });
  }
  return {
    courses: [...courses.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR") ||
      left.id.localeCompare(right.id)
    ),
    classes: [...classes.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "pt-BR") ||
      left.id.localeCompare(right.id)
    ),
  };
};
