import assert from 'node:assert/strict';
import test from 'node:test';
import { jsPDF } from 'jspdf';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  fichaMatriculaDefaultTemplate,
  pastaIdentificacaoDefaultTemplate,
} from '../../cadastros/ficha-matricula/document-layouts';
import { createEmissionDocumentsPdf, type EmissionPdfSource } from './emission-document.pdf';
import { drawRegistrationGrid } from './emission-pdf-registration-grid';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const LONG_NAME = 'MARIA EDUARDA DOS SANTOS OLIVEIRA DE ALBUQUERQUE E VASCONCELOS';
const LONG_CLASS = 'Técnico em Enfermagem T-46 - Integral - JAPOATÃ - 2026.2';
const BIRTHPLACE = 'NOSSA SENHORA DO SOCORRO';
const compact = (value: string) => value.replace(/\s+/g, '');

const makeSource = (documento: 'pasta_identificacao' | 'ficha_matricula'): EmissionPdfSource => {
  const template: EmissionPdfSource['preview']['template'] = globalThis.structuredClone(
    documento === 'pasta_identificacao' ? pastaIdentificacaoDefaultTemplate : fichaMatriculaDefaultTemplate,
  );
  template.absoluteFields.push({
    id: 'validation_qr', type: 'qrcode', x: 610,
    y: documento === 'pasta_identificacao' ? 894 : 1005, width: 100, height: 100,
  });
  return {
    emission: {
      id: `fixture-${documento}`, codigo: 'EXEMPLO-1234-5678', documento,
      validacao_publica: true, emitido_em: '2026-09-26T12:00:00Z',
      identidade: `fixture-${documento}`, matricula_id: 'fixture-enrollment',
      aluno_id: 'fixture-student', polo_id: 'fixture-unit', periodo_referencia: null,
      referencia_externa: null, status: 'ATIVO', ultima_emissao_em: '2026-09-26T12:00:00Z',
      validade_ate: null, revogado_em: null, emitido_por: null, quantidade_emissoes: 1,
      dados_emissao: {
        studentName: LONG_NAME, studentBirthplace: BIRTHPLACE, studentPhotoUrl: PIXEL,
        studentMotherName: 'ANA CAROLINA DOS SANTOS OLIVEIRA',
        studentFatherName: 'JOSE AUGUSTO DE SOUZA OLIVEIRA',
        studentBirthDate: '2000-01-01', studentSex: 'FEMININO', studentState: 'SE',
        studentCpf: '00000000000', studentRg: '123456789', studentRgIssuer: 'SSP', studentRgState: 'SE',
        studentRgIssueDate: '2020-01-01', studentRaceColor: 'PARDA', studentPcd: 'NÃO',
        studentStreet: 'ASSENTAMENTO MARGARIDA ALVES', studentAddressNumber: 'S/N',
        studentDistrict: 'ÁREA RURAL', studentCity: 'JAPOATÃ', studentZipCode: '49950-000',
        studentPhone: '(79) 90000-0000', studentEmail: 'aluna.exemplo@example.invalid',
        studentVoterId: '000000000000', studentVoterZone: '000', studentVoterSection: '0000',
        studentVoterIssueDate: '2020-02-03', studentVoterState: 'SE', studentMatricula: '202600001',
        courseName: 'Técnico em Enfermagem', className: LONG_CLASS, classShift: 'INTEGRAL',
        institutionSnapshot: { nome: 'INSTITUIÇÃO DE EXEMPLO', cidade: 'JAPOATÃ', uf: 'SE' },
        watermarkSnapshot: {},
      },
    },
    preview: { template, polo: null, watermark: null, academicData: null, certificate: null },
  };
};

const inspectPdf = async (blob: Blob) => {
  const document = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: true,
  }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter((item) => 'str' in item);
    const operators = await page.getOperatorList();
    return {
      pages: document.numPages,
      text: items.map((item) => item.str).join(' '),
      fontSize: (text: string) => {
        const item = items.find((candidate) => candidate.str === text);
        assert.ok(item, `texto selecionável ausente: ${text}`);
        return Math.hypot(item.transform[0], item.transform[1]);
      },
      imageCount: operators.fnArray.filter((operation) => operation === OPS.paintImageXObject).length,
      imageTransforms: operators.fnArray.flatMap((operation, index) => (
        operation === OPS.transform ? [operators.argsArray[index] as number[]] : []
      )),
    };
  } finally {
    await document.destroy();
  }
};

for (const documento of ['pasta_identificacao', 'ficha_matricula'] as const) {
  test(`${documento}: fonte maior mantém modelo completo, texto extenso, foto e QR em uma página`, async () => {
    const source = makeSource(documento);
    const before = globalThis.structuredClone(source);
    const rendered = await inspectPdf((await createEmissionDocumentsPdf([source])).blob);
    assert.deepEqual(source, before, 'o compositor não altera o modelo nem os dados congelados');
    assert.equal(rendered.pages, 1);
    for (const value of [
      LONG_NAME, LONG_CLASS, BIRTHPLACE, 'ANA CAROLINA DOS SANTOS OLIVEIRA',
      'JOSE AUGUSTO DE SOUZA OLIVEIRA', 'ASSENTAMENTO MARGARIDA ALVES',
      'aluna.exemplo@example.invalid', '(79) 90000-0000', '000.000.000-00', 'EXEMPLO-1234-5678',
    ]) {
      assert.ok(compact(rendered.text).includes(compact(value)), `conteúdo truncado: ${value}`);
    }
    assert.equal(rendered.fontSize('aluna.exemplo@example.invalid'), 8.5);
    assert.equal(rendered.fontSize('E-MAIL'), 6);
    assert.equal(rendered.fontSize('DOCUMENTOS'), 7);
    assert.equal(rendered.imageCount, 2, 'somente foto e QR isolados, sem imagem de página');
    const expectedTransforms = [
      [75.3466, 0, 0, 75.3466, 56.9785, 491.6005],
      [55.1254, 0, 0, 55.1254, 467.2508, documento === 'pasta_identificacao' ? 116.5511 : 33.3367],
    ];
    assert.equal(rendered.imageTransforms.length, expectedTransforms.length);
    expectedTransforms.forEach((expected, index) => expected.forEach((coordinate, axis) => {
      assert.ok(Math.abs(rendered.imageTransforms[index][axis] - coordinate) < 0.02,
        `a geometria de ${index === 0 ? 'foto' : 'QR'} foi alterada`);
    }));
  });
}

const SMALL_GRID = `<section style="border:1px solid #cbd5e1;">
  <h4>Identificação</h4>
  <div style="display:grid;grid-template-columns:1fr;grid-template-rows:repeat(1,minmax(0,1fr));">
    <div><strong>Nome</strong><span>ALUNA DE EXEMPLO</span></div>
  </div>
</section>`;

test('grade sem adesão à nova tipografia conserva os tamanhos anteriores', async () => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  assert.equal(drawRegistrationGrid(pdf, SMALL_GRID, 20, 90, 170, 30, 'Modelo externo'), true);
  const rendered = await inspectPdf(pdf.output('blob'));
  assert.equal(rendered.fontSize('IDENTIFICAÇÃO'), 5.6);
  assert.equal(rendered.fontSize('NOME'), 4.8);
  assert.equal(rendered.fontSize('ALUNA DE EXEMPLO'), 6.2);
});

test('conteúdo impossível continua bloqueado sem truncamento ou página adicional', () => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  assert.throws(() => drawRegistrationGrid(
    pdf, SMALL_GRID.replace('ALUNA DE EXEMPLO', 'CONTEÚDO EXTENSO '.repeat(100)),
    20, 90, 20, 20, 'Campo de teste', true,
  ), /ultrapassa a célula canônica/);
  assert.equal(pdf.getNumberOfPages(), 1);
});
