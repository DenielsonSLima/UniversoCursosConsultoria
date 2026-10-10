import assert from "node:assert/strict";
import {
  assertValidDiarioPdfAcademicSnapshot,
} from "./diario-pdf.contract.ts";
import {
  cloneSnapshot,
  createSnapshot,
  IDS,
} from "./diario-pdf-server-boundary.fixtures.ts";

declare const Deno: {
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

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

Deno.test("snapshot novo congela a apresentação exata da marca institucional", () => {
  const watermarkUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const snapshot = cloneSnapshot();
  snapshot.institutionalIdentity.watermarkUrl = watermarkUrl;
  snapshot.assetSources.watermarkUrl = watermarkUrl;
  snapshot.institutionalIdentity.watermark = {
    url: watermarkUrl,
    opacity: 1,
    scale: 100,
    rotate: false,
  };

  const validated = assertValidDiarioPdfAcademicSnapshot(snapshot);
  assert.deepEqual(validated.institutionalIdentity.watermark, {
    url: watermarkUrl,
    opacity: 1,
    scale: 100,
    rotate: false,
  });

  const divergent = cloneSnapshot();
  divergent.institutionalIdentity.watermarkUrl = watermarkUrl;
  divergent.assetSources.watermarkUrl = watermarkUrl;
  divergent.institutionalIdentity.watermark = {
    url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
    opacity: 1,
    scale: 100,
    rotate: false,
  };
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(divergent),
    /diverge da referência institucional/u,
  );

  const badScale = cloneSnapshot();
  badScale.institutionalIdentity.watermarkUrl = watermarkUrl;
  badScale.assetSources.watermarkUrl = watermarkUrl;
  badScale.institutionalIdentity.watermark = {
    url: watermarkUrl,
    opacity: 1,
    scale: 52,
    rotate: false,
  };
  assert.throws(
    () => assertValidDiarioPdfAcademicSnapshot(badScale),
    /incrementos do modelo oficial/u,
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

Deno.test("snapshot fechado permite O opcional por aluno sem tratar nota zero como ausência", () => {
  for (const [other, partial] of [[null, 7], [0, 7], [0.05, 7.05]] as const) {
    const snapshot = cloneSnapshot();
    snapshot.gradesMap[IDS.student].o = other;
    snapshot.gradesMap[IDS.student].media_parcial = partial;
    snapshot.gradesMap[IDS.student].media_final = partial;
    assert.doesNotThrow(() => assertValidDiarioPdfAcademicSnapshot(snapshot));
  }

  const onlyOther = cloneSnapshot();
  onlyOther.activeInstruments = { p: false, ti: false, tg: false, s: false, cq: false, o: true };
  Object.assign(onlyOther.gradesMap[IDS.student], {
    p: null, ti: null, tg: null, s: null, cq: null, o: 0,
    rec: 6.55, media_parcial: 0, media_final: 6.55,
  });
  assert.doesNotThrow(() => assertValidDiarioPdfAcademicSnapshot(onlyOther));
});

Deno.test("snapshot conserva soma com centésimos e arredondamento legado sem aceitar médias adulteradas", () => {
  for (const [partial, recovery, final] of [
    [8.25, null, 8.25], [8.3, null, 8.3], [8.25, 8.35, 8.35], [8.3, 8.26, 8.3],
  ] as const) {
    const snapshot = cloneSnapshot();
    Object.assign(snapshot.gradesMap[IDS.student], {
      p: 2.25, rec: recovery, media_parcial: partial, media_final: final,
    });
    assert.doesNotThrow(() => assertValidDiarioPdfAcademicSnapshot(snapshot));
  }

  const limited = cloneSnapshot();
  Object.assign(limited.gradesMap[IDS.student], { p: 9.75, media_parcial: 10, media_final: 10 });
  assert.doesNotThrow(() => assertValidDiarioPdfAcademicSnapshot(limited));

  const alteredPartial = cloneSnapshot();
  Object.assign(alteredPartial.gradesMap[IDS.student], { p: 2.25, media_parcial: 8.4, media_final: 8.4 });
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(alteredPartial), /media_parcial/u);

  const alteredFinal = cloneSnapshot();
  Object.assign(alteredFinal.gradesMap[IDS.student], { p: 2.25, rec: 8.35, media_parcial: 8.25, media_final: 8.5 });
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(alteredFinal), /media_final/u);
});

Deno.test("snapshot fechado exige os outros instrumentos ativos e rejeita nenhuma nota ativa lançada", () => {
  for (const key of ["p", "ti", "tg", "s", "cq"] as const) {
    const snapshot = cloneSnapshot();
    snapshot.gradesMap[IDS.student][key] = null;
    assert.throws(() => assertValidDiarioPdfAcademicSnapshot(snapshot), /nota ativa ausente/u);
  }

  const empty = cloneSnapshot();
  empty.activeInstruments = { p: false, ti: false, tg: false, s: false, cq: false, o: true };
  Object.assign(empty.gradesMap[IDS.student], {
    p: null, ti: null, tg: null, s: null, cq: null, o: null,
    rec: null, media_parcial: null, media_final: null, resultado_final: "SEM_LANCAMENTO",
  });
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(empty), /nenhuma nota ativa/u);

  Object.assign(empty.gradesMap[IDS.student], { media_parcial: 0, media_final: 0, resultado_final: "APROVADO" });
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(empty), /nenhuma nota ativa/u);
});
