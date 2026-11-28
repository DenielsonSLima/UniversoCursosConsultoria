import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-template-test.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const bundled = await build({ stdin: { contents: `export * from './certificado-preview.utils.ts';
  export * from './ead-certificate-layout.ts';
  export { withCertificateEmissionSnapshot } from '../certificate-identity-snapshot.ts';
  export { getBlocks } from '../../../cadastros/modelos-documentos/diploma/components/diploma-preview.blocks.ts';`,
  resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, platform: 'node', format: 'esm', write: false });
const { buildEadCertificateTemplateVars, replaceEadCertificateVars, hasEadCurriculumTableBlock, getCertificatePreviewPageCount,
  getBlocks, withCertificateEmissionSnapshot } = await import(
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

test('the configured certificate distinguishes verified study dates and the issue date in Sergipe', () => {
  const issued = { ...certificate, data_inscricao: '2026-09-01T13:00:00Z', emitido_em: '2026-10-10T01:30:00Z',
    metadados: { eadStudyPeriod: { startedOn: '2026-09-29', completedOn: '2026-10-08', source: 'VERIFIED_STUDY_ACTIVITY' } } };
  const values = buildEadCertificateTemplateVars(issued);
  assert.equal(values.periodo_previsto_ead, '01/09/2026 a 08/09/2026');
  assert.equal(values.data_inicio, '29/09/2026');
  assert.equal(values.data_fim, '08/10/2026');
  assert.equal(values.periodo, '29/09/2026 até 08/10/2026');
  assert.equal(values.data_emissao, '09/10/2026');
  assert.equal(values.data_emissao_extenso, '9 de outubro de 2026');
});

test('a second copy renders its scheduled dates with the original code and actual issuance date', () => {
  const legacy = withCertificateEmissionSnapshot({
    ...certificate, data_inscricao: '2026-09-29T01:30:00Z', emitido_em: '2026-10-10T01:30:00Z',
  }, { studentDocumentType: 'CIN' });
  const values = buildEadCertificateTemplateVars(legacy);
  assert.equal(values.periodo_previsto_ead, '28/09/2026 a 05/10/2026');
  assert.equal(values.data_conclusao, '08/10/2026');
  assert.equal(values.data_emissao, '09/10/2026');
  assert.equal(values.codigo_certificado, 'CERT-TESTE');
  assert.equal(values.codigo_validacao, 'CERT-TESTE');
  assert.ok(values.url_validacao.includes('CERT-TESTE'));
  assert.equal(values.data_inicio, 'A comprovar');
  assert.equal(values.periodo, 'Início a comprovar · conclusão em 08/10/2026');
  assert.equal(replaceEadCertificateVars('No período de {{data_inicio}} até {{data_fim}}.', legacy, values, false),
    'Início a comprovar. Conclusão em 08/10/2026.');
  assert.equal(replaceEadCertificateVars('Texto oficial.<br />Período de realização · {{periodo}}.', legacy, values, false),
    'Texto oficial.<br />Período previsto do curso · 28/09/2026 a 05/10/2026.');
});

test('scheduled dates use calendar days without offsetting date-only enrollments', () => {
  for (const [enrollment, expected] of [
    ['2028-02-23', '23/02/2028 a 01/03/2028'],
    ['2026-12-28T01:00:00Z', '27/12/2026 a 03/01/2027'],
    [null, ''],
    ['2026-02-31', ''],
  ]) {
    const issued = { ...certificate, data_inscricao: enrollment };
    const values = buildEadCertificateTemplateVars(issued);
    assert.equal(values.periodo_previsto_ead, expected);
    if (expected === '') {
      assert.equal(replaceEadCertificateVars('Texto.<br />Período previsto do curso · {{periodo_previsto_ead}}.', issued, values, false),
        'Texto.');
    }
  }
});

test('the institutional EAD editor and PDF share the upgraded period line and preserve the configured block', () => {
  const model = { id: 'certificado_ead', tipoCurso: 'Educação a Distância (EAD)' };
  const original = { id: 'texto', type: 'text', page: 'frente', visible: true,
    x: 19.26, y: 27.09, width: 790, fontFamily: 'serif', fontSize: 23 };
  for (const content of ['Texto da instituição.', 'Texto da instituição.<br />Período de realização · {{periodo}}.']) {
    const amended = getBlocks({ ...model, blocks: [{ ...original, content }] }).find(block => block.id === 'texto');
    assert.deepEqual(amended, { ...original,
      content: 'Texto da instituição.<br />Período previsto do curso · {{periodo_previsto_ead}}.' });
    const issued = { ...certificate, data_inscricao: '2026-09-29' };
    assert.equal(replaceEadCertificateVars(amended.content, issued, buildEadCertificateTemplateVars(issued), false),
      'Texto da instituição.<br />Período previsto do curso · 29/09/2026 a 06/10/2026.');
  }
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
