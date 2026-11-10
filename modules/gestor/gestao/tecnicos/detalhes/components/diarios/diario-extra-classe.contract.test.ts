import assert from 'node:assert/strict';
import { assertValidDiarioPdfAcademicSnapshot } from './diario-pdf.contract.ts';
import { assertExtraClassCredit } from './diario-pdf.contract.validation-extra-class.ts';
import { createExtraClassSnapshot, createLinkedExtraClassSnapshot, EXTRA_IDS } from './diario-extra-classe.fixtures.ts';
import { createSnapshot, createSnapshotIntegrity, IDS } from './diario-pdf-server-boundary.fixtures.ts';
import { verifyFrozenDocumentSnapshot } from '../../../../../../../supabase/functions/assinatura-eletronica-diario-artefatos/snapshot-integrity.ts';

declare const Deno: { test: (name: string, fn: () => void | Promise<void>) => void };

Deno.test('extra-classe conta no percentual individual sem fabricar aula ou chamada', () => {
  const snapshot = createExtraClassSnapshot();
  const before = JSON.stringify(snapshot);
  assert.equal(assertValidDiarioPdfAcademicSnapshot(snapshot), snapshot);
  assert.equal(snapshot.gradesMap[IDS.student].frequencia_percent, 75);
  assert.equal(snapshot.gradesMap[EXTRA_IDS.excludedStudent].frequencia_percent, 50);
  assert.equal(snapshot.aulas.length, 1);
  assert.equal(snapshot.aulas[0].sessoes.length, 2);
  assert.equal(snapshot.gradesMap[IDS.student].total_aulas, 2);
  assert.equal(snapshot.gradesMap[IDS.student].total_faltas, 1);
  assert.equal(JSON.stringify(snapshot), before);

  const fabricatedPresence = globalThis.structuredClone(snapshot);
  fabricatedPresence.attendanceMap[IDS.student][EXTRA_IDS.activity] = 'P';
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(fabricatedPresence), /attendanceMap/u);
  const staleResult = globalThis.structuredClone(snapshot);
  staleResult.gradesMap[IDS.student].frequencia_percent = 50;
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(staleResult), /frequência congelada/u);
  const unearnedCredit = globalThis.structuredClone(snapshot);
  unearnedCredit.gradesMap[EXTRA_IDS.excludedStudent].frequencia_percent = 75;
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(unearnedCredit), /frequência congelada/u);
});

Deno.test('snapshot anterior sem extensão mantém fórmula, chaves e fechamento originais', () => {
  const legacy = createSnapshot();
  const before = JSON.stringify(legacy);
  assert.equal(assertValidDiarioPdfAcademicSnapshot(legacy), legacy);
  assert.equal(JSON.stringify(legacy), before);
  const empty = globalThis.structuredClone(legacy);
  empty.extraClassCredit = {
    schemaVersion: 1, activities: [], eligibleActivityIdsByStudent: { [IDS.student]: [] },
  };
  assert.equal(assertValidDiarioPdfAcademicSnapshot(empty), empty);
  const removedEvidence = createExtraClassSnapshot();
  delete removedEvidence.extraClassCredit;
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(removedEvidence), /frequência congelada/u);
});

Deno.test('extensão rejeita mapa sem aluno, atividade desconhecida ou crédito duplicado', () => {
  for (const mutate of [
    (credit: any) => { delete credit.eligibleActivityIdsByStudent[IDS.student]; },
    (credit: any) => { credit.eligibleActivityIdsByStudent[EXTRA_IDS.afternoon] = []; },
    (credit: any) => { credit.eligibleActivityIdsByStudent[IDS.student] = [IDS.lesson]; },
    (credit: any) => { credit.eligibleActivityIdsByStudent[IDS.student].push(EXTRA_IDS.activity); },
    (credit: any) => { credit.activities.push({ ...credit.activities[0] }); },
    (credit: any) => { credit.activities[0].cargaHoraria = 0; },
    (credit: any) => { credit.activities[0].dataSource = '2026-02-30'; },
    (credit: any) => { credit.schemaVersion = 2; },
    (credit: any) => { credit.activities[0].status = 'PUBLICADA'; },
    (credit: any) => { credit.eligibleActivityIdsByStudent[IDS.student] = 'P'; },
  ]) {
    const snapshot = createExtraClassSnapshot();
    mutate(snapshot.extraClassCredit);
    assert.throws(() => assertValidDiarioPdfAcademicSnapshot(snapshot), /extraClassCredit/u);
  }
});

Deno.test('datas congeladas respeitam Maceió e ordem canônica sem usar o dia da consulta', () => {
  const snapshot = createExtraClassSnapshot();
  snapshot.generatedAt = snapshot.closure.snapshotAt = '2026-08-20T01:00:00Z';
  assertValidDiarioPdfAcademicSnapshot(snapshot);
  snapshot.extraClassCredit!.activities[0].dataSource = '2026-08-20';
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(snapshot), /atividade futura/u);
  assert.throws(() => assertExtraClassCredit({
    schemaVersion: 1,
    activities: [
      { id: EXTRA_IDS.activity, titulo: 'B', cargaHoraria: 4, dataSource: '2026-08-20' },
      { id: EXTRA_IDS.afternoon, titulo: 'A', cargaHoraria: 4, dataSource: '2026-08-19' },
    ], eligibleActivityIdsByStudent: {},
  }), /ordem canônica/u);
});

Deno.test('fechamento soma extras globais mas preserva mínimo de uma aula na assinatura', () => {
  const snapshot = createExtraClassSnapshot();
  snapshot.closure.hoursCompleted = 8;
  snapshot.closure.requiredHours = snapshot.disciplina.cargaHoraria = 8;
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(snapshot), /closure.hoursCompleted/u);
  const onlyExtra = createExtraClassSnapshot();
  onlyExtra.aulas = [];
  assert.throws(() => assertValidDiarioPdfAcademicSnapshot(onlyExtra), /aulas/u);
});

Deno.test('fronteira Edge verifica e congela a evidência extra no mesmo hash do documento', async () => {
  const snapshot = createExtraClassSnapshot();
  const proof = await createSnapshotIntegrity(snapshot);
  const frozen = await verifyFrozenDocumentSnapshot(proof, proof.documentSnapshotSha256);
  assert.deepEqual(frozen.extraClassCredit, snapshot.extraClassCredit);
  assert.ok(Object.isFrozen(frozen.extraClassCredit));
  assert.ok(Object.isFrozen(frozen.extraClassCredit!.eligibleActivityIdsByStudent[IDS.student]));
  const changedProof = { ...proof, canonicalJson: proof.canonicalJson.replace('domiciliar sintética', 'adulterada') };
  await assert.rejects(
    verifyFrozenDocumentSnapshot(changedProof, proof.documentSnapshotSha256), /conteúdo canônico.*alterado/iu,
  );
});

Deno.test('origem e cronologia incluem todas as aulas e extras sem duplicar sessões do mesmo encontro', () => {
  const snapshot = createLinkedExtraClassSnapshot();
  assert.equal(assertValidDiarioPdfAcademicSnapshot(snapshot), snapshot);
  for (const mutate of [
    (credit: any) => { credit.activities[0].aulaOrigemId = EXTRA_IDS.activity; },
    (credit: any) => { credit.contentOrder.pop(); },
    (credit: any) => { credit.contentOrder.reverse(); },
    (credit: any) => { credit.contentOrder[0].id = EXTRA_IDS.activity; },
    (credit: any) => { credit.contentOrder.push({ tipo: 'AULA', id: EXTRA_IDS.afternoon }); },
    (credit: any) => { credit.contentOrder[1].tipo = 'OUTRA'; },
  ]) {
    const changed = globalThis.structuredClone(snapshot);
    mutate(changed.extraClassCredit);
    assert.throws(() => assertValidDiarioPdfAcademicSnapshot(changed), /extraClassCredit/u);
  }
});
