/* global structuredClone, TextDecoder */

import assert from "node:assert/strict";
import {
  composeDiarioPdfWithManifest,
  type DiarioPdfResolvedAssets,
} from "./diario-pdf.ts";
import {
  assertValidDiarioPdfAcademicSnapshot,
  type DiarioPdfAcademicSnapshot,
  type DiarioPdfCoverField,
} from "./diario-pdf.contract.ts";
import { loadPdfImage } from "./diario-pdf-image.ts";
import {
  createDocumentValidationQrDataUrl,
} from "../../../../../../shared/document-validation/document-validation.qr.ts";
import {
  type FrozenSnapshotIntegrity,
  verifyFrozenDocumentSnapshot,
} from "../../../../../../../supabase/functions/assinatura-eletronica-diario-artefatos/snapshot-integrity.ts";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  readFile: (path: string | URL) => Promise<Uint8Array>;
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const IDS = {
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
    raw: { versao: 1 },
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

const cloneSnapshot = () =>
  structuredClone(createSnapshot()) as DiarioPdfAcademicSnapshot;

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

Deno.test("compositor puro gera bytes, SHA-256 e manifesto no mesmo ciclo", async () => {
  const built = await composeDiarioPdfWithManifest(
    createSnapshot(),
    await loadAssets(),
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      built.bytes.slice().buffer as ArrayBuffer,
    ),
  );
  const expectedSha256 = [...digest].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  assert.equal(new TextDecoder().decode(built.bytes.subarray(0, 4)), "%PDF");
  assert.equal(built.sha256, expectedSha256);
  assert.match(built.sha256, /^[0-9a-f]{64}$/);
  assert.equal(built.manifest.pageCount, built.pdf.getNumberOfPages());
  assert.equal(built.manifest.targetPageIndex, built.manifest.pageCount - 1);
  assert.equal(built.manifest.instructionsPageIndex, null);
});

Deno.test("compositor puro reproduz bytes idênticos para o mesmo snapshot congelado", async () => {
  const [first, second] = await Promise.all([
    composeDiarioPdfWithManifest(createSnapshot(), await loadAssets()),
    composeDiarioPdfWithManifest(createSnapshot(), await loadAssets()),
  ]);

  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
});

Deno.test("adapter Edge verifica bytes canônicos e hashes internos antes de compor", async () => {
  const snapshot = createSnapshot();
  const integrity = await createSnapshotIntegrity(snapshot);
  const verified = await verifyFrozenDocumentSnapshot(
    integrity,
    integrity.documentSnapshotSha256,
  );
  assert.equal(verified.observacoes, "Sem observações.");
  assert.equal(Object.isFrozen(verified), true);

  const changedObservations = structuredClone(integrity);
  changedObservations.canonicalJson = changedObservations.canonicalJson.replace(
    "Sem observações.",
    "Observação adulterada.",
  );
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        changedObservations,
        integrity.documentSnapshotSha256,
      ),
    /conteúdo canônico/u,
  );

  const changedTemplateRaw = structuredClone(integrity);
  changedTemplateRaw.canonicalJson = changedTemplateRaw.canonicalJson.replace(
    '"raw":{"versao":1}',
    '"raw":{"versao":2}',
  );
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        changedTemplateRaw,
        integrity.documentSnapshotSha256,
      ),
    /conteúdo canônico/u,
  );
});

Deno.test("adapter Edge compara os hashes acadêmico e de modelo embutidos com a prova SQL", async () => {
  const altered = createSnapshot();
  altered.source.academicRevisionSha256 = "c".repeat(64);
  const alteredProof = await createSnapshotIntegrity(altered);
  alteredProof.academicRevisionSha256 = "a".repeat(64);
  await assert.rejects(
    () =>
      verifyFrozenDocumentSnapshot(
        alteredProof,
        alteredProof.documentSnapshotSha256,
      ),
    /hashes internos/u,
  );
});

Deno.test("snapshot runtime é fechado e rejeita metadados, IDs e fechamento adulterados", () => {
  assert.equal(
    assertValidDiarioPdfAcademicSnapshot(createSnapshot()).schemaVersion,
    2,
  );

  const missingVersion = cloneSnapshot() as unknown as Record<string, unknown>;
  delete missingVersion.composerSchemaVersion;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(missingVersion),
    /faltam composerSchemaVersion/u,
  );

  const extra = cloneSnapshot() as unknown as Record<string, unknown>;
  extra.frontendHint = true;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(extra),
    /sobram frontendHint/u,
  );

  const badId = cloneSnapshot();
  badId.turma.id = "turma-local";
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badId),
    /turma\.id: UUID/u,
  );

  const badHash = cloneSnapshot();
  badHash.source.academicRevisionSha256 = "A".repeat(64);
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badHash),
    /academicRevisionSha256/u,
  );

  const openDiary = cloneSnapshot();
  openDiary.closure.lock = "TOTAL" as "PROFESSOR";
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(openDiary),
    /closure\.lock/u,
  );

  const incomplete = cloneSnapshot();
  incomplete.closure.hoursCompleted = 3;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(incomplete),
    /carga horária ainda incompleta/u,
  );

  const divergentHours = cloneSnapshot();
  divergentHours.closure.hoursCompleted = 5;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(divergentHours),
    /soma das sessões/u,
  );
});

Deno.test("snapshot rejeita períodos, presença, notas, faltas e mapas incoerentes", () => {
  const badPeriod = cloneSnapshot();
  badPeriod.aulas[0].sessoes.push({
    id: "00000000-0000-4000-8000-000000000009",
    periodo: "U",
    cargaHoraria: 1,
  });
  badPeriod.aulas[0].cargaHoraria = 5;
  badPeriod.attendanceMap[IDS.student]["00000000-0000-4000-8000-000000000009"] =
    "P";
  badPeriod.gradesMap[IDS.student].total_aulas = 2;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badPeriod),
    /período único/u,
  );

  const pendingAttendance = cloneSnapshot();
  pendingAttendance.attendanceMap[IDS.student][IDS.session] = null;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(pendingAttendance),
    /presença fechada/u,
  );

  const extraAttendance = cloneSnapshot();
  extraAttendance
    .attendanceMap[IDS.student]["00000000-0000-4000-8000-000000000099"] = "P";
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(extraAttendance),
    /chaves não correspondem/u,
  );

  const badAbsence = cloneSnapshot();
  badAbsence.attendanceMap[IDS.student][IDS.session] = "F";
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badAbsence),
    /total_faltas/u,
  );

  const badFrequency = cloneSnapshot();
  badFrequency.gradesMap[IDS.student].frequencia_percent = 99;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badFrequency),
    /frequencia_percent/u,
  );

  const missingGrade = cloneSnapshot();
  delete missingGrade.gradesMap[IDS.student];
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(missingGrade),
    /gradesMap/u,
  );

  const inactiveGrade = cloneSnapshot();
  inactiveGrade.activeInstruments.ti = false;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(inactiveGrade),
    /nota inativa/u,
  );

  const badPartial = cloneSnapshot();
  badPartial.gradesMap[IDS.student].p = 3;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badPartial),
    /media_parcial/u,
  );

  const badFinal = cloneSnapshot();
  badFinal.gradesMap[IDS.student].rec = 9;
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badFinal),
    /media_final/u,
  );

  const extraPractice = cloneSnapshot();
  extraPractice.praticasMap["00000000-0000-4000-8000-000000000099"] =
    "Injetada";
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(extraPractice),
    /praticasMap/u,
  );
});

Deno.test("compositor puro rejeita bytes de imagem adulterados", async () => {
  const assets = await loadAssets();
  await assert.rejects(
    () =>
      composeDiarioPdfWithManifest(createSnapshot(), {
        ...assets,
        logo: { bytes: new Uint8Array([1, 2, 3]), format: "PNG" },
      }),
    /logo do Diário não é uma imagem .* válida/u,
  );
});

Deno.test("URL e QR exigem origem, path e payload exatos do adaptador confiável", async () => {
  const snapshot = createSnapshot();
  const assets = await loadAssets();
  const probes: Array<[string, DiarioPdfResolvedAssets, RegExp]> = [
    ["query extra", {
      ...assets,
      validationUrl: `${assets.validationUrl}&next=https://evil.test`,
    }, /URL canônica/u],
    ["fragmento", {
      ...assets,
      validationUrl: `${assets.validationUrl}#assinatura`,
    }, /URL canônica/u],
    ["origem diversa", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        origin: "https://evil.test",
      },
    }, /URL canônica/u],
    ["path diverso", {
      ...assets,
      validationEndpoint: { ...assets.validationEndpoint!, pathname: "/outro" },
    }, /URL canônica/u],
    ["credenciais", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        origin: "https://user:pass@universocc.com.br",
      },
    }, /origem ou o path/u],
    ["endpoint não confiável", {
      ...assets,
      validationEndpoint: {
        ...assets.validationEndpoint!,
        generatedBy: "BROWSER" as "TRUSTED_ADAPTER",
      },
    }, /adaptador confiável/u],
    ["QR não confiável", {
      ...assets,
      qrCode: {
        ...assets.qrCode!,
        generatedBy: "BROWSER" as "TRUSTED_ADAPTER",
      },
    }, /adaptador confiável/u],
    ["payload diferente", {
      ...assets,
      qrCode: {
        ...assets.qrCode!,
        payload: "https://universocc.com.br/validador?code=OUTRO",
      },
    }, /conteúdo do QR Code/u],
  ];

  for (const [label, probe, expected] of probes) {
    await assert.rejects(
      () => composeDiarioPdfWithManifest(snapshot, probe),
      expected,
      label,
    );
  }
});

Deno.test("fronteira server-safe é vetorial e importa o cabeçalho canônico compartilhado", async () => {
  const [core, adapter, hook, modal] = await Promise.all([
    Deno.readTextFile(new URL("./diario-pdf.ts", import.meta.url)),
    Deno.readTextFile(new URL("./diario-pdf.browser.ts", import.meta.url)),
    Deno.readTextFile(
      new URL("./hooks/useDiarioPdfDownload.ts", import.meta.url),
    ),
    Deno.readTextFile(
      new URL("./export/DiarioExportModal.tsx", import.meta.url),
    ),
  ]);

  assert.doesNotMatch(
    core,
    /React|\.tsx['"]|Documentos\/Capa|import\.meta\.env/u,
  );
  assert.doesNotMatch(core, /\b(?:window|document)\.|\bfetch\s*\(/u);
  assert.doesNotMatch(
    core,
    /addFullPageImage|backCover:\s*PdfImage|cover:\s*PdfImage/u,
  );
  assert.doesNotMatch(
    core,
    /createDocumentValidationQrDataUrl|getDocumentValidationUrl|loadPdfImage/u,
  );
  assert.match(core, /drawCanonicalInstitutionalHeader/u);
  assert.match(core, /drawCanonicalPdfWatermark/u);
  assert.match(core, /["']diario-validation-qr["'],\s*["']FAST["']/u);
  assert.match(core, /crypto\.subtle\.digest\(["']SHA-256["'], bytes\)/u);
  assert.doesNotMatch(adapter, /Documentos\/Capa-Diario|capaDiarioPadrao/u);
  assert.match(adapter, /generatedBy:\s*'TRUSTED_ADAPTER'/u);
  assert.match(adapter, /createDocumentValidationQrDataUrl/u);
  assert.match(adapter, /getDocumentValidationUrl/u);
  assert.match(adapter, /loadPdfImage/u);
  assert.match(adapter, /composeDiarioPdfWithManifest/u);
  assert.match(hook, /from '\.\.\/diario-pdf\.browser'/u);
  assert.match(modal, /from '\.\.\/diario-pdf\.browser'/u);
});
