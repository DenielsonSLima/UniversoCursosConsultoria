import assert from 'node:assert/strict';
import { test } from 'node:test';
import basic from '../../content/ead/matematica-basica/index.mjs';
import enem from '../../content/ead/matematica-enem/index.mjs';
import { validateRevision, buildCourseConfig } from './revision-model.mjs';

test('conteúdo e avaliações têm fontes, habilidades, IDs novos e cobertura de todas as aulas', () => {
  for (const revision of [basic, enem]) {
    validateRevision(revision);
    const config = buildCourseConfig({ certificacao: { emitirAutomatico: true } }, revision, { includeAnswers: false });
    assert.equal(config.cronograma.reduce((sum, item) => sum + item.cargaHoraria, 0), revision.hours);
    assert.deepEqual(config.pagina.objetivos, revision.objectives);
    assert.equal(config.regras.exigirVideosConcluidos, false);
    assert.equal(config.videoUrl, '');
    assert.equal(config.certificacao.emitirAutomatico, true);
  }
});

test('as fontes sustentam cada questão sem gabaritos na fonte pública', () => {
  for (const revision of [basic, enem]) {
    for (const item of [...revision.activities, ...revision.exam]) {
      const lesson = revision.lessons.find(lesson => lesson.id === item.lessonId);
      assert.ok(item.sourceIds.length > 0, item.id);
      assert.ok(item.sourceIds.every(source => lesson.sourceIds.includes(source)), item.id);
    }
    for (const item of [...revision.activities, ...revision.exam]) {
      assert.equal('correctIndex' in item, false);
      assert.equal('explanation' in item, false);
    }
  }
});

test('o gerador rejeita ausência de cobertura e uso de IDs antigos', () => {
  const emptyActivity = structuredClone(basic);
  emptyActivity.activities = emptyActivity.activities.slice(1);
  assert.throws(() => validateRevision(emptyActivity), /atividades por aula/);
  const badId = structuredClone(basic);
  badId.exam[0].id = 'q-1';
  assert.throws(() => validateRevision(badId), /IDs devem ser novos/);
});
