import type { DiarioPdfCoverField } from "./diario-pdf.contract.types.ts";
import {
  asRecord,
  assertBoolean,
  assertCanonicalAssetUrl,
  assertExactKeys,
  assertNumber,
  assertSha256,
  assertText,
  assertTimestamp,
  assertUuid,
  COVER_FIELD_IDS,
  fail,
  HEX_COLOR_PATTERN,
  VALIDATION_CODE_PATTERN,
} from "./diario-pdf.contract.validation-core.ts";

export const assertSnapshotEnvelope = (input: unknown) => {
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
  ) => assertUuid(source[key], `source.${key}`));
  assertNumber(
    source.originVersion,
    "source.originVersion",
    1,
    1_000_000,
    true,
  );
  assertSha256(source.academicRevisionSha256, "source.academicRevisionSha256");

  return { snapshot, source };
};

export const assertTemplateStructure = (
  snapshot: Record<string, unknown>,
) => {
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
      typeof field.color !== "string" ||
      !HEX_COLOR_PATTERN.test(field.color)
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

  return template;
};

export const assertTemplateSource = (snapshot: Record<string, unknown>) => {
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
};

export const assertClassStructure = (
  snapshot: Record<string, unknown>,
  source: Record<string, unknown>,
) => {
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

  return { disciplina, instruments, instrumentKeys };
};
