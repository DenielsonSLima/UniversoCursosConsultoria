import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canStartEadRevision, getEffectiveEadConfig, getAvailableRevisionLessons } from './eadAssessmentRevision.ts';

const state = () => ({
  progress: {}, summary: { quizPassed: false },
  effectiveEadConfig: { conteudos: [{ id: 'old-lesson' }] },
  assessmentRevision: { current: 'old', available: 'new', canUpgrade: true, isHistorical: true },
}) as any;

test('a configuração histórica prevalece sobre o catálogo e falha fechada se ausente', () => {
  const catalog = { conteudos: [{ id: 'new-lesson' }] };
  assert.equal(getEffectiveEadConfig(catalog, state()).conteudos[0].id, 'old-lesson');
  assert.equal(getEffectiveEadConfig(catalog, { ...state(), effectiveEadConfig: undefined }), null);
  assert.equal(getEffectiveEadConfig(catalog, undefined), catalog);
  assert.deepEqual(getAvailableRevisionLessons(catalog, state().assessmentRevision), []);
  assert.deepEqual(getAvailableRevisionLessons({ ...catalog, assessmentRevision: 'new' }, state().assessmentRevision), catalog.conteudos);
});

test('a troca exige revisão diferente e não altera aprovados ou certificados', () => {
  assert.equal(canStartEadRevision(state()), true);
  for (const progress of [{ completedAt: 123 }, { certificateId: 'certificate' }]) {
    assert.equal(canStartEadRevision({ ...state(), progress }), false);
  }
  assert.equal(canStartEadRevision({ ...state(), summary: { quizPassed: true } }), false);
  for (const patch of [{ available: 'old' }, { available: null }, { canUpgrade: false }]) {
    assert.equal(canStartEadRevision({ ...state(), assessmentRevision: { ...state().assessmentRevision, ...patch } }), false);
  }
});
