import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-template-test.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const bundled = await build({ stdin: { contents: `export * from './certificado-preview.utils.ts';
  export * from './ead-certificate-layout.ts';`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, platform: 'node', format: 'esm', write: false });
const { buildEadCertificateTemplateVars, replaceEadCertificateVars, hasEadCurriculumTableBlock, getCertificatePreviewPageCount } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);
const certificate = {
  modalidade: 'EAD', data_conclusao: '2026-10-08', codigo_validacao: 'CERT-TESTE',
  aluno: { nome: 'ALUNO & <literal> $& - Aprovado {{cpf}}', cpf_cnpj: '00000000000', tipo_documento: 'CIN' },
  curso: { nome: 'Curso de teste', carga_horaria: 999 },
};

test('EAD variables retain literal data while interpolation preserves CIN and escapes HTML once', () => {
  const values = buildEadCertificateTemplateVars(certificate, { totalHours: 120 });
  assert.equal(values.nome_aluno, certificate.aluno.nome);
  assert.equal(values.carga_horaria, '120');
  const html = replaceEadCertificateVars('{{nome_aluno}} | CPF {{cpf}} | {{carga_horaria}} h', certificate, values);
  assert.equal(html, '<strong>ALUNO &amp; &lt;literal&gt; $&amp; - Aprovado {{cpf}}</strong> | CIN <strong>000.000.000-00</strong> | <strong>120</strong> h');
  assert.ok(!html.includes('<span'));
});

test('only a status badge written into the model is interpreted; data is never reparsed', () => {
  const values = buildEadCertificateTemplateVars(certificate);
  const html = replaceEadCertificateVars('{{nome_aluno}} - Aprovado', certificate, values);
  assert.equal((html.match(/<span/g) || []).length, 1);
  assert.ok(html.includes('$&amp; - Aprovado {{cpf}}'));
  assert.equal(replaceEadCertificateVars('{{nome_aluno}}', certificate, values, false), certificate.aluno.nome);
});

test('the adapter cannot be used to change another certificate modality', () => {
  assert.throws(() => buildEadCertificateTemplateVars({ ...certificate, modalidade: 'TECNICO' }), /exclusivo/);
});

test('table detection and page count use effective editor blocks, including a default history block', () => {
  const model = { tipoCurso: 'Educação a Distância (EAD)', hasVerso: true,
    blocks: [{ id: 'titulo', type: 'text', page: 'frente', visible: true, content: 'Certificado' }] };
  assert.ok(hasEadCurriculumTableBlock(model));
  const rows = [{ nome: 'Conteúdo canônico', carga: '20h', status: 'Concluído' }];
  const issued = { ...certificate, metadados: { eadCurriculumTable: { version: 2, rows,
    pages: [{ number: 1, rows }, { number: 2, rows }] } } };
  assert.equal(getCertificatePreviewPageCount(issued, model), 3);
  assert.equal(getCertificatePreviewPageCount(issued, { ...model, hasVerso: false }), 1);
  assert.equal(getCertificatePreviewPageCount({ ...issued, modalidade: 'TECNICO' }, { hasVerso: false }), 2);
});
