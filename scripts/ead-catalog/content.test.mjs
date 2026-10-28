import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadRevisions } from './load-revisions.mjs';
import { validateRevision, buildCourseConfig, withPrivateAnswers } from './revision-model.mjs';
import { courseScope } from './course-scope.mjs';
import { alignmentPatches } from './alignment-patches.mjs';

const releases = await loadRevisions();
const keyring = process.env.EAD_CATALOG_PRIVATE_ANSWERS
  ? JSON.parse(readFileSync(process.env.EAD_CATALOG_PRIVATE_ANSWERS, 'utf8')) : null;
const forbidden = /qual atitude demonstra postura ética no curso|por que o planejamento é importante\?|o que caracteriza uma avaliação formativa\?|qual prática melhora a segurança\?|como lidar com informações pessoais\?|o que favorece aprendizagem autônoma\?|qual é a melhor conduta\?/i;

test('o manifesto cobre exatamente os 61 cursos solicitados e preserva os três aprovados', () => {
  const covered = [...releases.map(item => item.revision), ...alignmentPatches];
  assert.equal(covered.length, 61);
  assert.equal(new Set(covered.map(item => item.courseId)).size, 61);
  for (const course of courseScope) {
    const entry = covered.find(item => item.courseId === course.id);
    assert.equal(entry?.courseName, course.name, course.name);
    assert.equal(entry?.hours, course.hours, course.name);
  }
});

test('cada revisão pública tem cobertura, fontes, prática e IDs próprios sem respostas', () => {
  assert.ok(releases.length > 0);
  assert.equal(new Set(releases.map(({ revision }) => revision.courseId)).size, releases.length);
  const allIds = [];
  for (const { revision } of releases) {
    validateRevision(revision);
    allIds.push(...[...revision.lessons, ...revision.activities, ...revision.exam].map(item => item.id));
    for (const lesson of revision.lessons) {
      assert.match(lesson.html, /caso|exemplo/i, lesson.id);
      assert.match(lesson.html, /prática|treino|exercício/i, lesson.id);
      assert.equal(lesson.html.includes('O primeiro ponto de estudo é reconhecer os conceitos essenciais do tema'), false);
    }
    for (const item of [...revision.activities, ...revision.exam]) {
      assert.equal(forbidden.test(item.prompt), false, item.id);
      const lesson = revision.lessons.find(lesson => lesson.id === item.lessonId);
      assert.ok(item.sourceIds.every(id => lesson.sourceIds.includes(id)), item.id);
      assert.equal('respostaCorreta' in item || 'explicacao' in item, false);
    }
    const config = buildCourseConfig({ certificacao: { emitirAutomatico: true },
      provas: [{ notaMinima: 80, intervaloReprovacaoHoras: 1 }] }, revision, { includeAnswers: false });
    assert.equal(config.assessmentRevision, revision.revisionId);
    assert.equal(config.provas[0].notaMinima, 80);
    assert.equal(config.provas[0].intervaloReprovacaoHoras, 1);
    assert.equal(config.certificacao.emitirAutomatico, true);
    assert.equal(config.cronograma.reduce((sum, item) => sum + item.cargaHoraria, 0), revision.hours);
    assert.equal(JSON.stringify(config).includes('respostaCorreta'), false);
    if (keyring) withPrivateAnswers(revision, keyring);
  }
  assert.equal(new Set(allIds).size, allIds.length);
});
