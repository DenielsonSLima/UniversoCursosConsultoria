import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ValidationResultContent from './ValidationResultContent';
import { mapCanonicalValidationRecord } from './validator.mapper';

const selectedFields = [
  'studentName', 'studentCpf', 'studentBirthDate', 'maskedMotherName',
  'maskedEnrollmentNumber', 'courseName', 'className', 'enrollmentStatus',
  'enrollmentDate', 'institutionName', 'institutionCnpj', 'unitName',
  'issuedAt', 'issueCount',
];

const recordFor = (type: string) => ({
  type,
  code: 'TEST-0001',
  status: 'ACTIVE',
  schemaVersion: 2,
  visibleFields: selectedFields,
  studentName: 'Maria Oliveira Santos',
  studentCpf: '12345678901',
  studentBirthDate: '2000-02-03',
  maskedMotherName: 'Ana Souza',
  maskedEnrollmentNumber: '2026000123',
  courseName: 'Técnico em Administração',
  className: 'Turma de validação',
  enrollmentStatus: 'ATIVO',
  enrollmentDate: '2026-03-12',
  institutionName: 'Instituição de teste',
  institutionCnpj: '00.000.000/0001-00',
  unitName: 'Unidade de teste',
  issuedAt: '2026-09-26',
  issueCount: 1,
});

const renderRecord = (record: Record<string, unknown>) => {
  const result = mapCanonicalValidationRecord(record, 'TEST-0001');
  assert.ok(result);
  return renderToStaticMarkup(<ValidationResultContent result={result} />);
};

for (const type of ['pasta_identificacao', 'ficha_matricula', 'carteirinha']) {
  test(`${type}: perfil configurado aparece com dados pessoais mascarados`, () => {
    const html = renderRecord(recordFor(type));
    for (const expected of [
      'Maria O***', '***.***.***-01', '**/**/2000', 'Ana S***',
      '2026****23', 'Técnico em Administração', 'Turma de validação',
      'ATIVO', '12/03/2026', 'Instituição de teste', '00.000.000/0001-00',
      'Unidade de teste', '26/09/2026',
    ]) assert.ok(html.includes(expected), `Campo ausente: ${expected}`);
    for (const privateValue of [
      'Maria Oliveira Santos', '12345678901', '2000-02-03',
      'Ana Souza', '2026000123',
    ]) assert.ok(!html.includes(privateValue), `Dado sem máscara: ${privateValue}`);
  });

  test(`${type}: quantidade habilitada aparece também na primeira emissão`, () => {
    const html = renderRecord(recordFor(type));
    assert.match(html, /Emissões registradas: <strong[^>]*>1<\/strong>/);
  });

  test(`${type}: campos desabilitados não aparecem mesmo presentes no payload`, () => {
    const html = renderRecord({
      ...recordFor(type),
      visibleFields: ['institutionName', 'issuedAt'],
    });
    for (const hidden of [
      'Maria', 'CPF:', 'Nascimento:', 'Mãe:', 'Matrícula:',
      'Técnico em Administração', 'Turma de validação', 'ATIVO',
      '12/03/2026', '00.000.000/0001-00', 'Unidade de teste',
      'Emissões registradas:',
    ]) assert.ok(!html.includes(hidden), `Campo desabilitado visível: ${hidden}`);
    assert.ok(html.includes('Instituição de teste'));
    assert.ok(html.includes('26/09/2026'));
  });

  test(`${type}: resposta legada sem perfil continua restrita aos obrigatórios`, () => {
    const record: Record<string, unknown> = recordFor(type);
    delete record.schemaVersion;
    delete record.visibleFields;
    const html = renderRecord(record);
    assert.ok(!html.includes('Maria'));
    assert.ok(!html.includes('Técnico em Administração'));
    assert.ok(html.includes('Instituição de teste'));
    assert.ok(html.includes('26/09/2026'));
  });
}
