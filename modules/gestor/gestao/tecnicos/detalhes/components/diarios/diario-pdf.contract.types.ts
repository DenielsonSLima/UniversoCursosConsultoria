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
