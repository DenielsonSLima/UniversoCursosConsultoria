import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { adaptPastaTemplateForStudentPhoto } from './pasta-template-geometry.ts';

const makeTemplate = () => ({
  pageCount: 1,
  absoluteFields: [
    { id: 'student_photo', type: 'image', x: 76, y: 350, width: 100.5, height: 134 },
    {
      id: 'pasta_identificacao', type: 'text', x: 186.5, y: 350, width: 531.5,
      height: 134, value: '<section>Nome e filiação</section>', style: { color: '#0f172a' },
    },
    { id: 'pasta_documentos', type: 'text', x: 76, y: 680, width: 642, height: 92 },
  ],
});

test('sem foto a identificação ocupa a largura do bloco sem alterar snapshot ou outras seções', () => {
  for (const photoUrl of [null, undefined, '', '  ', '/sem-foto-aluno.svg', 'https://example.test/sem-foto-aluno.svg?v=2']) {
    const template = makeTemplate();
    const original = globalThis.structuredClone(template);
    const adapted = adaptPastaTemplateForStudentPhoto(template, photoUrl);
    assert.deepEqual(template, original);
    assert.equal(adapted.absoluteFields.length, 2);
    assert.deepEqual(adapted.absoluteFields[0], { ...template.absoluteFields[1], x: 76, width: 642 });
    assert.equal(adapted.absoluteFields[1], template.absoluteFields[2]);
    assert.equal(adapted.pageCount, 1);
  }
});

test('com foto ou no editor de modelo o layout permanece exatamente igual', () => {
  const template = makeTemplate();
  for (const photoUrl of ['https://example.test/aluno.jpg', 'data:image/png;base64,AAAA', '{{ALUNO_FOTO_URL}}']) {
    assert.equal(adaptPastaTemplateForStudentPhoto(template, photoUrl), template);
  }
});

test('expansão deriva as dimensões personalizadas e é idempotente', () => {
  const template = makeTemplate();
  Object.assign(template.absoluteFields[0], { x: 90, y: 320, width: 70, height: 120 });
  Object.assign(template.absoluteFields[1], { x: 170, y: 320, width: 510, height: 120 });
  const adapted = adaptPastaTemplateForStudentPhoto(template, null);
  assert.deepEqual(adapted.absoluteFields[0], { ...template.absoluteFields[1], x: 90, width: 590 });
  assert.equal(adaptPastaTemplateForStudentPhoto(adapted, null), adapted);
});

test('layouts verticais, invertidos ou sobrepostos não deslocam a identificação', () => {
  for (const photoGeometry of [{ y: 200 }, { x: 720 }, { x: 160 }, { height: 100 }]) {
    const template = makeTemplate();
    Object.assign(template.absoluteFields[0], photoGeometry);
    const adapted = adaptPastaTemplateForStudentPhoto(template, null);
    assert.equal(adapted.absoluteFields.length, 2);
    assert.equal(adapted.absoluteFields[0], template.absoluteFields[1]);
  }
});

test('ficha de matrícula e outras imagens não recebem adaptação da pasta', () => {
  const template = makeTemplate();
  template.absoluteFields[1].id = 'ficha_identificacao';
  assert.equal(adaptPastaTemplateForStudentPhoto(template, null), template);
});

test('prévia real e recursos de emissão passam pelo mesmo adaptador, após cache e substituição', async () => {
  const [service, canvas] = await Promise.all([
    readFile(new URL('../../secretaria/historico-emissoes/historico-emissoes.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../modelos-documentos/declaracao/components/DeclaracaoEditorCanvas.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(service, /template: emission\.documento === 'pasta_identificacao'\s*\? adaptPastaTemplateForStudentPhoto\(template, snapshotFirst\(/);
  assert.match(service, /'studentPhotoUrl', emission\.aluno\?\.foto_url/);
  assert.match(canvas, /renderedFields = readOnly\s*\? adaptPastaTemplateForStudentPhoto\(/);
  assert.match(canvas, /studentPhotoUrl === failedStudentPhoto \? null : studentPhotoUrl/);
  assert.match(canvas, /\{renderedFields\s*\.filter/);
});
