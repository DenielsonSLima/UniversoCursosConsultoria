import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createCaixaConcisePdfDocument } from './caixa-report.concise-pdf';
import { makeCaixaReportFixture } from './caixa-report.fixture';
import { inspectCaixaPdfOperatorsForTest } from './caixa-report.vector-pdf';
import { prepareCaixaPdfContext } from './caixa-report.vector-pdf.context';
import { drawPageBackground } from './caixa-report.vector-pdf.shared';
import { buildCaixaReportFileName } from './caixa-report.pdf';
import { formatCaixaReportModality } from './caixa-report.presentation';

async function resources() {
  const names = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];
  const fonts = await Promise.all(names.map(name => readFile(`public/fonts/Inter-${name}.ttf`)));
  const buffers = fonts.map(file => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
  return { regularFontBuffer: buffers[0], mediumFontBuffer: buffers[1], semiBoldFontBuffer: buffers[2],
    boldFontBuffer: buffers[3], extraBoldFontBuffer: buffers[4], blackFontBuffer: buffers[5] };
}

/** Independent synthetic summary; the Complete report fixture remains untouched. */
function makeConciseReportFixture() {
  const report = makeCaixaReportFixture();
  report.resumo.meta.escopoTipo = 'GLOBAL'; report.resumo.meta.escopoRotulo = 'Resultado geral · quatro unidades';
  for (const section of [report.patrimonio, report.posicaoLiquida, report.convenios]) {
    if (section.disponivel) section.dados.escopoTipo = 'GLOBAL';
  }
  report.resumo.receitasPorModalidade = ['EAD', 'Livre', 'Técnico', 'Especialização', 'Superior', 'Outros créditos', 'A classificar', 'Serviços NFS-e']
    .map((rotulo, index) => ({ codigo: String(index), rotulo, valor: 16383.71, quantidade: 4, percentual: 12.5 }));
  report.resumo.despesasPorCategoria = ['Administrativas', 'Operacionais', 'Pessoal', 'Fornecedores', 'Taxas bancárias', 'Outras despesas']
    .map((rotulo, index) => ({ codigo: String(index), rotulo, valor: 1000, quantidade: 2, percentual: 16.67 }));
  report.totaisRecebimentos = { valorBase: 131069.68, jurosIdentificados: 0, multaIdentificada: 0,
    acrescimoIdentificado: 0, descontoIdentificado: 0, diferencaNaoDiscriminada: 0, valorFinal: 131069.68,
    quantidade: 32, quantidadeNaoDiscriminada: 0 };
  report.totaisDespesas = { valorBase: 6000, jurosIdentificados: 0, multaIdentificada: 0,
    acrescimoIdentificado: 0, descontoIdentificado: 0, diferencaNaoDiscriminada: 0, valorFinal: 6000,
    quantidade: 12, quantidadeNaoDiscriminada: 0 };
  report.resumo.resumoCompetencia = { entradasRecebidasBrutas: 131069.68, tarifasBancariasConfirmadas: 0,
    saidasPagas: 6000, resultado: 125069.68, resultadoStatus: 'POSITIVO', quantidadeRecebimentos: 32, quantidadePagamentos: 12 };
  return report;
}

async function extractedPages(bytes: Uint8Array) {
  const require = createRequire(resolve('package.json'));
  const { getDocument } = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task = getDocument({ data: bytes, verbosity: 0 });
  const document = await task.promise;
  try {
    return await Promise.all([1, 2].map(async pageNumber => {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      return content.items.map((item: { str?: string }) => item.str || '').join(' ');
    }));
  } finally { await task.destroy(); }
}

test('resumido do Resultado geral usa agregados canônicos e mantém duas páginas sem consultar movimentos individuais', async () => {
  const report = makeConciseReportFixture();
  assert.equal(Math.round(report.resumo.receitasPorModalidade.reduce((total, row) => total + row.valor, 0) * 100), 13106968);
  assert.equal(report.resumo.despesasPorCategoria.reduce((total, row) => total + row.valor, 0), 6000);
  const before = globalThis.structuredClone(report.resumo);
  for (const field of ['recebimentos', 'despesas', 'analiseRecorrente'] as const) {
    Object.defineProperty(report, field, { get() { throw new Error('Individual ledger is not a summary data source'); } });
  }
  const progress: number[] = [];
  const pdf = await createCaixaConcisePdfDocument(report, current => progress.push(current), await resources());
  assert.equal(pdf.getNumberOfPages(), 2); assert.deepEqual(progress, [1, 2]);
  assert.deepEqual(report.resumo, before); assert.match(pdf.output(), /\/FontFile2\b/);
  assert(inspectCaixaPdfOperatorsForTest(pdf).every(page => page.hasTextOperator && page.imageDrawCount === 0));
  const [overview, origins] = await extractedPages(new Uint8Array(pdf.output('arraybuffer')));
  assert.match(overview, /R\$ 131\.069,68/); assert.match(overview, /R\$ 6\.000,00/); assert.match(overview, /R\$ 125\.069,68/);
  assert.equal((origins.match(/R\$ 16\.383,71/g) || []).length, 8);
  assert.equal((origins.match(/R\$ 1\.000,00/g) || []).length, 6);
  assert.match(origins, /Serviços NFS-e/);
  if (process.env.CAIXA_CONCISE_PDF_FIXTURE_OUTPUT) await writeFile(process.env.CAIXA_CONCISE_PDF_FIXTURE_OUTPUT, new Uint8Array(pdf.output('arraybuffer')));
});

test('resumido preserva URL, opacidade, escala e rotação da marca paisagem pelo mesmo contexto do Completo', async () => {
  const report = makeConciseReportFixture();
  const image = `data:image/png;base64,${(await readFile('public/LogoUniverso.png')).toString('base64')}`;
  Object.assign(report.institucional, { landscape_watermark_url: image, landscape_watermark_opacity: 0.21,
    landscape_watermark_scale: 80, landscape_watermark_rotate: true });
  const context = await prepareCaixaPdfContext(report, { ...await resources(), logoDataUrl: image });
  assert.equal(context.background, image); assert.equal(context.backgroundUsesFallback, false);
  const calls: { opacity?: number; image?: unknown[] } = {};
  const fake = { setFillColor() {}, rect() {}, getImageProperties: () => ({ width: 300, height: 100, fileType: 'PNG' }),
    saveGraphicsState() {}, restoreGraphicsState() {}, GState: (value: { opacity: number }) => { calls.opacity = value.opacity; return value; },
    setGState() {}, addImage: (...args: unknown[]) => { calls.image = args; } };
  drawPageBackground(fake as never, report, context.background, context.backgroundUsesFallback);
  assert.equal(calls.opacity, 0.21); assert.equal(calls.image?.[0], image);
  assert.equal(calls.image?.[4], 297 * 0.8); assert.equal(calls.image?.[8], 45);
  report.institucional.landscape_watermark_rotate = false;
  drawPageBackground(fake as never, report, context.background, context.backgroundUsesFallback);
  assert.equal(calls.image?.[8], 0);
  const pdf = await createCaixaConcisePdfDocument(report, undefined, { ...await resources(), logoDataUrl: image, backgroundDataUrl: image });
  assert(inspectCaixaPdfOperatorsForTest(pdf).every(page => page.hasTextOperator && page.imageDrawCount === 2));
  if (process.env.CAIXA_CONCISE_BRANDED_PDF_FIXTURE_OUTPUT) await writeFile(process.env.CAIXA_CONCISE_BRANDED_PDF_FIXTURE_OUTPUT, new Uint8Array(pdf.output('arraybuffer')));
});

test('resumido não corta categorias para caber e indisponibilidade complementar não vira saldo zero', async () => {
  const report = makeCaixaReportFixture();
  report.financiamento = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.patrimonio = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.posicaoLiquida = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.posicaoTotal = { disponivel: false, motivo: 'HISTORICO_INSUFICIENTE', dataCorte: '2026-08-06', observacao: 'Histórico indisponível.' };
  assert.equal((await createCaixaConcisePdfDocument(report, undefined, await resources())).getNumberOfPages(), 2);
  report.resumo.despesasPorCategoria = Array.from({ length: 40 }, (_, index) => ({ codigo: String(index), rotulo: `Categoria ${index}`, valor: 10, quantidade: 1, percentual: 1 }));
  await assert.rejects(createCaixaConcisePdfDocument(report, undefined, await resources()), /duas páginas/);
});

test('rótulo Serviços NFS-e e nomes de arquivo distinguem os tipos sem alterar o padrão Completo', () => {
  assert.equal(formatCaixaReportModality('SERVICOS_NFSE'), 'Serviços NFS-e'); assert.equal(formatCaixaReportModality('TECNICO'), 'TECNICO');
  assert.equal(buildCaixaReportFileName('2026-11', 'Resultado geral'), 'prestacao-caixa-2026-11-resultado-geral.pdf');
  assert.equal(buildCaixaReportFileName('2026-11', 'Resultado geral', 'RESUMIDO'), 'prestacao-caixa-2026-11-resultado-geral-resumido.pdf');
});
