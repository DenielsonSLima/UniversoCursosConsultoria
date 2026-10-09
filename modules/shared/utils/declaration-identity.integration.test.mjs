import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../declaration-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');

const result = await build({
  stdin: {
    contents: `
      export { renderDeclarationIdentity } from './declaration-identity-presentation.ts';
      export { resolveStudentIdentityDocument } from './studentIdentityDocument.ts';
      export { parseDeclaracaoTemplate } from '../../gestor/secretaria/declaracao-matricula/declaracao-matricula.helpers.ts';
      export { parseEmissionTemplate } from '../../gestor/secretaria/historico-emissoes/template-parser.ts';
      export { buildDocumentVariableReplacer } from '../secretaria/document-template.helpers.ts';
    `,
    resolveDir: fileURLToPath(new URL('.', import.meta.url)),
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'browser-and-io-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /^dompurify$/ }, () => ({ path: 'dompurify', namespace: 'boundaries' }));
    plugin.onResolve({ filter: /academicos\.service$/ }, () => ({ path: 'academic', namespace: 'boundaries' }));
    plugin.onLoad({ filter: /.*/, namespace: 'boundaries' }, ({ path }) => ({ contents: path === 'dompurify'
      ? 'export default {addHook(){},sanitize(){throw Error("HTML sanitation is not a parser dependency")}};'
      : 'export const DEFAULT_CONFIGS={}; export const academicosService={getConfigsSync(){throw Error("Unexpected config IO")}};',
    }));
  } }],
});
const {
  renderDeclarationIdentity, resolveStudentIdentityDocument, parseDeclaracaoTemplate,
  parseEmissionTemplate, buildDocumentVariableReplacer,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const template = '<p>Aluno <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº <b>{{ALUNO_CPF}}</b>, <b>{{ALUNO_DOCUMENTO_TIPO}}</b> nº <b>{{ALUNO_RG}}</b>, regularmente matriculado(a).</p>';
const student = {
  id: 'SYNTHETIC-STUDENT', nome: 'ALUNO DE TESTE', cpf: '12345678909', cpf_cnpj: '12345678909',
  tipoDocumento: 'RG (ANTIGO)', tipo_documento: 'RG (ANTIGO)', rg: '1.234.567-X',
  orgaoEmissor: 'SSP', orgao_emissor: 'SSP', rgUfEmissao: 'SE', rg_uf_emissao: 'SE',
  rgDataEmissao: '2020-01-24', rg_data_emissao: '2020-01-24',
};
const history = (aluno, snapshot = {}, documentType = 'declaracao_matricula') => ({
  documento: documentType, emitido_em: '2026-10-09T12:00:00Z', dados_emissao: {
    studentName: aluno.nome, studentCpf: aluno.cpf, studentMatricula: 'TESTE-123', ...snapshot,
  }, aluno,
});
const context = { academicData: null, poloInfo: {}, templateConfig: {} };
const renderAll = (source, aluno = student, snapshot = {}, documentType = 'declaracao_matricula') => [
  parseDeclaracaoTemplate(source, aluno, { frequenciesByStudent: {} }),
  parseEmissionTemplate(source, history(aluno, snapshot, documentType), context),
  buildDocumentVariableReplacer({ documentType, aluno, enrollment: {}, polo: {},
    formattedEnrollment: 'TESTE-123', template: {}, selectedYear: 2026, irpfPayments: [],
  })(source),
];

for (const documentType of ['declaracao_matricula', 'declaracao_frequencia']) {
  test(`${documentType}: initial, second copy and student render the same formatted legacy identity`, () => {
    const rendered = renderAll(template, student, {}, documentType);
    assert.equal(new Set(rendered).size, 1);
    assert.match(rendered[0], /CPF nº <b>123\.456\.789-09<\/b>/);
    assert.match(rendered[0], /RG - Registro Geral<\/b> nº <b>1\.234\.567-X/);
    assert.doesNotMatch(rendered[0], /Não informado|CIN|\{\{/);
  });
}

test('explicit CIN/CNI use formatted unified number once, preserving bold and surrounding prose', () => {
  for (const type of ['CIN', 'CNI', 'CARTEIRA DE IDENTIDADE NACIONAL']) {
    for (const actual of renderAll(template, { ...student, tipoDocumento: type, tipo_documento: type })) {
      assert.equal(actual, '<p>Aluno <b>ALUNO DE TESTE</b>, portador(a) do CIN nº <b>123.456.789-09</b>, regularmente matriculado(a).</p>');
      assert.doesNotMatch(actual, /1\.234\.567-X|CPF/);
    }
  }
});

test('unknown legacy type without RG shows only CPF, never presumes CIN or inserts placeholders', () => {
  const aluno = { ...student, tipoDocumento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    tipo_documento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', rg: '' };
  for (const actual of renderAll(template, aluno)) {
    assert.equal(actual, '<p>Aluno <b>ALUNO DE TESTE</b>, portador(a) do CPF nº <b>123.456.789-09</b>, regularmente matriculado(a).</p>');
  }
});

test('missing type never reuses residual RG and missing identity removes the entire clause', () => {
  for (const actual of renderAll(template, { ...student, tipoDocumento: '', tipo_documento: '', cpf: '', cpf_cnpj: '' })) {
    assert.equal(actual, '<p>Aluno <b>ALUNO DE TESTE</b>, regularmente matriculado(a).</p>');
  }
});

test('formatted literal labels are omitted with missing numbers and adapt to explicit CIN', () => {
  const styled = '<p>{{ALUNO_NOME}}, <b>RG</b> nº <strong>{{ALUNO_RG}}</strong>, <strong>CPF</strong> nº {{ALUNO_CPF}}, matriculado.</p>';
  for (const actual of renderAll(styled, { ...student, tipoDocumento: '', tipo_documento: '', cpf: '', cpf_cnpj: '' })) {
    assert.equal(actual, '<p>ALUNO DE TESTE, matriculado.</p>');
  }
  for (const actual of renderAll('<strong>CPF</strong> nº {{ALUNO_CPF}}', { ...student, tipoDocumento: 'CIN', tipo_documento: 'CIN' })) {
    assert.equal(actual, '<strong>CIN</strong> nº 123.456.789-09');
  }
});

test('issuer/state/issue date flow through all parsers and optional fields are omitted', () => {
  const metadata = '{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}; {{ALUNO_RG_EMISSAO}}';
  for (const actual of renderAll(metadata)) assert.equal(actual, 'SSP / SE; 24/01/2020');
  const conditional = '{{#ALUNO_RG_ORGAO}}<p>Órgão: {{ALUNO_RG_ORGAO}}</p>{{/ALUNO_RG_ORGAO}}';
  for (const actual of renderAll(conditional)) assert.equal(actual, '<p>Órgão: SSP</p>');
  for (const actual of renderAll(conditional, { ...student, orgaoEmissor: '', orgao_emissor: '' })) assert.equal(actual, '');
  const missing = '{{ALUNO_NOME}}, órgão emissor {{ALUNO_RG_ORGAO}}, UF de emissão {{ALUNO_RG_UF}}, data de emissão {{ALUNO_RG_EMISSAO}}, matriculado.';
  const aluno = { ...student, orgaoEmissor: '', orgao_emissor: '', rgUfEmissao: '', rg_uf_emissao: '', rgDataEmissao: '', rg_data_emissao: '' };
  for (const actual of renderAll(missing, aluno)) assert.equal(actual, 'ALUNO DE TESTE, matriculado.');
  for (const actual of renderAll('{{ALUNO_NOME}}, órgão emissor {{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}}, matriculado.', aluno)) {
    assert.equal(actual, 'ALUNO DE TESTE, matriculado.');
  }
});

test('historical explicit empty/null snapshot is never replaced with current registration', () => {
  for (const value of ['', null]) {
    const snapshot = { studentDocumentType: value, studentRg: value, studentCpf: value,
      studentRgIssuer: value, studentRgState: value, studentRgIssueDate: value };
    const actual = parseEmissionTemplate(template, history(student, snapshot), context);
    assert.equal(actual, '<p>Aluno <b>ALUNO DE TESTE</b>, regularmente matriculado(a).</p>');
  }
  const actual = parseEmissionTemplate(template, history(student, { studentDocumentType: 'CIN', studentCpf: '98765432100' }), context);
  assert.match(actual, /CIN nº <b>987\.654\.321-00/);
  assert.doesNotMatch(actual, /123\.456\.789-09|1\.234\.567-X/);
});

test('saved markup, uncommon RG formatting and unknown document types remain intact and escaped', () => {
  const identity = resolveStudentIdentityDocument({ ...student, tipoDocumento: 'PASSAPORTE', rg: 'AB12345<&' });
  const actual = renderDeclarationIdentity('<span style="color:blue">{{ALUNO_DOCUMENTO_TIPO}}</span>: <strong>{{ALUNO_RG}}</strong>', identity, student.cpf);
  assert.equal(actual, '<span style="color:blue">PASSAPORTE</span>: <strong>AB12345&lt;&amp;</strong>');
});

test('fiscal CPF labels remain CPF for CIN holders', () => {
  const aluno = { ...student, tipoDocumento: 'CIN', tipo_documento: 'CIN' };
  const actual = parseEmissionTemplate('CPF {{ALUNO_CPF}}', history(aluno, {}, 'declaracao_irpf'), context);
  assert.equal(actual, 'CPF 123.456.789-09');
});
