import type { DiarioPdfAcademicSnapshot } from "./diario-pdf.contract.types.ts";
import { assertAcademicCollections } from "./diario-pdf.contract.validation-academic.ts";
import { assertIsoDate } from "./diario-pdf.contract.validation-core.ts";
import {
  assertClosure,
  assertInstitutionAndAssets,
} from "./diario-pdf.contract.validation-institution.ts";
import {
  assertClassStructure,
  assertSnapshotEnvelope,
  assertTemplateSource,
  assertTemplateStructure,
} from "./diario-pdf.contract.validation-structure.ts";

export type {
  DiarioPdfAcademicSnapshot,
  DiarioPdfActiveInstrumentsSnapshot,
  DiarioPdfCoverField,
  DiarioPdfExportMode,
  DiarioPdfGradeSnapshot,
  DiarioPdfInstitutionalWatermark,
  DiarioPdfInstitutionSnapshot,
  DiarioPdfLessonSnapshot,
  DiarioPdfRenderableData,
  DiarioPdfRenderableGradeSnapshot,
  DiarioPdfSessionSnapshot,
  DiarioPdfStudentSnapshot,
  DiarioPdfTemplateSnapshot,
} from "./diario-pdf.contract.types.ts";

/**
 * Validação fechada, sem coerção nem preenchimento de valores acadêmicos. Um
 * snapshot incompatível é rejeitado antes de criar qualquer página do PDF.
 */
export const assertValidDiarioPdfAcademicSnapshot = (
  input: unknown,
): DiarioPdfAcademicSnapshot => {
  const { snapshot, source } = assertSnapshotEnvelope(input);
  const template = assertTemplateStructure(snapshot);
  assertTemplateSource(snapshot);
  const { disciplina, instruments, instrumentKeys } = assertClassStructure(
    snapshot,
    source,
  );
  const totalHours = assertAcademicCollections(
    snapshot,
    instruments,
    instrumentKeys,
  );
  assertInstitutionAndAssets(snapshot, template);
  assertClosure(snapshot, disciplina, totalHours);

  return snapshot as unknown as DiarioPdfAcademicSnapshot;
};

export const formatDiarioPdfAcademicDate = (dataSource: string) => {
  assertIsoDate(dataSource, "aulas.dataSource");
  const [year, month, day] = dataSource.split("-");
  return `${day}/${month}/${year}`;
};
