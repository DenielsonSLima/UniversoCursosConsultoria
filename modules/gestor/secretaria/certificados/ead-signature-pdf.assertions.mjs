import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

// An opaque white signature image reproduces the overlap that a transparent
// fixture misses. The configured Multiply layer must preserve the vector line.
export function withOpaqueSignature(fixture, createCanvas) {
  const canvas = createCanvas(280, 90);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 280, 90);
  context.strokeStyle = '#25559b';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(35, 55);
  context.bezierCurveTo(70, 10, 90, 70, 130, 35);
  context.bezierCurveTo(165, 5, 190, 65, 245, 30);
  context.stroke();
  const blocks = fixture.model.blocks.filter(block =>
    !['signature', 'signatureImage', 'line'].includes(block.type));
  return {
    ...fixture,
    signatures: { ...fixture.signatures, diretoriaGeral: canvas.toDataURL('image/png') },
    model: { ...fixture.model, blocks: [...blocks,
      { id: 'assinatura1', type: 'signature', page: 'frente', visible: true,
        x: 64.09, y: 82.33, width: 256, title: 'Diretor Geral', color: '#1e293b',
        signatureSource: 'diretoriaGeral', signatureBlend: true, signatureLabelFontSize: 10 },
      { id: 'assinatura1Imagem', type: 'signatureImage', page: 'frente', visible: true,
        x: 63.57, y: 73.69, width: 280, signatureBlockId: 'assinatura1',
        signatureSource: 'diretoriaGeral', signatureBlend: true },
    ] },
  };
}

// Runs in the controlled browser against the actual DiplomaBlockContent.
export function measureDirectorLine() {
  const root = document.querySelector('[data-certificate-pdf-page]');
  const origin = root.getBoundingClientRect();
  const label = [...root.querySelectorAll('p')].find(node => node.textContent === 'Diretor Geral');
  if (!label) throw Error('Configured director label was not rendered.');
  const border = label.parentElement;
  const rect = border.getBoundingClientRect();
  const style = window.getComputedStyle(border);
  if (!(parseFloat(style.borderTopWidth) > 0)) throw Error('The preview has no configured signature line.');
  const image = [...root.querySelectorAll('img')].find(node =>
    node.naturalWidth === 280 && node.naturalHeight === 90);
  const imageRect = image?.getBoundingClientRect();
  if (!imageRect || imageRect.top >= rect.top || imageRect.bottom <= rect.top) {
    throw Error('The opaque signature fixture must overlap the configured line.');
  }
  return { x: (rect.left - origin.left) / origin.width * 297,
    y: (rect.top - origin.top) / origin.height * 210,
    width: rect.width / origin.width * 297,
    thickness: parseFloat(style.borderTopWidth) / origin.width * 297 };
}

export function assertNativeSignatureLine(document, geometry, pdfTypes) {
  const { PDFArray, PDFRawStream, decodePDFRawStream, PDFName, PDFDict } = pdfTypes;
  const page = document.getPage(0);
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  const operators = streams.map(reference => Buffer.from(decodePDFRawStream(
    document.context.lookup(reference, PDFRawStream)).decode()).toString()).join('\n');
  const mm = 72 / 25.4;
  const expected = [geometry.x * mm, (210 - geometry.y) * mm,
    (geometry.x + geometry.width) * mm, (210 - geometry.y) * mm];
  const lines = [...operators.matchAll(/([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l\s+S/g)];
  assert.ok(lines.some(match => expected.every((value, index) =>
    Math.abs(Number(match[index + 1]) - value) < 0.02)),
  'The configured director line must remain a native PDF stroke.');
  assert.ok(operators.includes('/EadMultiply gs'), 'The signature image must use Multiply.');
  const states = page.node.Resources().lookup(PDFName.of('ExtGState'), PDFDict);
  const multiply = states.lookup(PDFName.of('EadMultiply'), PDFDict);
  assert.equal(String(multiply.get(PDFName.of('BM'))), '/Multiply');
}

export function assertVisibleSignatureLine(image, geometry, createCanvas) {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const scale = image.width / 297;
  const left = Math.ceil((geometry.x + 1) * scale);
  const right = Math.floor((geometry.x + geometry.width - 1) * scale);
  const top = Math.round(geometry.y * scale);
  let darkColumns = 0;
  for (let x = left; x <= right; x++) {
    let darkest = 255;
    for (let y = top - 2; y <= top + 2; y++) {
      const offset = (y * image.width + x) * 4;
      darkest = Math.min(darkest, (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3);
    }
    if (darkest < 190) darkColumns++;
  }
  const coverage = darkColumns / (right - left + 1);
  assert.ok(coverage > 0.95,
    `The signature image erased the director line: only ${(coverage * 100).toFixed(1)}% is visible.`);
  return { coverage, x: geometry.x, y: geometry.y, width: geometry.width };
}
