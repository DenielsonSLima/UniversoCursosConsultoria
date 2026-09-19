import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmissionDocumentsPdf, type EmissionPdfSource } from './emission-document.pdf';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const NAME = 'ALUNA DE EXEMPLO';
const makeSource = (photo: string): EmissionPdfSource => ({
  emission: {
    id: 'fixture-photo', codigo: 'FIXTURE-PHOTO', documento: 'pasta_identificacao',
    validacao_publica: false, emitido_em: '2026-09-19T12:00:00.000Z',
    identidade: 'fixture-photo', matricula_id: 'fixture-enrollment', aluno_id: 'fixture-student',
    polo_id: 'fixture-unit', periodo_referencia: null, referencia_externa: null,
    status: 'ATIVO', ultima_emissao_em: '2026-09-19T12:00:00.000Z', validade_ate: null,
    revogado_em: null, emitido_por: null, quantidade_emissoes: 1,
    dados_emissao: {
      studentName: NAME, studentSex: 'F', studentPhotoUrl: photo,
      studentRgIssuer: 'SSP/SE', studentRgState: '',
      studentVoterId: '123456789012', studentReservist: '',
      institutionSnapshot: { nome: 'INSTITUICAO DE EXEMPLO' },
      watermarkSnapshot: {
        watermarkUrl: PIXEL, watermarkOpacity: 0.17,
        watermarkScale: 37, watermarkRotate: false,
      },
    },
  },
  preview: {
    template: {
      pageCount: 1, textContent: '', absoluteFields: [{
        id: 'student_photo', type: 'image', value: '{{ALUNO_FOTO_URL}}',
        x: 76, y: 350, width: 100.5, height: 134,
      }, {
        id: 'pasta_identificacao', type: 'text', value: '{{ALUNO_NOME}}',
        x: 186.5, y: 350, width: 531.5, height: 134,
        style: { fontSize: '10px' },
      }, {
        id: 'campos_documentos_exemplo', type: 'text',
        value: '{{ALUNO_RG_ORGAO}} / {{ALUNO_RG_UF}} | {{ALUNO_TITULO_ELEITOR}} | {{ALUNO_RESERVISTA}}',
        x: 76, y: 690, width: 642, height: 92,
        style: { fontSize: '10px' },
      }],
    },
    // Configuração viva divergente não pode substituir a marca congelada.
    watermark: { watermarkUrl: null, watermarkOpacity: 1, watermarkScale: 90, watermarkRotate: true },
    polo: null, academicData: null, certificate: null,
  },
});

const inspectPdf = async (source: EmissionPdfSource) => {
  const before = globalThis.structuredClone(source);
  const result = await createEmissionDocumentsPdf([source]);
  assert.deepEqual(source, before, 'modelo e snapshot, incluindo parâmetros da marca, permanecem imutáveis');
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  assert.equal(document.numPages, 1);
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => 'str' in item);
  const name = items.find((item) => item.str === NAME);
  assert.ok(name, 'nome continua como texto selecionável');
  const operators = await page.getOperatorList();
  const opacityIndex = operators.fnArray.indexOf(OPS.setGState);
  assert.deepEqual(operators.argsArray[opacityIndex], [[['ca', 0.17]]], 'opacidade vem da marca congelada');
  const firstTransform = operators.argsArray[operators.fnArray.indexOf(OPS.transform)];
  const expectedWatermarkWidth = 210 * 0.37 * (72 / 25.4);
  assert.ok(Math.abs(firstTransform[0] - expectedWatermarkWidth) < 0.01, 'escala 37% atravessa o compositor');
  assert.equal(firstTransform[1], 0);
  assert.equal(firstTransform[2], 0, 'marca congelada sem rotação ignora configuração viva rotacionada');
  const imageCount = operators.fnArray.filter((operator) => operator === OPS.paintImageXObject).length;
  const text = items.map((item) => item.str).join('\n');
  const namePosition = name.transform.slice(4, 6);
  await document.destroy();
  return { text, namePosition, imageCount };
};

test('PDF da pasta expande identificação sem foto e preserva foto válida e marca congelada', async () => {
  const withPhoto = await inspectPdf(makeSource(PIXEL));
  const withoutPhoto = await inspectPdf(makeSource(''));
  const placeholderPhoto = await inspectPdf(makeSource('/sem-foto-aluno.svg'));
  const expectedShift = 110.5 * (210 / 794) * (72 / 25.4);
  assert.ok(Math.abs(withPhoto.namePosition[0] - withoutPhoto.namePosition[0] - expectedShift) < 0.01);
  assert.equal(withPhoto.namePosition[1], withoutPhoto.namePosition[1], 'expansão não desloca o texto verticalmente');
  assert.deepEqual(placeholderPhoto.namePosition, withoutPhoto.namePosition);
  assert.equal(withPhoto.imageCount, 2, 'somente foto e marca isoladas');
  assert.equal(withoutPhoto.imageCount, 1, 'marca preservada sem imagem de página inteira');
  for (const rendered of [withPhoto, withoutPhoto, placeholderPhoto]) {
    assert.doesNotMatch(rendered.text, /IMAGEM INDISPONÍVEL|SEM FOTO|SSP\/SE\s*\//);
    assert.match(rendered.text, /SSP\/SE \| 1234 5678 9012 \| NÃO POSSUI/);
  }
});

test('foto que falha ao carregar remove o slot e usa o mesmo reflow da ausência', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(null, { status: 404 });
  };
  try {
    const unavailable = await inspectPdf(makeSource('https://example.invalid/photo.jpg'));
    const absent = await inspectPdf(makeSource(''));
    assert.equal(requestedUrl, 'https://example.invalid/photo.jpg');
    assert.deepEqual(unavailable.namePosition, absent.namePosition);
    assert.equal(unavailable.imageCount, 1);
    assert.doesNotMatch(unavailable.text, /IMAGEM INDISPONÍVEL|SEM FOTO/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
