/* global structuredClone */

import type { DiarioPdfResolvedAssets } from "./diario-pdf.ts";
import type {
  DiarioPdfAcademicSnapshot,
  DiarioPdfCoverField,
} from "./diario-pdf.contract.ts";
import { loadPdfImage } from "./diario-pdf-image.ts";
import {
  createDocumentValidationQrDataUrl,
} from "../../../../../../shared/document-validation/document-validation.qr.ts";
import type {
  FrozenSnapshotIntegrity,
} from "../../../../../../../supabase/functions/assinatura-eletronica-diario-artefatos/snapshot-integrity.ts";

declare const Deno: {
  readFile: (path: string | URL) => Promise<Uint8Array>;
};

export const IDS = {
  company: "00000000-0000-4000-8000-000000000001",
  polo: "00000000-0000-4000-8000-000000000002",
  course: "00000000-0000-4000-8000-000000000003",
  turma: "00000000-0000-4000-8000-000000000004",
  disciplina: "00000000-0000-4000-8000-000000000005",
  student: "00000000-0000-4000-8000-000000000006",
  lesson: "00000000-0000-4000-8000-000000000007",
  session: "00000000-0000-4000-8000-000000000008",
} as const;

const coverFields: DiarioPdfCoverField[] = [
  {
    id: "curso",
    label: "CURSO: ",
    x: 29.6,
    y: 52.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: "#071a33",
    bold: true,
    align: "left",
  },
  {
    id: "modulo",
    label: "MÓDULO: ",
    x: 29.6,
    y: 58.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: "#071a33",
    bold: true,
    align: "left",
  },
  {
    id: "areaTematica",
    label: "ÁREA TEMÁTICA: ",
    x: 29.6,
    y: 64.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: "#071a33",
    bold: true,
    align: "left",
  },
  {
    id: "disciplina",
    label: "UNIDADE EDUCACIONAL: ",
    x: 29.6,
    y: 70.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: "#071a33",
    bold: true,
    align: "left",
  },
  {
    id: "turma",
    label: "TURMA: ",
    x: 29.6,
    y: 76.8,
    width: 50.5,
    fontSize: 11,
    visible: true,
    color: "#071a33",
    bold: true,
    align: "left",
  },
  {
    id: "professor",
    label: "",
    x: 66.3,
    y: 83.5,
    width: 23.5,
    fontSize: 10,
    visible: true,
    color: "#071a33",
    bold: false,
    borderTop: true,
    align: "center",
  },
];

const backField = (
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  options: Record<string, unknown> = {},
) => ({
  id,
  label,
  valuePlaceholder: "",
  x,
  y,
  width,
  fontSize,
  visible: true,
  color: "#071a33",
  bold: true,
  align: "left",
  ...options,
});

const backCoverFields = [
  backField("contracapaTitulo", "REGISTRO DE VALIDAÇÃO E ASSINATURA ELETRÔNICA", 10, 10, 80, 12, { align: "center" }),
  backField("contracapaCurso", "CURSO: ", 10, 25, 45, 9),
  backField("contracapaTurma", "TURMA: ", 58, 25, 25, 9),
  backField("contracapaDisciplina", "DISCIPLINA: ", 10, 31, 45, 9),
  backField("contracapaModulo", "MÓDULO: ", 58, 31, 25, 9),
  backField("contracapaProfessor", "PROFESSOR(A): ", 10, 37, 73, 9),
  backField("contracapaRegulamento", "", 10, 47, 58, 8, { bold: false }),
  backField("contracapaAutenticacao", "CHAVE DE AUTENTICAÇÃO: ", 10, 65, 58, 7.5, { color: "#64748b", bold: false }),
  backField("contracapaQrCode", "ESCANEAR PARA VALIDAR", 72, 25, 18, 7, { align: "center" }),
  backField("contracapaAssinaturaProfessor", "ASSINATURA DO PROFESSOR", 10, 84, 38, 8, { borderTop: true, align: "center" }),
  backField("contracapaAssinaturaCoordenador", "ASSINATURA DO COORDENADOR DO CURSO", 52, 84, 38, 8, { borderTop: true, align: "center" }),
];

export const createSnapshot = (): DiarioPdfAcademicSnapshot => ({
  schemaVersion: 2,
  composerSchemaVersion: 1,
  documentType: "diario_classe",
  source: {
    type: "DIARIO",
    turmaId: IDS.turma,
    disciplinaId: IDS.disciplina,
    originVersion: 1,
    courseId: IDS.course,
    poloId: IDS.polo,
    companyId: IDS.company,
    academicRevisionSha256: "a".repeat(64),
  },
  template: {
    capaUrl: null,
    contracapaUrl: null,
    cabecalhoLogoUrl: "https://assets.universocc.com.br/logo.png",
    rodape: "Documento Oficial - Diário de Classe",
    imprimirInstrucoes: false,
    capaCampos: coverFields,
    imprimirValidacaoContracapa: true,
    mensagemValidacao:
      "Documento eletrônico verificável no validador institucional.",
    qrCodeSize: 28,
  },
  templateSource: {
    id: "diario_TECNICO",
    updatedAt: "2026-08-19T12:00:00Z",
    version: 1,
    raw: {
      versao: 1,
      contracapaCampos: backCoverFields,
    },
    sha256: "b".repeat(64),
  },
  turma: {
    id: IDS.turma,
    cursoNome: "Curso Técnico",
    nome: "Turma Teste",
    codigo: "T-001",
  },
  disciplina: {
    id: IDS.disciplina,
    nome: "Unidade Educacional",
    professor: "Professor Teste",
    cargaHoraria: 4,
  },
  moduloNome: "MÓDULO I - Fundamentos",
  students: [{ id: IDS.student, nome: "Aluno Teste", matricula: "2026-001" }],
  aulas: [{
    id: IDS.lesson,
    titulo: "Conteúdo canônico do backend",
    cargaHoraria: 4,
    dataSource: "2026-08-19",
    sessoes: [{ id: IDS.session, periodo: "U", cargaHoraria: 4 }],
  }],
  attendanceMap: { [IDS.student]: { [IDS.session]: "P" } },
  gradesMap: {
    [IDS.student]: {
      p: 2,
      ti: 2,
      tg: 1,
      s: 1,
      cq: 1,
      o: 1,
      rec: null,
      total_aulas: 1,
      total_faltas: 0,
      frequencia_percent: 100,
      media_parcial: 8,
      media_final: 8,
      resultado_final: "APROVADO",
    },
  },
  praticasMap: { [IDS.lesson]: "Prática canônica do backend" },
  observacoes: "Sem observações.",
  activeInstruments: {
    p: true,
    ti: true,
    tg: true,
    s: true,
    cq: true,
    o: true,
  },
  exportMode: "PREENCHIDO",
  validationCode: "DIA-TECNICO-TESTE",
  validationPreview: false,
  institutionalIdentity: {
    institution: {
      name: "UNIVERSO CURSOS E CONSULTORIA",
      legalName: "",
      cnpj: "13.278.137/0001-54",
      address: "Rua C",
      number: "S/N",
      complement: "",
      neighborhood: "Centro",
      city: "Japoatã",
      state: "SE",
      postalCode: "49950-000",
      phone: "(79) 99602-8316",
      email: "universo.cursoseconsultoria@gmail.com",
      isHeadquarters: true,
    },
    logoUrl: "https://assets.universocc.com.br/logo.png",
    watermarkUrl: null,
  },
  assetSources: {
    coverUrl: null,
    backCoverUrl: null,
    headerLogoUrl: "https://assets.universocc.com.br/logo.png",
    watermarkUrl: null,
  },
  closure: {
    lock: "PROFESSOR",
    hoursCompleted: 4,
    requiredHours: 4,
    snapshotAt: "2026-08-19T12:00:00Z",
  },
  generatedAt: "2026-08-19T12:00:00Z",
});

export const cloneSnapshot = () =>
  structuredClone(createSnapshot()) as DiarioPdfAcademicSnapshot;

export const loadAssets = async (): Promise<DiarioPdfResolvedAssets> => {
  const logo = {
    bytes: await Deno.readFile(
      new URL("../../../../../../../public/LogoUniverso.png", import.meta.url),
    ),
    format: "PNG" as const,
  };
  const validationUrl =
    "https://universocc.com.br/validador?code=DIA-TECNICO-TESTE";
  const qrImage = await loadPdfImage(
    await createDocumentValidationQrDataUrl("DIA-TECNICO-TESTE", { size: 240 }),
  );
  if (!qrImage) throw new Error("Fixture não conseguiu produzir o QR isolado.");
  return {
    logo,
    watermark: null,
    backCoverBackground: null,
    backCoverImages: {},
    qrCode: {
      image: qrImage,
      payload: validationUrl,
      generatedBy: "TRUSTED_ADAPTER",
    },
    validationEndpoint: {
      origin: "https://universocc.com.br",
      pathname: "/validador",
      generatedBy: "TRUSTED_ADAPTER",
    },
    validationUrl,
  };
};

export const createSnapshotIntegrity = async (
  snapshot: DiarioPdfAcademicSnapshot,
): Promise<FrozenSnapshotIntegrity> => {
  const canonicalJson = JSON.stringify(snapshot);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson),
  );
  const documentSnapshotSha256 = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    schemaVersion: 1,
    canonicalization: "POSTGRES_JSONB_TEXT_UTF8_V1",
    hashAlgorithm: "SHA-256",
    encoding: "UTF-8",
    canonicalJson,
    documentSnapshotSha256,
    academicRevisionSha256: snapshot.source.academicRevisionSha256,
    templateSourceSha256: snapshot.templateSource.sha256,
  };
};
