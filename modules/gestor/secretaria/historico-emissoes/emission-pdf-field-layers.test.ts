import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { createEmissionDocumentsPdf } from './emission-document.pdf';
import { orderedEmissionFields } from './emission-pdf-field-layers';
import { makeBoletimSource, extractPdfText } from './emission-document.pdf.contract.fixtures';

const crc32 = (bytes: Buffer) => {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = checksum >>> 1 ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, bytes: Buffer) => {
  const content = Buffer.concat([Buffer.from(type), bytes]);
  const size = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([size, content, checksum]);
};

// Opaque original signature asset: white pixels must blend, never be erased.
const opaqueSignature = () => {
  const width = 280;
  const height = 90;
  const rowLength = width * 3 + 1;
  const pixels = Buffer.alloc(rowLength * height, 255);
  for (let row = 0; row < height; row += 1) pixels[row * rowLength] = 0;
  for (let x = 30; x < 250; x += 1) {
    const y = Math.round(43 + Math.sin(x / 19) * 15);
    const offset = y * rowLength + 1 + x * 3;
    pixels.set([37, 85, 155], offset);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
};

const bulletinWithSignature = (blend = 'multiply', opacity = 1) => {
  const source = makeBoletimSource();
  source.emission.validacao_publica = false;
  source.preview.template = {
    ...source.preview.template,
    absoluteFields: [{
      id: 'boletim_assinatura', type: 'text',
      value: '___________________________________________\nDiretora Geral',
      x: 236, y: 997, width: 325,
      style: { textAlign: 'center', fontSize: '13px', whiteSpace: 'pre-line' },
    }, {
      id: 'assinatura_imagem', type: 'image', value: opaqueSignature(),
      x: 274, y: 892, width: 241, height: 207,
      style: { zIndex: 50, mixBlendMode: blend, opacity },
    }],
  };
  return source;
};

const inspect = async (blob: Blob) => {
  const document = await PDFDocument.load(await blob.arrayBuffer());
  const page = document.getPage(0);
  const contents = page.node.Contents();
  assert.ok(contents);
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  const operators = streams.map(reference => {
    const stream = document.context.lookup(reference);
    assert.ok(stream instanceof PDFRawStream);
    return Buffer.from(decodePDFRawStream(stream).decode()).toString();
  }).join('\n');
  const states = page.node.Resources()?.lookupMaybe(PDFName.of('ExtGState'), PDFDict);
  return { document, page, operators, states };
};

test('boletim mescla assinatura opaca, mantém linha/cargo vetoriais e respeita zIndex', async () => {
  const source = bulletinWithSignature();
  const originalTemplate = JSON.stringify(source.preview.template);
  const result = await createEmissionDocumentsPdf([source]);
  if (process.env.BOLETIM_SIGNATURE_PDF_OUTPUT) {
    await writeFile(process.env.BOLETIM_SIGNATURE_PDF_OUTPUT, new Uint8Array(await result.blob.arrayBuffer()));
  }
  const { operators, states } = await inspect(result.blob);
  assert.equal(JSON.stringify(source.preview.template), originalTemplate);
  assert.ok(states, 'O modelo exige recurso nativo Multiply para a assinatura');
  const multiply = states.lookup(PDFName.of('EmissionMultiply'), PDFDict);
  assert.equal(String(multiply.get(PDFName.of('BM'))), '/Multiply');
  assert.match(operators, /\/EmissionMultiply gs/);
  const cargo = operators.indexOf('(Diretora Geral) Tj');
  const line = operators.indexOf('(___________________________________________) Tj');
  const signatureImage = operators.lastIndexOf(' Do');
  assert.ok(line >= 0 && cargo > line, 'Linha e cargo devem permanecer texto vetorial');
  assert.ok(signatureImage > cargo, 'zIndex50 deve desenhar a assinatura após o texto30');
  assert.match(await extractPdfText(result.blob), /Diretora Geral/);
});

test('opacidade da assinatura chega ao PDF sem alterar o recurso original', async () => {
  const source = bulletinWithSignature('multiply', 0.35);
  const result = await createEmissionDocumentsPdf([source]);
  const { page, states } = await inspect(result.blob);
  assert.ok(states);
  assert.ok(states.keys().some(key => states.lookup(key, PDFDict).get(PDFName.of('ca'))?.toString() === '0.35'));
  const images = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
  assert.ok(images);
  assert.ok(images.keys().some(key => {
    const image = images.lookup(key);
    if (!(image instanceof PDFRawStream)) return false;
    return String(image.dict.get(PDFName.of('Width'))) === '280'
      && String(image.dict.get(PDFName.of('Height'))) === '90';
  }), 'A assinatura deve continuar como recurso isolado na resolução original');
});

test('normal conserva fundo opaco; nenhum campo ganha multiply implicitamente', async () => {
  const result = await createEmissionDocumentsPdf([bulletinWithSignature('normal')]);
  const { operators, states } = await inspect(result.blob);
  assert.doesNotMatch(operators, /\/EmissionMultiply gs/);
  assert.ok(!states?.has(PDFName.of('EmissionMultiply')));
});

test('camada com modo de mesclagem não suportado falha explicitamente', async () => {
  await assert.rejects(createEmissionDocumentsPdf([bulletinWithSignature('screen')]), /mesclagem.*suportad/i);
});

test('ordem estável segue zIndex do editor e preserva campos sem índice', () => {
  const fields = [
    { id: 'imagem', style: { zIndex: 50 } },
    { id: 'primeiro_texto' },
    { id: 'segundo_texto', style: { zIndex: null } },
    { id: 'terceiro_texto', style: { zIndex: 'auto' } },
  ];
  assert.deepEqual(orderedEmissionFields(fields).map(field => field.id),
    ['primeiro_texto', 'segundo_texto', 'terceiro_texto', 'imagem']);
  assert.equal(fields[0].id, 'imagem');
});

test('camada transparente não desenha assinatura nem afeta linha e cargo', async () => {
  const result = await createEmissionDocumentsPdf([bulletinWithSignature('multiply', 0)]);
  const { operators } = await inspect(result.blob);
  assert.match(operators, /\(Diretora Geral\) Tj/);
  assert.doesNotMatch(operators, /\/EmissionMultiply gs|\/I\d+ Do/);
});
