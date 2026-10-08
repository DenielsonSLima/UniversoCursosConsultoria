import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-identity-test.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const bundled = await build({ stdin: { contents: "export * from './certificado-preview.utils.ts';",
  resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
bundle: true, platform: 'node', format: 'esm', write: false });
const { buildEadCertificateTemplateVars, prepareEadCertificateTemplate, replaceEadCertificateVars, replaceVarsPlain } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);

const makeCertificate = (aluno = {}, metadados = {}) => ({
  modalidade: 'EAD', data_conclusao: '2026-10-08', codigo_validacao: 'CERT-IDENTIDADE-TESTE',
  aluno: { nome: 'ALUNO SINTÉTICO', cpf_cnpj: '00123456789', rg: '00.123.456-X', ...aluno },
  curso: { nome: 'CURSO SINTÉTICO', carga_horaria: 120 }, metadados,
});
const render = (certificate, template, strong = false) => replaceEadCertificateVars(
  template, certificate, buildEadCertificateTemplateVars(certificate), strong,
);

test('explicit CIN and CNI use the CPF number and official CIN label, ignoring residual RG', () => {
  for (const tipo_documento of ['CIN', 'CNI', 'CARTEIRA DE IDENTIDADE NACIONAL', 'CARTEIRA NACIONAL DE IDENTIDADE']) {
    const certificate = makeCertificate({ tipo_documento });
    assert.equal(render(certificate, 'CPF: {{cpf}} / RG nº {{rg}}'), 'CIN: 001.234.567-89 / CIN nº 001.234.567-89');
    assert.equal(render(certificate, '{{documento_tipo}}: {{documento_numero}}'), 'CIN: 001.234.567-89');
  }
  assert.equal(buildEadCertificateTemplateVars(makeCertificate({ tipo_documento: 'CIN', cpf_cnpj: '001.234.567-89' })).cpf,
    '001.234.567-89');
});

test('RG, CNH and passport retain their registered number, letters and leading zeroes', () => {
  for (const [tipo_documento, rg, label] of [
    ['RG (ANTIGO)', '00.123.456-X', 'RG'],
    ['RG', '00123456789', 'RG'],
    ['CNH', '00123456789', 'CNH'],
    ['PASSAPORTE', 'AB0012345', 'PASSAPORTE'],
  ]) {
    const certificate = makeCertificate({ tipo_documento, rg });
    assert.equal(render(certificate, 'CPF: {{cpf}} / RG: {{rg}}'), `CPF: 001.234.567-89 / ${label}: ${rg}`);
    assert.equal(render(certificate, '{{documento_tipo}}: {{documento_numero}}'), `${label}: ${rg}`);
  }
});

test('eleven digits and an ambiguous or missing type never classify a document as CIN', () => {
  for (const tipo_documento of ['CARTEIRA NACIONAL DE IDENTIFICAÇÃO', '', null]) {
    const certificate = makeCertificate({ tipo_documento, rg: null });
    assert.equal(render(certificate, 'CPF: {{cpf}}'), 'CPF: 001.234.567-89');
    assert.equal(buildEadCertificateTemplateVars(certificate).rg, '________________');
  }
  const ambiguous = makeCertificate({ tipo_documento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO', rg: '00012345678' });
  assert.equal(buildEadCertificateTemplateVars(ambiguous).rg, '00012345678');
});

test('CPF formatting never truncates, strips letters, or fabricates missing digits', () => {
  for (const cpf_cnpj of ['001234567890', 'AB00123456789', '001234', '00123456789/7', '', null]) {
    const values = buildEadCertificateTemplateVars(makeCertificate({ tipo_documento: 'CIN', cpf_cnpj }));
    assert.equal(values.cpf, cpf_cnpj ?? '');
    assert.equal(values.rg, cpf_cnpj || '________________');
  }
});

test('identity frozen at issuance takes precedence over a subsequently changed registration', () => {
  const certificate = makeCertificate({ tipo_documento: 'RG', cpf_cnpj: '99999999999', rg: 'NOVA-IDENTIDADE' }, {
    studentDocumentType: 'CIN', studentCpf: '00123456789', studentRg: 'RESÍDUO',
  });
  assert.equal(render(certificate, 'CPF: {{cpf}} / {{documento_tipo}} {{documento_numero}}'),
    'CIN: 001.234.567-89 / CIN 001.234.567-89');
  const rgAtIssuance = makeCertificate({ tipo_documento: 'CIN' }, {
    studentDocumentType: 'RG', studentCpf: '00123456789', studentRg: '00.123.456-X',
  });
  assert.equal(render(rgAtIssuance, 'CPF: {{cpf}} / RG: {{rg}}'), 'CPF: 001.234.567-89 / RG: 00.123.456-X');
});

test('explicit null and empty snapshot fields never recover identity from the live registration', () => {
  for (const studentCpf of [null, '']) {
    const certificate = makeCertificate({ tipo_documento: 'CIN' }, { studentDocumentType: 'CIN', studentCpf });
    assert.equal(buildEadCertificateTemplateVars(certificate).cpf, '');
    assert.equal(buildEadCertificateTemplateVars(certificate).rg, '________________');
  }
  for (const studentDocumentType of [null, '']) {
    const certificate = makeCertificate({ tipo_documento: 'CIN' }, { studentDocumentType });
    assert.equal(render(certificate, 'CPF: {{cpf}}'), 'CPF: 001.234.567-89');
    assert.equal(buildEadCertificateTemplateVars(certificate).documento_tipo, '');
  }
  const noRg = makeCertificate({ tipo_documento: 'RG' }, { studentRg: null });
  assert.equal(buildEadCertificateTemplateVars(noRg).rg, '________________');
});

test('labels preserve model colon, number sign, bold spans and repeated preparation', () => {
  const certificate = makeCertificate({ tipo_documento: 'CIN' });
  const template = '<strong>CPF:</strong>&nbsp;<span>nº</span> {{cpf}} / <b>RG</b>: n.º {{rg}}';
  const prepared = '<strong>CIN:</strong>&nbsp;<span>nº</span> {{cpf}} / <b>CIN</b>: n.º {{rg}}';
  assert.equal(prepareEadCertificateTemplate(template, certificate), prepared);
  assert.equal(prepareEadCertificateTemplate(prepared, certificate), prepared);
  assert.equal(render(certificate, '<strong>CPF:</strong> {{cpf}}', true),
    '<strong>CIN:</strong> <strong>001.234.567-89</strong>');
  assert.equal(render(makeCertificate({ tipo_documento: 'RG' }), 'CIN: {{cpf}}'), 'CPF: 001.234.567-89');
});

test('document aliases resolve identically and escaped values are never reparsed as template markup', () => {
  const certificate = makeCertificate({ tipo_documento: 'CNH', rg: '00<&>$& - Aprovado {{cpf}}' });
  assert.equal(render(certificate, '{{ALUNO_DOCUMENTO_TIPO}} {{ALUNO_DOCUMENTO_NUMERO}}'),
    'CNH 00<&>$& - Aprovado {{cpf}}');
  assert.equal(render(certificate, '{{ALUNO_TIPO_DOCUMENTO}} {{ALUNO_NUMERO_DOCUMENTO}}'),
    'CNH 00<&>$& - Aprovado {{cpf}}');
  assert.equal(render(certificate, '{{documento_tipo}} {{documento_numero}}', true),
    '<strong>CNH</strong> <strong>00&lt;&amp;&gt;$&amp; - Aprovado {{cpf}}</strong>');
  const unknown = makeCertificate({ tipo_documento: '<tipo $&>', rg: 'AB001' });
  assert.equal(render(unknown, '{{documento_tipo}}', true), '<strong>&lt;tipo $&amp;&gt;</strong>');
});

test('labels outside student identity tokens and fiscal declarations remain unchanged', () => {
  const certificate = makeCertificate({ tipo_documento: 'CIN' });
  const unrelated = 'CPF do responsável: {{responsavel_cpf}}. RG do emissor. CNPJ {{cnpj}}.';
  assert.equal(prepareEadCertificateTemplate(unrelated, certificate), unrelated);
  const fiscal = 'CPF: {{cpf}} / {{ANO_CALENDARIO}} / {{VALOR_TOTAL}}';
  assert.equal(prepareEadCertificateTemplate(fiscal, certificate), fiscal);
});

test('other modalities continue using the original renderer without EAD masks or aliases', () => {
  for (const modalidade of ['TECNICO', 'LIVRE', 'ESPECIALIZACAO']) {
    const certificate = { ...makeCertificate({ tipo_documento: 'RG' }), modalidade };
    assert.equal(replaceVarsPlain('CPF: {{cpf}} / RG: {{rg}}', certificate), 'CPF: 00123456789 / RG: 00.123.456-X');
    assert.throws(() => buildEadCertificateTemplateVars(certificate), /exclusivo/);
  }
});
