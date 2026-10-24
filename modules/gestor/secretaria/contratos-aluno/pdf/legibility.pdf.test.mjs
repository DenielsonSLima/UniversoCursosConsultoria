import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requireTool = createRequire(process.env.CONTRACT_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.CONTRACT_UI_NODE_MODULES, '../contract-legibility-runner.mjs'))
  : import.meta.url);
const { build } = requireTool('esbuild');
const { getDocument } = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
const temporary = await mkdtemp(join(dirname(requireTool.resolve('jspdf/package.json')), '.contract-legibility-'));
after(() => rm(temporary, { recursive: true, force: true }));

await build({
  stdin: {
    contents: `
      export { createContratosAlunoPdf } from '../contratos-aluno.pdf';
      export { readContractVisualDocument } from './model';
      export { getContractQrLayout } from './qr';
      export { normalizeCanonicalPdfText } from '../../shared/canonical-document-vector-pdf';
      export { normalizeCanonicalDocumentRenderPayload } from '../../shared/canonical-document-render.utils';
    `,
    resolveDir: directory,
  },
  bundle: true, format: 'esm', platform: 'node', packages: 'external',
  outfile: join(temporary, 'product.mjs'),
});
const { createContratosAlunoPdf, readContractVisualDocument, getContractQrLayout, normalizeCanonicalPdfText,
  normalizeCanonicalDocumentRenderPayload } =
  await import(pathToFileURL(join(temporary, 'product.mjs')).href);
const { jsPDF } = requireTool('jspdf');
const version = 'CONTRATO_A4_INSTITUCIONAL_V4_LEGIVEL';
const bodyLine = 'Conteúdo canônico integral para a verificação da legibilidade.';
const footer = [
  'Cidade de Teste, 13/10/2026.',
  'CONTRATANTE: Pessoa de Teste',
  'CONTRATADA: Instituição de Teste',
  'TESTEMUNHAS:', '1: ____________________', '2: ____________________',
].join('\n');
const compact = value => normalizeCanonicalPdfText(String(value ?? '')).replace(/\s+/gu, '');
const fixture = (bodies = [bodyLine]) => ({
  emissionId: 'CON-LEGIBILIDADE-SINTETICO', documentId: null, title: 'Contrato de teste',
  targetName: 'Pessoa de Teste', validationCode: 'CON-ALU-FFFF-EEEE-DDDD', validationUrl: null,
  validUntil: null, fileUrl: null, statusLabel: null,
  renderPayload: {
    template: {}, templateRevision: 1,
    snapshot: { instituicao: { nome: 'Instituição de Teste', presentationVersion: version } },
    rendered: {
      kind: 'CONTRATO_ALUNO',
      pages: bodies.map((body, index) => ({
        header: '', title: 'Contrato de prestação de serviços educacionais', body,
        footer: index === bodies.length - 1 ? footer : '',
      })),
      watermark: { enabled: true, label: 'TESTE', imageUrl: null, opacity: 0.08, scale: 60, rotate: true },
      qr: { enabled: true, label: 'Validar documento', validityLabel: 'Sem vencimento' },
      front: null, back: null,
    },
  },
});

const extract = async blob => {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    standardFontDataUrl: `${dirname(requireTool.resolve('pdfjs-dist/package.json'))}/standard_fonts/`,
    useSystemFonts: true,
  }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.filter(item => 'str' in item));
  }
  await pdf.loadingTask.destroy();
  return pages;
};

const verifyDocument = async (source, name, expectedSize = 12) => {
  const before = structuredClone(source);
  const result = await createContratosAlunoPdf([source]);
  const pages = await extract(result.blob);
  assert.equal(pages.length, source.renderPayload.rendered.pages.length);
  pages.forEach((items, index) => {
    const text = compact(items.map(item => item.str).join(' '));
    assert.ok(text.includes(compact(source.renderPayload.rendered.pages[index].body)), `Corpo integral da página ${index + 1}`);
    const bodyItems = items.filter(item => item.str.includes('Conteúdo'));
    for (const item of bodyItems) assert.ok(Math.abs(item.transform[0] - expectedSize) < 0.01, 'Tamanho real da fonte');
    if (index < pages.length - 1) assert.ok(!text.includes('CON-ALU-FFFF'));
  });
  const finalText = compact(pages.at(-1).map(item => item.str).join(' '));
  assert.ok(finalText.includes(source.validationCode), 'Código de validação completo');
  assert.ok(finalText.includes('Validade:Semvencimento'), 'Validade completa');
  assert.ok(!finalText.includes('…'), 'Sem elipse de truncamento');
  assert.deepEqual(source, before);
  if (process.env.CONTRACT_PDF_ARTIFACTS) {
    await mkdir(process.env.CONTRACT_PDF_ARTIFACTS, { recursive: true });
    await writeFile(join(process.env.CONTRACT_PDF_ARTIFACTS, `${name}.pdf`), new Uint8Array(await result.blob.arrayBuffer()));
  }
  return pages;
};

test('V4 imprime o orçamento canônico de linhas em 12 pt e preserva todo o conteúdo', async () => {
  const document = fixture([39, 41, 27].map(count => Array(count).fill(bodyLine).join('\n')));
  document.renderPayload.rendered.pages[0].title = 'Contrato de prestação de serviços educacionais e condições institucionais para o curso técnico';
  await verifyDocument(document, 'contract-v4-boundaries');
});

test('uma página V4 reserva encerramento completo e V3 conserva a tipografia histórica', async () => {
  await verifyDocument(fixture([Array(24).fill(bodyLine).join('\n')]), 'contract-v4-single');
  const legacy = fixture();
  legacy.renderPayload.snapshot.instituicao.presentationVersion = 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA';
  await verifyDocument(legacy, 'contract-v3-preserved', 8.5);
});

test('página canônica somente de encerramento preserva assinaturas após normalizar corpo vazio para null', async () => {
  const document = fixture([bodyLine, '']);
  document.renderPayload = normalizeCanonicalDocumentRenderPayload(document.renderPayload);
  assert.equal(document.renderPayload.rendered.pages[1].body, null);
  const pages = await verifyDocument(document, 'contract-v4-closing-only');
  const finalText = compact(pages[1].map(item => item.str).join(' '));
  for (const value of ['Cidade de Teste, 13/10/2026.', 'Pessoa de Teste', 'Instituição de Teste',
    'CONTRATANTE', 'CONTRATADA', 'TESTEMUNHA 1', 'TESTEMUNHA 2']) {
    assert.ok(finalText.includes(compact(value)), `Encerramento completo: ${value}`);
  }
  assert.ok(!finalText.includes(compact(bodyLine)), 'Não repete o corpo da página anterior');
});

test('palavras em caixa alta mantêm o espaço visual e selecionável antes da palavra seguinte', async () => {
  const document = fixture(['CONTRATANTE declara ciência.\nCONTRATADA realizará a prestação.']);
  const result = await createContratosAlunoPdf([document]);
  const pages = await extract(result.blob);
  const text = pages[0].map(item => item.str).join('');
  assert.match(text, /CONTRATANTE\s+declara/u);
  assert.match(text, /CONTRATADA\s+realizará/u);
});

test('QR mantém coordenadas configuradas e mede código e validade sem cortar linhas', async () => {
  const source = fixture();
  source.renderPayload.template.layoutEncerramento = {
    version: 1,
    elements: {
      qr: { x: 165, y: 245, width: 25 },
      contratante: { x: 18, y: 240, width: 62 },
      contratada: { x: 90, y: 245, width: 62 },
      testemunha1: { x: 18, y: 262, width: 62 },
      testemunha2: { x: 100, y: 266, width: 62 },
    },
  };
  const layout = getContractQrLayout(new jsPDF({ unit: 'mm', format: 'a4' }), readContractVisualDocument(source), source.validationCode);
  assert.deepEqual(layout.position, { x: 165, y: 245, width: 25 });
  assert.equal(layout.imageSize, 22);
  await verifyDocument(source, 'contract-v4-custom-qr');
});

test('conteúdo incompatível falha explicitamente em vez de sair cortado', async () => {
  for (const body of [Array(60).fill(bodyLine).join('\n'), 'W'.repeat(200)]) {
    await assert.rejects(createContratosAlunoPdf([fixture([body])]), /área segura|largura segura/u);
  }
  const longTitle = fixture();
  longTitle.renderPayload.rendered.pages[0].title = 'Título extenso '.repeat(40);
  await assert.rejects(createContratosAlunoPdf([longTitle]), /título.*área segura/u);
  const misplacedFooter = fixture([bodyLine, bodyLine]);
  misplacedFooter.renderPayload.rendered.pages[0].footer = 'Texto canônico que não pode ser omitido.';
  await assert.rejects(createContratosAlunoPdf([misplacedFooter]), /encerramento fora da última/u);
});

test('QR longo sem espaço adicional falha antes de sobrepor o rodapé', async () => {
  const source = fixture();
  source.renderPayload.rendered.qr.validityLabel = 'Validade canônica detalhada '.repeat(100);
  await assert.rejects(createContratosAlunoPdf([source]), /validade do QR ultrapassam/u);
});

test('QR ampliado não invade posições de assinatura que eram válidas para a caixa antiga', async () => {
  const source = fixture();
  source.renderPayload.template.layoutEncerramento = { version: 1, elements: {
    qr: { x: 18, y: 240, width: 20 },
    contratante: { x: 90, y: 228, width: 62 },
    contratada: { x: 90, y: 244, width: 62 },
    testemunha1: { x: 18, y: 269, width: 62 },
    testemunha2: { x: 90, y: 269, width: 62 },
  } };
  await assert.rejects(createContratosAlunoPdf([source]), /QR sobrepõe/u);
});

if (process.env.CONTRACT_LEGIBILITY_FIXTURE) {
  test('payload canônico completo mantém todas as páginas e palavras no compositor oficial', async () => {
    const payload = JSON.parse(await readFile(process.env.CONTRACT_LEGIBILITY_FIXTURE, 'utf8'));
    const source = payload.renderPayload ? payload : {
      ...fixture(), validationCode: payload.rendered.qr.code,
      renderPayload: normalizeCanonicalDocumentRenderPayload(payload),
    };
    await verifyDocument(source, 'contract-v4-full-canonical');
  });
}
