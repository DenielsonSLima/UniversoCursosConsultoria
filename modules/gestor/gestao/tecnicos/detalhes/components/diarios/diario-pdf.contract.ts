export type DiarioPdfExportMode = "PREENCHIDO" | "EM_BRANCO";

export interface DiarioPdfCoverField {
  id:
    | "curso"
    | "modulo"
    | "areaTematica"
    | "disciplina"
    | "turma"
    | "professor";
  label: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  visible: boolean;
  color: string;
  bold: boolean;
  borderTop?: boolean;
  align?: "left" | "center" | "right";
}

export interface DiarioPdfTemplateSnapshot {
  capaUrl: string | null;
  contracapaUrl: string | null;
  cabecalhoLogoUrl: string | null;
  rodape: string;
  imprimirInstrucoes: boolean;
  capaCampos: DiarioPdfCoverField[];
  imprimirValidacaoContracapa: boolean;
  mensagemValidacao: string;
  qrCodeSize: number;
}

export interface DiarioPdfStudentSnapshot {
  id: string;
  nome: string;
  matricula: string;
}

export interface DiarioPdfSessionSnapshot {
  id: string;
  periodo: "M" | "T" | "N" | "U";
  cargaHoraria: number;
}

export interface DiarioPdfLessonSnapshot {
  id: string;
  titulo: string;
  cargaHoraria: number;
  /** Data acadêmica canônica, sem conversão de fuso, no formato YYYY-MM-DD. */
  dataSource: string;
  sessoes: DiarioPdfSessionSnapshot[];
}

export interface DiarioPdfRenderableGradeSnapshot {
  p: number | null;
  ti: number | null;
  tg: number | null;
  s: number | null;
  cq: number | null;
  o: number | null;
  rec: number | null;
  total_aulas: number;
  total_faltas: number;
  frequencia_percent: number | null;
  media_parcial: number | null;
  media_final: number | null;
  resultado_final: string;
}

export interface DiarioPdfGradeSnapshot extends
  Omit<
    DiarioPdfRenderableGradeSnapshot,
    "frequencia_percent" | "resultado_final"
  > {
  frequencia_percent: number;
  resultado_final:
    | "APROVEITADO"
    | "SEM_LANCAMENTO"
    | "FREQUENCIA_PENDENTE"
    | "REPROVADO_FREQUENCIA"
    | "APROVADO"
    | "EM_RECUPERACAO"
    | "REPROVADO";
}

export interface DiarioPdfActiveInstrumentsSnapshot {
  p: boolean;
  ti: boolean;
  tg: boolean;
  s: boolean;
  cq: boolean;
  o: boolean;
}

export interface DiarioPdfInstitutionSnapshot {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  isHeadquarters: boolean;
}

/**
 * Apresentação do modelo de marca-d'água congelada no snapshot acadêmico.
 * O ativo e estes parâmetros precisam viajar juntos para que a emissão não
 * recrie uma versão genérica do recurso institucional aprovado.
 */
export interface DiarioPdfInstitutionalWatermark {
  url: string;
  opacity: number;
  scale: number;
  rotate: boolean;
}

export interface DiarioPdfRenderableData {
  template: DiarioPdfTemplateSnapshot;
  turma: {
    id: string;
    cursoNome: string;
    nome: string;
    codigo: string;
  };
  disciplina: {
    id: string;
    nome: string;
    professor: string;
    cargaHoraria: number;
  };
  moduloNome: string;
  students: DiarioPdfStudentSnapshot[];
  aulas: DiarioPdfLessonSnapshot[];
  attendanceMap: Record<string, Record<string, "P" | "F" | "J" | null>>;
  gradesMap: Record<string, DiarioPdfRenderableGradeSnapshot>;
  praticasMap: Record<string, string>;
  observacoes: string;
  activeInstruments: DiarioPdfActiveInstrumentsSnapshot;
  exportMode: DiarioPdfExportMode;
  validationCode: string | null;
  validationPreview: boolean;
  institutionalIdentity: {
    institution: DiarioPdfInstitutionSnapshot;
    logoUrl: string;
    watermarkUrl: string | null;
    watermark?: DiarioPdfInstitutionalWatermark;
  };
}

/**
 * Snapshot acadêmico imutável produzido pelo backend. Este é o único contrato
 * aceito pelo compositor que devolve bytes aptos ao fluxo de assinatura.
 */
export interface DiarioPdfAcademicSnapshot extends
  Omit<
    DiarioPdfRenderableData,
    "gradesMap" | "exportMode" | "validationCode" | "validationPreview"
  > {
  gradesMap: Record<string, DiarioPdfGradeSnapshot>;
  exportMode: "PREENCHIDO";
  validationCode: string;
  validationPreview: false;
  schemaVersion: 2;
  composerSchemaVersion: 1;
  documentType: "diario_classe";
  source: {
    type: "DIARIO";
    turmaId: string;
    disciplinaId: string;
    originVersion: number;
    courseId: string;
    poloId: string;
    companyId: string;
    academicRevisionSha256: string;
  };
  templateSource: {
    id: string;
    updatedAt: string;
    version: number;
    raw: Record<string, unknown>;
    sha256: string;
  };
  assetSources: {
    coverUrl: string | null;
    backCoverUrl: string | null;
    headerLogoUrl: string;
    watermarkUrl: string | null;
  };
  closure: {
    lock: "PROFESSOR";
    hoursCompleted: number;
    requiredHours: number;
    snapshotAt: string;
  };
  generatedAt: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const VALIDATION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{7,127}$/;
const INLINE_WATERMARK_DATA_URI_PATTERN =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u;
const INLINE_WATERMARK_MAX_BYTES = 1024 * 1024;
const RESULT_VALUES = new Set<DiarioPdfGradeSnapshot["resultado_final"]>([
  "APROVEITADO",
  "SEM_LANCAMENTO",
  "FREQUENCIA_PENDENTE",
  "REPROVADO_FREQUENCIA",
  "APROVADO",
  "EM_RECUPERACAO",
  "REPROVADO",
]);
const COVER_FIELD_IDS = new Set<DiarioPdfCoverField["id"]>([
  "curso",
  "modulo",
  "areaTematica",
  "disciplina",
  "turma",
  "professor",
]);

function fail(path: string, reason: string): never {
  throw new Error(
    `Snapshot acadêmico do Diário inválido em ${path}: ${reason}.`,
  );
}

const asRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "objeto obrigatório");
  }
  return value as Record<string, unknown>;
};

const assertExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  path: string,
) => {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) =>
    !Object.prototype.hasOwnProperty.call(value, key)
  );
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length || extra.length) {
    fail(
      path,
      [
        missing.length ? `faltam ${missing.join(", ")}` : "",
        extra.length ? `sobram ${extra.join(", ")}` : "",
      ].filter(Boolean).join("; "),
    );
  }
};

function assertText(
  value: unknown,
  path: string,
  { allowEmpty = false, max = 5000 }: { allowEmpty?: boolean; max?: number } =
    {},
): asserts value is string {
  if (
    typeof value !== "string" || value.length > max ||
    (!allowEmpty && !value.trim())
  ) {
    fail(path, "texto fora do contrato");
  }
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") fail(path, "booleano obrigatório");
}

function assertNumber(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  integer = false,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    fail(path, "número fora do contrato");
  }
}

function assertUuid(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    fail(path, "UUID obrigatório");
  }
}

function assertSha256(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(path, "SHA-256 hexadecimal minúsculo obrigatório");
  }
}

function assertTimestamp(
  value: unknown,
  path: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(path, "instante ISO 8601 obrigatório");
  }
}

function assertIsoDate(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") fail(path, "data ISO obrigatória");
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) fail(path, "data ISO YYYY-MM-DD obrigatória");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(path, "data inexistente");
  }
}

const assertCanonicalAssetUrl = (
  value: unknown,
  path: string,
  nullable = false,
) => {
  if (nullable && value === null) return;
  if (typeof value !== "string") fail(path, "URL HTTPS canônica obrigatória");
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.href !== value
    ) {
      fail(path, "URL HTTPS canônica sem credenciais, query ou fragmento");
    }
  } catch {
    fail(path, "URL HTTPS canônica obrigatória");
  }
};

const assertCanonicalWatermarkSource = (
  value: unknown,
  path: string,
  nullable = false,
) => {
  if (nullable && value === null) return;
  if (typeof value !== "string") {
    fail(path, "URL HTTPS ou data URI canônica obrigatória");
  }
  const inline = INLINE_WATERMARK_DATA_URI_PATTERN.exec(value);
  if (!inline) {
    assertCanonicalAssetUrl(value, path);
    return;
  }
  const encoded = inline[2];
  if (encoded.length % 4 !== 0) fail(path, "base64 canônico obrigatório");
  try {
    const decoded = globalThis.atob(encoded);
    if (
      decoded.length === 0 ||
      decoded.length > INLINE_WATERMARK_MAX_BYTES ||
      globalThis.btoa(decoded) !== encoded
    ) {
      fail(path, "data URI canônica de até 1 MiB obrigatória");
    }
  } catch {
    fail(path, "data URI base64 inválida");
  }
};

const assertNullableGrade = (value: unknown, path: string) => {
  if (value !== null) assertNumber(value, path, 0, 10);
};

const sameKeys = (
  actual: Record<string, unknown>,
  expected: readonly string[],
  path: string,
) => {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = [...expected].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(path, "chaves não correspondem ao conjunto acadêmico congelado");
  }
};

const nearlyEqual = (left: number, right: number, tolerance = 0.011) => (
  Math.abs(left - right) <= tolerance
);

/**
 * Validação fechada, sem coerção nem preenchimento de valores acadêmicos. Um
 * snapshot incompatível é rejeitado antes de criar qualquer página do PDF.
 */
export const assertValidDiarioPdfAcademicSnapshot = (
  input: unknown,
): DiarioPdfAcademicSnapshot => {
  const snapshot = asRecord(input, "raiz");
  const topLevelKeys = [
    "schemaVersion",
    "composerSchemaVersion",
    "documentType",
    "source",
    "template",
    "templateSource",
    "turma",
    "disciplina",
    "moduloNome",
    "students",
    "aulas",
    "attendanceMap",
    "gradesMap",
    "praticasMap",
    "observacoes",
    "activeInstruments",
    "exportMode",
    "validationCode",
    "validationPreview",
    "institutionalIdentity",
    "assetSources",
    "closure",
    "generatedAt",
  ] as const;
  assertExactKeys(snapshot, topLevelKeys, [], "raiz");
  if (snapshot.schemaVersion !== 2 || snapshot.composerSchemaVersion !== 1) {
    fail(
      "versão",
      "schemaVersion=2 e composerSchemaVersion=1 são obrigatórios",
    );
  }
  if (
    snapshot.documentType !== "diario_classe" ||
    snapshot.exportMode !== "PREENCHIDO"
  ) {
    fail("documento", "somente Diário preenchido e congelado é assinável");
  }
  if (snapshot.validationPreview !== false) {
    fail("validationPreview", "deve ser false");
  }
  if (
    typeof snapshot.validationCode !== "string" ||
    !VALIDATION_CODE_PATTERN.test(snapshot.validationCode)
  ) {
    fail("validationCode", "código canônico obrigatório");
  }
  assertText(snapshot.moduloNome, "moduloNome", { max: 240 });
  assertText(snapshot.observacoes, "observacoes", {
    allowEmpty: true,
    max: 20000,
  });
  assertTimestamp(snapshot.generatedAt, "generatedAt");
  if (JSON.stringify(snapshot).length > 4 * 1024 * 1024) {
    fail("raiz", "limite de 4 MiB excedido");
  }

  const source = asRecord(snapshot.source, "source");
  assertExactKeys(
    source,
    [
      "type",
      "turmaId",
      "disciplinaId",
      "originVersion",
      "courseId",
      "poloId",
      "companyId",
      "academicRevisionSha256",
    ],
    [],
    "source",
  );
  if (source.type !== "DIARIO") fail("source.type", "deve ser DIARIO");
  ["turmaId", "disciplinaId", "courseId", "poloId", "companyId"].forEach((
    key,
  ) => (
    assertUuid(source[key], `source.${key}`)
  ));
  assertNumber(
    source.originVersion,
    "source.originVersion",
    1,
    1_000_000,
    true,
  );
  assertSha256(source.academicRevisionSha256, "source.academicRevisionSha256");

  const template = asRecord(snapshot.template, "template");
  assertExactKeys(
    template,
    [
      "capaUrl",
      "contracapaUrl",
      "cabecalhoLogoUrl",
      "rodape",
      "imprimirInstrucoes",
      "capaCampos",
      "imprimirValidacaoContracapa",
      "mensagemValidacao",
      "qrCodeSize",
    ],
    [],
    "template",
  );
  assertCanonicalAssetUrl(template.capaUrl, "template.capaUrl", true);
  assertCanonicalAssetUrl(
    template.contracapaUrl,
    "template.contracapaUrl",
    true,
  );
  assertCanonicalAssetUrl(
    template.cabecalhoLogoUrl,
    "template.cabecalhoLogoUrl",
    true,
  );
  assertText(template.rodape, "template.rodape", { max: 300 });
  assertBoolean(template.imprimirInstrucoes, "template.imprimirInstrucoes");
  assertBoolean(
    template.imprimirValidacaoContracapa,
    "template.imprimirValidacaoContracapa",
  );
  assertText(template.mensagemValidacao, "template.mensagemValidacao", {
    max: 2000,
  });
  assertNumber(template.qrCodeSize, "template.qrCodeSize", 16, 50);
  if (
    !Array.isArray(template.capaCampos) ||
    template.capaCampos.length !== COVER_FIELD_IDS.size
  ) {
    fail(
      "template.capaCampos",
      "os seis campos vetoriais da capa são obrigatórios",
    );
  }
  const coverIds = new Set<string>();
  const coverFields = template.capaCampos as unknown[];
  coverFields.forEach((candidate, index) => {
    const field = asRecord(candidate, `template.capaCampos[${index}]`);
    assertExactKeys(
      field,
      [
        "id",
        "label",
        "x",
        "y",
        "width",
        "fontSize",
        "visible",
        "color",
        "bold",
      ],
      ["borderTop", "align"],
      `template.capaCampos[${index}]`,
    );
    if (
      typeof field.id !== "string" ||
      !COVER_FIELD_IDS.has(field.id as DiarioPdfCoverField["id"])
    ) {
      fail(`template.capaCampos[${index}].id`, "identificador desconhecido");
    }
    const fieldId = field.id as string;
    if (coverIds.has(fieldId)) {
      fail(`template.capaCampos[${index}].id`, "identificador duplicado");
    }
    coverIds.add(fieldId);
    assertText(field.label, `template.capaCampos[${index}].label`, {
      allowEmpty: true,
      max: 100,
    });
    assertNumber(field.x, `template.capaCampos[${index}].x`, 0, 100);
    assertNumber(field.y, `template.capaCampos[${index}].y`, 0, 100);
    assertNumber(field.width, `template.capaCampos[${index}].width`, 1, 100);
    assertNumber(
      field.fontSize,
      `template.capaCampos[${index}].fontSize`,
      4,
      24,
    );
    assertBoolean(field.visible, `template.capaCampos[${index}].visible`);
    assertBoolean(field.bold, `template.capaCampos[${index}].bold`);
    if (
      typeof field.color !== "string" || !HEX_COLOR_PATTERN.test(field.color)
    ) {
      fail(
        `template.capaCampos[${index}].color`,
        "cor hexadecimal obrigatória",
      );
    }
    if (field.borderTop !== undefined) {
      assertBoolean(field.borderTop, `template.capaCampos[${index}].borderTop`);
    }
    if (
      field.align !== undefined &&
      !["left", "center", "right"].includes(String(field.align))
    ) {
      fail(`template.capaCampos[${index}].align`, "alinhamento inválido");
    }
  });

  const templateSource = asRecord(snapshot.templateSource, "templateSource");
  assertExactKeys(
    templateSource,
    ["id", "updatedAt", "version", "raw", "sha256"],
    [],
    "templateSource",
  );
  assertText(templateSource.id, "templateSource.id", { max: 200 });
  assertTimestamp(templateSource.updatedAt, "templateSource.updatedAt");
  assertNumber(
    templateSource.version,
    "templateSource.version",
    1,
    1_000_000,
    true,
  );
  const rawTemplate = asRecord(templateSource.raw, "templateSource.raw");
  if (JSON.stringify(rawTemplate).length > 256 * 1024) {
    fail("templateSource.raw", "limite de 256 KiB excedido");
  }
  assertSha256(templateSource.sha256, "templateSource.sha256");

  const turma = asRecord(snapshot.turma, "turma");
  assertExactKeys(turma, ["id", "cursoNome", "nome", "codigo"], [], "turma");
  assertUuid(turma.id, "turma.id");
  ["cursoNome", "nome", "codigo"].forEach((key) =>
    assertText(turma[key], `turma.${key}`, { max: 300 })
  );
  if (turma.id !== source.turmaId) {
    fail("turma.id", "diverge de source.turmaId");
  }

  const disciplina = asRecord(snapshot.disciplina, "disciplina");
  assertExactKeys(
    disciplina,
    ["id", "nome", "professor", "cargaHoraria"],
    [],
    "disciplina",
  );
  assertUuid(disciplina.id, "disciplina.id");
  assertText(disciplina.nome, "disciplina.nome", { max: 300 });
  assertText(disciplina.professor, "disciplina.professor", { max: 300 });
  assertNumber(
    disciplina.cargaHoraria,
    "disciplina.cargaHoraria",
    0.01,
    100_000,
  );
  if (disciplina.id !== source.disciplinaId) {
    fail("disciplina.id", "diverge de source.disciplinaId");
  }

  const instruments = asRecord(snapshot.activeInstruments, "activeInstruments");
  const instrumentKeys = ["p", "ti", "tg", "s", "cq", "o"] as const;
  assertExactKeys(instruments, instrumentKeys, [], "activeInstruments");
  instrumentKeys.forEach((key) =>
    assertBoolean(instruments[key], `activeInstruments.${key}`)
  );

  if (
    !Array.isArray(snapshot.students) || snapshot.students.length === 0 ||
    snapshot.students.length > 2000
  ) {
    fail("students", "lista deve conter de 1 a 2000 alunos");
  }
  const studentIds: string[] = [];
  const studentIdSet = new Set<string>();
  const students = snapshot.students as unknown[];
  students.forEach((candidate, index) => {
    const student = asRecord(candidate, `students[${index}]`);
    assertExactKeys(
      student,
      ["id", "nome", "matricula"],
      [],
      `students[${index}]`,
    );
    assertUuid(student.id, `students[${index}].id`);
    assertText(student.nome, `students[${index}].nome`, { max: 300 });
    assertText(student.matricula, `students[${index}].matricula`, { max: 100 });
    if (studentIdSet.has(student.id as string)) {
      fail(`students[${index}].id`, "aluno duplicado");
    }
    studentIdSet.add(student.id as string);
    studentIds.push(student.id as string);
  });

  if (
    !Array.isArray(snapshot.aulas) || snapshot.aulas.length === 0 ||
    snapshot.aulas.length > 1000
  ) {
    fail("aulas", "lista deve conter de 1 a 1000 encontros");
  }
  const lessonIds: string[] = [];
  const lessonIdSet = new Set<string>();
  const lessonDateSet = new Set<string>();
  const sessionIds: string[] = [];
  const sessionIdSet = new Set<string>();
  const sessionHours = new Map<string, number>();
  const lessons = snapshot.aulas as unknown[];
  lessons.forEach((candidate, lessonIndex) => {
    const lesson = asRecord(candidate, `aulas[${lessonIndex}]`);
    assertExactKeys(
      lesson,
      ["id", "titulo", "cargaHoraria", "dataSource", "sessoes"],
      [],
      `aulas[${lessonIndex}]`,
    );
    assertUuid(lesson.id, `aulas[${lessonIndex}].id`);
    assertText(lesson.titulo, `aulas[${lessonIndex}].titulo`, { max: 2000 });
    assertNumber(
      lesson.cargaHoraria,
      `aulas[${lessonIndex}].cargaHoraria`,
      0.01,
      1000,
    );
    assertIsoDate(lesson.dataSource, `aulas[${lessonIndex}].dataSource`);
    if (lessonIdSet.has(lesson.id as string)) {
      fail(`aulas[${lessonIndex}].id`, "encontro duplicado");
    }
    if (lessonDateSet.has(lesson.dataSource as string)) {
      fail(
        `aulas[${lessonIndex}].dataSource`,
        "encontro da mesma data não foi agrupado",
      );
    }
    lessonIdSet.add(lesson.id as string);
    lessonDateSet.add(lesson.dataSource as string);
    lessonIds.push(lesson.id as string);
    if (
      !Array.isArray(lesson.sessoes) || lesson.sessoes.length === 0 ||
      lesson.sessoes.length > 8
    ) {
      fail(`aulas[${lessonIndex}].sessoes`, "deve conter de 1 a 8 sessões");
    }
    let lessonHours = 0;
    const periods = new Set<string>();
    let previousPeriodOrder = 0;
    const periodOrder: Record<string, number> = { M: 1, T: 2, N: 3, U: 4 };
    const sessions = lesson.sessoes as unknown[];
    sessions.forEach((sessionCandidate, sessionIndex) => {
      const session = asRecord(
        sessionCandidate,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}]`,
      );
      assertExactKeys(
        session,
        ["id", "periodo", "cargaHoraria"],
        [],
        `aulas[${lessonIndex}].sessoes[${sessionIndex}]`,
      );
      assertUuid(
        session.id,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}].id`,
      );
      if (!["M", "T", "N", "U"].includes(String(session.periodo))) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].periodo`,
          "período inválido",
        );
      }
      assertNumber(
        session.cargaHoraria,
        `aulas[${lessonIndex}].sessoes[${sessionIndex}].cargaHoraria`,
        0.01,
        1000,
      );
      if (sessionIdSet.has(session.id as string)) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].id`,
          "sessão duplicada",
        );
      }
      if (periods.has(session.periodo as string)) {
        fail(
          `aulas[${lessonIndex}].sessoes[${sessionIndex}].periodo`,
          "período duplicado no encontro",
        );
      }
      if (sessions.length > 1 && session.periodo === "U") {
        fail(
          `aulas[${lessonIndex}].sessoes`,
          "período único não pode coexistir com outras sessões",
        );
      }
      const order = periodOrder[String(session.periodo)];
      if (order < previousPeriodOrder) {
        fail(
          `aulas[${lessonIndex}].sessoes`,
          "períodos fora da ordem canônica",
        );
      }
      previousPeriodOrder = order;
      periods.add(session.periodo as string);
      sessionIdSet.add(session.id as string);
      sessionIds.push(session.id as string);
      sessionHours.set(session.id as string, session.cargaHoraria as number);
      lessonHours += session.cargaHoraria as number;
    });
    if (!nearlyEqual(lessonHours, lesson.cargaHoraria as number, 0.001)) {
      fail(`aulas[${lessonIndex}].cargaHoraria`, "diverge da soma das sessões");
    }
  });
  for (let index = 1; index < lessons.length; index += 1) {
    const previousDate = String(
      asRecord(lessons[index - 1], `aulas[${index - 1}]`).dataSource,
    );
    const currentDate = String(
      asRecord(lessons[index], `aulas[${index}]`).dataSource,
    );
    if (previousDate > currentDate) {
      fail("aulas", "encontros fora da ordem cronológica canônica");
    }
  }
  if (sessionIds.length > 5000) {
    fail("aulas.sessoes", "limite de 5000 sessões excedido");
  }

  const attendanceMap = asRecord(snapshot.attendanceMap, "attendanceMap");
  const gradesMap = asRecord(snapshot.gradesMap, "gradesMap");
  const practicesMap = asRecord(snapshot.praticasMap, "praticasMap");
  sameKeys(attendanceMap, studentIds, "attendanceMap");
  sameKeys(gradesMap, studentIds, "gradesMap");
  sameKeys(practicesMap, lessonIds, "praticasMap");
  lessonIds.forEach((lessonId) =>
    assertText(practicesMap[lessonId], `praticasMap.${lessonId}`, {
      allowEmpty: true,
      max: 10000,
    })
  );

  const gradeKeys = [
    "p",
    "ti",
    "tg",
    "s",
    "cq",
    "o",
    "rec",
    "total_aulas",
    "total_faltas",
    "frequencia_percent",
    "media_parcial",
    "media_final",
    "resultado_final",
  ] as const;
  const totalHours = [...sessionHours.values()].reduce(
    (sum, hours) => sum + hours,
    0,
  );
  studentIds.forEach((studentId) => {
    const attendance = asRecord(
      attendanceMap[studentId],
      `attendanceMap.${studentId}`,
    );
    sameKeys(attendance, sessionIds, `attendanceMap.${studentId}`);
    let absences = 0;
    let absentHours = 0;
    sessionIds.forEach((sessionId) => {
      const status = attendance[sessionId];
      if (!["P", "F", "J"].includes(String(status))) {
        fail(
          `attendanceMap.${studentId}.${sessionId}`,
          "presença fechada P, F ou J obrigatória",
        );
      }
      if (status === "F") {
        const hours = sessionHours.get(sessionId);
        if (hours === undefined) {
          fail(
            `attendanceMap.${studentId}.${sessionId}`,
            "sessão sem carga horária congelada",
          );
        }
        absences += 1;
        absentHours += hours;
      }
    });

    const grade = asRecord(gradesMap[studentId], `gradesMap.${studentId}`);
    assertExactKeys(grade, gradeKeys, [], `gradesMap.${studentId}`);
    [...instrumentKeys, "rec", "media_parcial", "media_final"].forEach((
      key,
    ) => (
      assertNullableGrade(grade[key], `gradesMap.${studentId}.${key}`)
    ));
    assertNumber(
      grade.total_aulas,
      `gradesMap.${studentId}.total_aulas`,
      0,
      5000,
      true,
    );
    assertNumber(
      grade.total_faltas,
      `gradesMap.${studentId}.total_faltas`,
      0,
      5000,
      true,
    );
    assertNumber(
      grade.frequencia_percent,
      `gradesMap.${studentId}.frequencia_percent`,
      0,
      100,
    );
    if (grade.total_aulas !== sessionIds.length) {
      fail(
        `gradesMap.${studentId}.total_aulas`,
        "diverge das sessões congeladas",
      );
    }
    if (grade.total_faltas !== absences) {
      fail(
        `gradesMap.${studentId}.total_faltas`,
        "diverge das faltas congeladas",
      );
    }
    const expectedFrequency =
      Math.round(((totalHours - absentHours) / totalHours) * 10_000) / 100;
    if (!nearlyEqual(grade.frequencia_percent as number, expectedFrequency)) {
      fail(
        `gradesMap.${studentId}.frequencia_percent`,
        "diverge da frequência congelada",
      );
    }
    if (
      typeof grade.resultado_final !== "string" ||
      !RESULT_VALUES.has(
        grade.resultado_final as DiarioPdfGradeSnapshot["resultado_final"],
      )
    ) {
      fail(
        `gradesMap.${studentId}.resultado_final`,
        "resultado acadêmico desconhecido",
      );
    }
    if (grade.resultado_final !== "APROVEITADO") {
      instrumentKeys.forEach((key) => {
        if (instruments[key] === true && grade[key] === null) {
          fail(
            `gradesMap.${studentId}.${key}`,
            "nota ativa ausente no snapshot fechado",
          );
        }
        if (instruments[key] === false && grade[key] !== null) {
          fail(
            `gradesMap.${studentId}.${key}`,
            "nota inativa presente no snapshot fechado",
          );
        }
      });
      const expectedPartial = Math.min(
        10,
        Math.round(
          instrumentKeys.reduce(
            (sum, key) =>
              sum + (instruments[key] === true ? Number(grade[key]) : 0),
            0,
          ) * 10,
        ) / 10,
      );
      if (
        typeof grade.media_parcial !== "number" ||
        !nearlyEqual(grade.media_parcial, expectedPartial, 0.001)
      ) {
        fail(
          `gradesMap.${studentId}.media_parcial`,
          "diverge das notas ativas congeladas",
        );
      }
      const expectedFinal =
        typeof grade.rec === "number" && grade.rec > expectedPartial
          ? grade.rec
          : expectedPartial;
      if (
        typeof grade.media_final !== "number" ||
        !nearlyEqual(grade.media_final, expectedFinal, 0.001)
      ) {
        fail(
          `gradesMap.${studentId}.media_final`,
          "diverge da média parcial e recuperação",
        );
      }
      if (
        ["SEM_LANCAMENTO", "FREQUENCIA_PENDENTE"].includes(
          String(grade.resultado_final),
        )
      ) {
        fail(
          `gradesMap.${studentId}.resultado_final`,
          "estado pendente incompatível com snapshot fechado",
        );
      }
      if (grade.resultado_final === "EM_RECUPERACAO" && grade.rec !== null) {
        fail(
          `gradesMap.${studentId}.resultado_final`,
          "recuperação já lançada não pode permanecer pendente",
        );
      }
      if (grade.resultado_final === "REPROVADO" && grade.rec === null) {
        fail(
          `gradesMap.${studentId}.resultado_final`,
          "reprovação por nota exige recuperação lançada",
        );
      }
    } else {
      const partial = grade.media_parcial;
      const final = grade.media_final;
      if (typeof partial !== "number" || typeof final !== "number") {
        fail(
          `gradesMap.${studentId}`,
          "aproveitamento exige médias acadêmicas congeladas",
        );
      }
      const expectedFinal = typeof grade.rec === "number" && grade.rec > partial
        ? grade.rec
        : partial;
      if (!nearlyEqual(final, expectedFinal, 0.001)) {
        fail(
          `gradesMap.${studentId}.media_final`,
          "diverge do aproveitamento congelado",
        );
      }
    }
  });

  const institutionalIdentity = asRecord(
    snapshot.institutionalIdentity,
    "institutionalIdentity",
  );
  assertExactKeys(
    institutionalIdentity,
    ["institution", "logoUrl", "watermarkUrl"],
    ["watermark"],
    "institutionalIdentity",
  );
  const institution = asRecord(
    institutionalIdentity.institution,
    "institutionalIdentity.institution",
  );
  const institutionKeys = [
    "name",
    "legalName",
    "cnpj",
    "address",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    "postalCode",
    "phone",
    "email",
    "isHeadquarters",
  ] as const;
  assertExactKeys(
    institution,
    institutionKeys,
    [],
    "institutionalIdentity.institution",
  );
  institutionKeys.slice(0, -1).forEach((key) => (
    assertText(institution[key], `institutionalIdentity.institution.${key}`, {
      allowEmpty: ["legalName", "complement"].includes(key),
      max: 300,
    })
  ));
  assertBoolean(
    institution.isHeadquarters,
    "institutionalIdentity.institution.isHeadquarters",
  );
  assertCanonicalAssetUrl(
    institutionalIdentity.logoUrl,
    "institutionalIdentity.logoUrl",
  );
  assertCanonicalWatermarkSource(
    institutionalIdentity.watermarkUrl,
    "institutionalIdentity.watermarkUrl",
    true,
  );
  if (institutionalIdentity.watermark !== undefined) {
    if (institutionalIdentity.watermarkUrl === null) {
      fail(
        "institutionalIdentity.watermark",
        "exige marca-d'água institucional",
      );
    }
    const watermark = asRecord(
      institutionalIdentity.watermark,
      "institutionalIdentity.watermark",
    );
    assertExactKeys(
      watermark,
      ["url", "opacity", "scale", "rotate"],
      [],
      "institutionalIdentity.watermark",
    );
    assertCanonicalWatermarkSource(
      watermark.url,
      "institutionalIdentity.watermark.url",
    );
    if (
      typeof watermark.url !== "string" ||
      !watermark.url.startsWith("data:image/")
    ) {
      fail(
        "institutionalIdentity.watermark.url",
        "deve usar o data URI institucional congelado",
      );
    }
    if (watermark.url !== institutionalIdentity.watermarkUrl) {
      fail(
        "institutionalIdentity.watermark.url",
        "diverge da referência institucional congelada",
      );
    }
    assertNumber(
      watermark.opacity,
      "institutionalIdentity.watermark.opacity",
      0,
      1,
    );
    assertNumber(
      watermark.scale,
      "institutionalIdentity.watermark.scale",
      10,
      100,
      true,
    );
    if (watermark.scale % 5 !== 0) {
      fail(
        "institutionalIdentity.watermark.scale",
        "deve seguir os incrementos do modelo oficial",
      );
    }
    assertBoolean(
      watermark.rotate,
      "institutionalIdentity.watermark.rotate",
    );
  }

  const assetSources = asRecord(snapshot.assetSources, "assetSources");
  assertExactKeys(
    assetSources,
    ["coverUrl", "backCoverUrl", "headerLogoUrl", "watermarkUrl"],
    [],
    "assetSources",
  );
  assertCanonicalAssetUrl(assetSources.coverUrl, "assetSources.coverUrl", true);
  assertCanonicalAssetUrl(
    assetSources.backCoverUrl,
    "assetSources.backCoverUrl",
    true,
  );
  assertCanonicalAssetUrl(
    assetSources.headerLogoUrl,
    "assetSources.headerLogoUrl",
  );
  assertCanonicalWatermarkSource(
    assetSources.watermarkUrl,
    "assetSources.watermarkUrl",
    true,
  );
  if (
    assetSources.coverUrl !== template.capaUrl ||
    assetSources.backCoverUrl !== template.contracapaUrl ||
    assetSources.headerLogoUrl !== institutionalIdentity.logoUrl ||
    assetSources.watermarkUrl !== institutionalIdentity.watermarkUrl
  ) {
    fail(
      "assetSources",
      "referências divergem do template ou identidade institucional",
    );
  }

  const closure = asRecord(snapshot.closure, "closure");
  assertExactKeys(
    closure,
    ["lock", "hoursCompleted", "requiredHours", "snapshotAt"],
    [],
    "closure",
  );
  if (closure.lock !== "PROFESSOR") {
    fail("closure.lock", "diário precisa estar enviado para revisão");
  }
  assertNumber(closure.hoursCompleted, "closure.hoursCompleted", 0, 100_000);
  assertNumber(closure.requiredHours, "closure.requiredHours", 0.01, 100_000);
  assertTimestamp(closure.snapshotAt, "closure.snapshotAt");
  if ((closure.hoursCompleted as number) < (closure.requiredHours as number)) {
    fail("closure.hoursCompleted", "carga horária ainda incompleta");
  }
  if (!nearlyEqual(closure.hoursCompleted as number, totalHours, 0.001)) {
    fail("closure.hoursCompleted", "diverge da soma das sessões congeladas");
  }
  if (
    !nearlyEqual(
      closure.requiredHours as number,
      disciplina.cargaHoraria as number,
      0.001,
    )
  ) {
    fail("closure.requiredHours", "diverge da carga horária da disciplina");
  }
  if (closure.snapshotAt !== snapshot.generatedAt) {
    fail("generatedAt", "deve coincidir com closure.snapshotAt");
  }

  return snapshot as unknown as DiarioPdfAcademicSnapshot;
};

export const formatDiarioPdfAcademicDate = (dataSource: string) => {
  assertIsoDate(dataSource, "aulas.dataSource");
  const [year, month, day] = dataSource.split("-");
  return `${day}/${month}/${year}`;
};
