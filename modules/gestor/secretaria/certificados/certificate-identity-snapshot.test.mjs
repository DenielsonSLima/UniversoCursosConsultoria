import assert from 'node:assert/strict';
import test from 'node:test';
import { withCertificateEmissionSnapshot } from './certificate-identity-snapshot.ts';

const certificate = () => ({ modalidade: 'EAD', aluno: { tipo_documento: 'CIN', cpf_cnpj: '99999999999' },
  metadados: { studentDocumentType: 'CIN', studentCpf: '99999999999', studentRg: 'posterior',
    studentRgIssuer: 'novo', studentRgState: 'SE', studentRgIssueDate: '2026-10-01',
    eadCurriculum: { version: 1 }, eadCurriculumTable: { version: 2 }, programContent: 'Grade original',
    eadStudyPeriod: { startedOn: '2026-09-20', completedOn: '2026-10-02', source: 'VERIFIED_STUDY_ACTIVITY' } } });

test('segunda via usa apenas identidade congelada e mantém grade, tabela e objeto original', () => {
  const original = certificate();
  const before = structuredClone(original);
  const snapshot = { studentDocumentType: 'RG (ANTIGO)', studentCpf: '12345678901',
    studentRg: '98.765.432-X', studentRgIssuer: 'SSP', studentRgState: 'SP', studentRgIssueDate: '2020-01-02',
    eadStudyPeriod: { startedOn: '2026-09-18', completedOn: '2026-10-02', source: 'DOCUMENTARY_CORRECTION' } };
  const result = withCertificateEmissionSnapshot(original, snapshot);
  assert.deepEqual(result.metadados, { ...original.metadados, ...snapshot });
  assert.deepEqual(original, before);
  assert.equal(result.aluno, original.aluno);
});

test('snapshot legado ausente remove identidade posterior do certificado e preserva NULL explícito', () => {
  const original = certificate();
  const result = withCertificateEmissionSnapshot(original, { studentDocumentType: null, studentCpf: null });
  assert.equal(result.metadados.studentDocumentType, null);
  assert.equal(result.metadados.studentCpf, null);
  assert.ok(!Object.hasOwn(result.metadados, 'studentRg'));
  assert.ok(!Object.hasOwn(result.metadados, 'eadStudyPeriod'));
  assert.ok(!Object.hasOwn(result.metadados, 'studentRgIssuer'));
  assert.deepEqual(result.metadados.eadCurriculum, original.metadados.eadCurriculum);
  const missing = withCertificateEmissionSnapshot(original, null);
  assert.ok(!Object.hasOwn(missing.metadados, 'studentDocumentType'));
  assert.ok(!Object.hasOwn(missing.metadados, 'studentCpf'));
});

test('não modifica certificado técnico ou demais modalidades', () => {
  for (const modalidade of ['TECNICO', 'LIVRE', 'ESPECIALIZACAO']) {
    const original = { ...certificate(), modalidade };
    assert.equal(withCertificateEmissionSnapshot(original, { studentDocumentType: 'RG' }), original);
  }
});
