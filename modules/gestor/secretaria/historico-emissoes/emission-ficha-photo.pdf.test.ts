import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { createEmissionDocumentsPdf, type EmissionPdfSource } from './emission-document.pdf';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const NAME = 'ALUNA DE EXEMPLO';
const PHOTO = { x: 76, y: 350, width: 100.5, height: 134 };
const makeSource = (photo: string | null): EmissionPdfSource => ({
  emission: {
    id: 'fixture-ficha-photo', codigo: 'FIXTURE-FICHA-PHOTO', documento: 'ficha_matricula',
    validacao_publica: false, emitido_em: '2026-09-26T12:00:00.000Z',
    identidade: 'fixture-ficha-photo', matricula_id: 'fixture-enrollment', aluno_id: 'fixture-student',
    polo_id: 'fixture-unit', periodo_referencia: null, referencia_externa: null,
    status: 'ATIVO', ultima_emissao_em: '2026-09-26T12:00:00.000Z', validade_ate: null,
    revogado_em: null, emitido_por: null, quantidade_emissoes: 1,
    aluno: { id: 'fixture-student', nome: 'CADASTRO VIVO', cpf_cnpj: '00000000000', foto_url: PIXEL },
    dados_emissao: {
      studentName: NAME, studentPhotoUrl: photo,
      institutionSnapshot: { nome: 'INSTITUICAO DE EXEMPLO', logoUrl: null },
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
        ...PHOTO, style: { border: '1px solid #94a3b8' },
      }, {
        id: 'ficha_identificacao', type: 'text', value: '{{ALUNO_NOME}}',
        x: 186.5, y: 350, width: 531.5, height: 134,
        style: { fontSize: '10px', border: '1px solid #94a3b8' },
      }],
    },
    watermark: null, polo: null, academicData: null, certificate: null,
  },
});

const inspectPdf = async (source: EmissionPdfSource, artifact?: string) => {
  const before = structuredClone(source);
  const result = await createEmissionDocumentsPdf([source]);
  assert.deepEqual(source, before, 'modelo e snapshots permanecem imutáveis');
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const outputDirectory = process.env.SECRETARIA_FICHA_PHOTO_PDF_FIXTURE_DIR;
  if (outputDirectory && artifact) await writeFile(`${outputDirectory}/${artifact}.pdf`, bytes);
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  assert.equal(document.numPages, 1, 'foto não muda paginação');
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => 'str' in item);
  const name = items.find((item) => item.str === NAME);
  assert.ok(name, 'nome continua como texto selecionável');
  const operators = await page.getOperatorList();
  const imageCount = operators.fnArray.filter((operator) => operator === OPS.paintImageXObject).length;
  const photoBounds = [
    PHOTO.x * (210 / 794) * (72 / 25.4),
    (297 - (PHOTO.y + PHOTO.height) * (297 / 1123)) * (72 / 25.4),
    (PHOTO.x + PHOTO.width) * (210 / 794) * (72 / 25.4),
    (297 - PHOTO.y * (297 / 1123)) * (72 / 25.4),
  ];
  const photoFrameCount = operators.argsArray.filter((args, index) => (
    operators.fnArray[index] === OPS.constructPath
    && photoBounds.every((bound, axis) => Math.abs(Number(args[2]?.[axis]) - bound) < 0.02)
  )).length;
  const opacityIndex = operators.fnArray.indexOf(OPS.setGState);
  assert.deepEqual(operators.argsArray[opacityIndex], [[['ca', 0.17]]]);
  const namePosition = name.transform.slice(4, 6);
  const text = items.map((item) => item.str).join('\n');
  await document.destroy();
  return { imageCount, photoFrameCount, namePosition, text };
};

test('Ficha incorpora a foto congelada e mantém espaço de colagem quando ausente', async () => {
  const withPhoto = await inspectPdf(makeSource(PIXEL), 'com-foto');
  const withoutPhoto = await inspectPdf(makeSource(''), 'sem-foto');
  const nullPhoto = await inspectPdf(makeSource(null));
  const placeholder = await inspectPdf(makeSource('/sem-foto-aluno.svg'));

  assert.equal(withPhoto.imageCount, 2, 'somente foto e marca isoladas');
  assert.doesNotMatch(withPhoto.text, /IMAGEM INDISPONÍVEL|CADASTRO VIVO/);
  for (const absent of [withoutPhoto, nullPhoto, placeholder]) {
    assert.equal(absent.imageCount, 1, 'foto viva não preenche ausência congelada');
    assert.deepEqual(absent.namePosition, withPhoto.namePosition, 'Ficha não expande identificação sobre o slot');
    assert.ok(absent.photoFrameCount >= 1, 'moldura do espaço para colar foto mantém suas coordenadas');
  }
});

test('Ficha carrega URL da foto com query intacta e mantém slot se recurso falhar', async () => {
  const photoUrl = 'https://example.invalid/photo.png?width=300&height=400';
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  let status = 200;
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    const bytes = Uint8Array.from(atob(PIXEL.split(',')[1]), (character) => character.charCodeAt(0));
    return new Response(status === 200 ? bytes : null, { status, headers: { 'content-type': 'image/png' } });
  };
  try {
    const loaded = await inspectPdf(makeSource(photoUrl));
    status = 404;
    const unavailable = await inspectPdf(makeSource(photoUrl), 'foto-indisponivel');
    const absent = await inspectPdf(makeSource(''));
    assert.deepEqual(requested, [photoUrl, photoUrl], 'URL não recebe escape HTML no carregamento');
    assert.equal(loaded.imageCount, 2, 'foto remota acessível é incorporada');
    assert.equal(unavailable.imageCount, 1);
    assert.deepEqual(unavailable.namePosition, absent.namePosition);
    assert.equal(unavailable.photoFrameCount, absent.photoFrameCount, 'falha de rede também preserva moldura');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
