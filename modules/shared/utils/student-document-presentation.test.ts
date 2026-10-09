import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareStudentIdentityTemplate, resolveSnapshotStudentIdentity } from './student-document-presentation';
import DOMPurify from 'dompurify';
// Node não possui DOM; estes testes exercitam só escape de texto, não sanitização HTML.
if (!DOMPurify.addHook) DOMPurify.addHook = () => {};
const { parseEmissionTemplate } = await import('../../gestor/secretaria/historico-emissoes/template-parser');
import { buildDocumentVariableReplacer } from '../secretaria/document-template.helpers';
import { replaceVarsPlain } from '../../gestor/secretaria/certificados/components/certificado-preview.utils';
const { replaceStudentPreviewTokens } = await import('../../gestor/cadastros/modelos-documentos/declaracao/components/declaracao-editor.preview');

const declaration = '<p>portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, matriculado(a).</p>';
const cpf = '00000000000';
const identity = { tipo_documento: 'CIN', cpf_cnpj: cpf, rg: 'RESÍDUO' };

test('declaração real remove somente cláusula de identidade redundante do aluno', () => {
  assert.equal(prepareStudentIdentityTemplate(declaration, true), '<p>portador(a) do CIN nº <b>{{ALUNO_CPF}}</b>, matriculado(a).</p>');
  assert.equal(prepareStudentIdentityTemplate(declaration, false), declaration);
});

test('certificado CPF-only usa CIN e preserva número; responsável e IRPF preservam CPF', () => {
  const certificate = 'CPF {{cpf}}; responsável CPF {{RESPONSAVEL_CPF}}';
  assert.equal(prepareStudentIdentityTemplate(certificate, true), 'CIN {{cpf}}; responsável CPF {{RESPONSAVEL_CPF}}');
  assert.equal(prepareStudentIdentityTemplate(declaration, true, true), declaration);
  const fiscal = 'CPF {{ALUNO_CPF}} / ano {{ANO_CALENDARIO}} / {{VALOR_TOTAL}}';
  assert.equal(prepareStudentIdentityTemplate(fiscal, true), fiscal);
  assert.equal(replaceVarsPlain('CPF {{cpf}}', { aluno: identity } as any), `CIN ${cpf}`);
});

test('snapshot explícito domina cadastro vivo e tipo legado não se torna CIN', () => {
  for (const type of ['RG (ANTIGO)', 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', '']) {
    const resolved = resolveSnapshotStudentIdentity({ studentDocumentType: type, studentRg: 'RG_CONGELADO' }, identity);
    assert.equal(resolved.isCin, false);
  }
  const resolved = resolveSnapshotStudentIdentity({ studentDocumentType: 'CIN', studentCpf: cpf, studentRg: 'RESÍDUO' }, { cpf_cnpj: '11111111111' });
  assert.equal(resolved.number, cpf);
});

test('shared replacer e editor adaptam narrativa antes dos tokens, sem duplicação', () => {
  const context = { aluno: identity, enrollment: {}, polo: {}, formattedEnrollment: '', template: {}, selectedYear: 2026, irpfPayments: [] };
  const rendered = buildDocumentVariableReplacer(context)(declaration);
  assert.equal(rendered.split('000.000.000-00').length - 1, 1);
  assert.doesNotMatch(rendered, /CPF|RESÍDUO/);
  assert.match(buildDocumentVariableReplacer({ ...context, documentType: 'declaracao_irpf' })('CPF {{ALUNO_CPF}}'), /^CPF /);
  const editor = replaceStudentPreviewTokens(declaration, true, { enrollmentId: 'fixture', label: '', replacements: {
    '{{ALUNO_DOCUMENTO_TIPO}}': 'CIN - Carteira de Identidade Nacional', '{{ALUNO_CPF}}': cpf, '{{ALUNO_RG}}': cpf,
  } });
  assert.equal(editor.split(cpf).length - 1, 1);
  assert.doesNotMatch(editor, /CPF/);
});


test('parser histórico respeita tipo snapshot e não adapta declaração fiscal', () => {
  const emission = { documento: 'declaracao_matricula', emitido_em: '2026-09-28T12:00:00Z', dados_emissao: { studentDocumentType: 'CIN', studentCpf: cpf, studentRg: 'RESÍDUO' }, aluno: { tipo_documento: 'RG (ANTIGO)', cpf_cnpj: '11111111111' } } as any;
  const context = { academicData: null, poloInfo: {}, templateConfig: {} };
  const result = parseEmissionTemplate(declaration, emission, context);
  assert.equal(result.split('000.000.000-00').length - 1, 1);
  assert.doesNotMatch(result, /CPF|RESÍDUO/);
  const fiscal = parseEmissionTemplate('CPF {{ALUNO_CPF}}', { ...emission, documento: 'declaracao_irpf' }, context);
  assert.match(fiscal, /CPF/);
});


for (const frozenCpf of ['', null]) {
  test(`CPF congelado ${frozenCpf === null ? 'nulo' : 'vazio'} não usa cadastro vivo em CIN`, async () => {
    const snapshot = { studentDocumentType: 'CIN', studentCpf: frozenCpf, studentRg: 'RESÍDUO' };
    const emission = { documento: 'boletim', emitido_em: '2026-09-28T12:00:00Z', dados_emissao: snapshot, aluno: { tipo_documento: 'CIN', cpf_cnpj: '11111111111' } } as any;
    const context = { academicData: null, poloInfo: {}, templateConfig: {} };
    for (const token of ['{{ALUNO_CPF}}', '{{cpf}}']) {
      const parsed = parseEmissionTemplate(`CPF ${token}`, emission, context);
      assert.match(parsed, /CIN/);
      assert.doesNotMatch(parsed, /111\.111\.111-11|11111111111|RESÍDUO/);
    }
    const { resolveAcademicSnapshotTemplate, resolveRegistrationSnapshotTemplate } = await import('../../gestor/secretaria/historico-emissoes/emission-registration-snapshot');
    const preview = { polo: {}, template: {}, academicData: null } as any;
    const academic = resolveAcademicSnapshotTemplate({ emission, preview }, 'CPF {{ALUNO_CPF}}');
    const registration = resolveRegistrationSnapshotTemplate('CPF {{ALUNO_CPF}}', emission, preview);
    for (const text of [academic, registration]) {
      assert.match(text, /CIN/);
      assert.doesNotMatch(text, /111\.111\.111-11|11111111111|RESÍDUO/);
    }
  });
}

