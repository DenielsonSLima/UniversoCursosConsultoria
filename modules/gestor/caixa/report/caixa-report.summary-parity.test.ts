import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { formatCaixaCurrency } from '../caixa.formatters';
import { createCaixaConcisePdfDocument } from './caixa-report.concise-pdf';
import { makeCaixaReportFixture } from './caixa-report.fixture';
import { createCaixaReportPdfDocument } from './caixa-report.vector-pdf';

const origins = [
  ['EAD', 'Cursos EAD'],
  ['LIVRE', 'Cursos livres'],
  ['TECNICO', 'Cursos técnicos'],
  ['ESPECIALIZACAO', 'Especialização'],
  ['SUPERIOR', 'Ensino superior'],
  ['SERVICOS_NFSE', 'Serviços NFS-e'],
  ['OUTROS_CREDITOS', 'Outros créditos'],
  ['A_CLASSIFICAR', 'A classificar'],
] as const;

function makeReport(serviceAmount = 606.66) {
  const report = makeCaixaReportFixture();
  report.resumo.receitasPorModalidade = origins.map(([codigo, rotulo], index) => ({
    codigo, rotulo, valor: codigo === 'SERVICOS_NFSE' ? serviceAmount : (index + 1) * 101.11,
    quantidade: codigo === 'SERVICOS_NFSE' && serviceAmount === 0 ? 0 : 1, percentual: 0,
  }));
  const total = report.resumo.receitasPorModalidade.reduce((sum, row) => sum + row.valor, 0);
  const template = report.recebimentos[0];
  report.recebimentos = report.resumo.receitasPorModalidade.filter(row => row.quantidade > 0).map(row => ({
    ...template, id: `receipt-${row.codigo}`, modalidade: row.codigo, descricao: row.rotulo,
    valorBase: row.valor, valorRecebido: row.valor, desconto: 0,
  }));
  report.totaisRecebimentos = {
    ...report.totaisRecebimentos, valorBase: total, valorFinal: total, descontoIdentificado: 0,
    quantidade: report.recebimentos.length,
  };
  Object.assign(report.resumo.resumoCompetencia, {
    entradasRecebidasBrutas: total, resultado: total, quantidadeRecebimentos: report.recebimentos.length,
  });
  return report;
}

async function resources() {
  const fonts = await Promise.all([
    ['regular', 'Regular'], ['medium', 'Medium'], ['semiBold', 'SemiBold'],
    ['bold', 'Bold'], ['extraBold', 'ExtraBold'], ['black', 'Black'],
  ].map(async ([key, suffix]) => {
    const bytes = await readFile(resolve(`public/fonts/Inter-${suffix}.ttf`));
    return [`${key}FontBuffer`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)];
  }));
  return Object.fromEntries(fonts);
}

type ExtractedItem = { str: string; transform: number[]; width: number; height: number; fontName: string };
type ExtractedPage = { items: ExtractedItem[]; width: number; height: number };
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

async function extract(bytes: ArrayBuffer, pageNumbers: number[]): Promise<ExtractedPage[]> {
  const require = createRequire(resolve('package.json'));
  const { getDocument } = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const document = await task.promise;
  try {
    return await Promise.all(pageNumbers.map(async number => {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      return {
        width: viewport.width, height: viewport.height,
        items: content.items.filter((item: { str?: string }) => Boolean(item.str?.trim()))
          .map((item: ExtractedItem) => ({ ...item, str: normalize(item.str),
            fontName: item.fontName.replace(/^g_d\d+_/, '') })),
      };
    }));
  } finally { await task.destroy(); }
}

function assertOrigins(page: ExtractedPage, report: ReturnType<typeof makeReport>) {
  const strings = page.items.map(item => item.str);
  assert(strings.includes('ORIGEM DAS ENTRADAS'));
  assert(strings.includes('RECEITAS RECEBIDAS POR MODALIDADE'));
  for (const origin of report.resumo.receitasPorModalidade) {
    const index = strings.indexOf(origin.rotulo);
    assert(index >= 0, `Origem integral ausente: ${origin.rotulo}`);
    const label = page.items[index];
    const amount = page.items.slice(index + 1, index + 4)
      .find(item => item.str === normalize(formatCaixaCurrency(origin.valor)));
    assert(amount, `Valor canônico ausente para ${origin.rotulo}`);
    assert(amount.transform[4] > label.transform[4], 'Valor deve permanecer à direita de sua origem');
    assert(Math.abs(amount.transform[5] - label.transform[5]) < 4, 'Valor deve permanecer na linha da origem');
    assert(label.transform[5] > 35, 'A última origem deve permanecer acima do rodapé');
  }
  assert(!strings.some(value => /…|\.{3}$/.test(value)), 'O resumo não deve ocultar dados com reticências');
  for (const item of page.items) {
    assert(item.transform[4] >= 0 && item.transform[4] + item.width < page.width + 0.1, `Texto cortado horizontalmente: ${item.str}`);
    assert(item.transform[5] >= 0 && item.transform[5] <= page.height, `Texto fora da página: ${item.str}`);
  }
}

function mainMetrics(page: ExtractedPage) {
  const start = page.items.findIndex(item => item.str === 'POSIÇÃO TOTAL NO CORTE');
  const end = page.items.findIndex(item => item.str === 'ORIGEM DAS ENTRADAS');
  assert(start >= 0 && end > start);
  const items = page.items.slice(start, end);
  for (const heading of ['ENTRADAS RECEBIDAS', 'SAÍDAS PAGAS', 'RECEITAS FUTURAS',
    'COMPOSIÇÃO DOS RECEBIMENTOS', 'COMPOSIÇÃO DAS DESPESAS']) {
    assert(items.some(item => item.str === heading), `Seção principal ausente: ${heading}`);
  }
  return items.map(({ str, transform, width, height, fontName }) => ({ str, transform, width, height, fontName }));
}

test('completo inclui as oito origens canônicas e resumido preserva geometria e fontes dos indicadores e composições', async () => {
  const report = makeReport();
  const fonts = await resources();
  const complete = await createCaixaReportPdfDocument(report, undefined, fonts);
  const concise = await createCaixaConcisePdfDocument(report, undefined, fonts);
  assert.equal(concise.getNumberOfPages(), 2);
  assert.match(complete.output(), /\/FontFile2\b/);
  assert.match(concise.output(), /\/FontFile2\b/);
  const [[overview], [conciseOverview, conciseOrigins]] = await Promise.all([
    extract(complete.output('arraybuffer'), [1]),
    extract(concise.output('arraybuffer'), [1, 2]),
  ]);
  assertOrigins(overview, report);
  assertOrigins(conciseOverview, report);
  assertOrigins(conciseOrigins, report);
  assert.deepEqual(mainMetrics(conciseOverview), mainMetrics(overview));
  assert(overview.items.some(item => item.str === '1 recebimento(s) · NFS-e de serviço emitida'));
});

test('serviços sem recebimento confirmado continuam explícitos com valor zero no completo', async () => {
  const report = makeReport(0);
  const complete = await createCaixaReportPdfDocument(report, undefined, await resources());
  const [overview] = await extract(complete.output('arraybuffer'), [1]);
  assertOrigins(overview, report);
  assert(overview.items.some(item => item.str === '0 recebimento(s) · NFS-e de serviço emitida'));
});

test('cursos omitidos no resumido apontam para o relatório completo sem criar referência a seção inexistente', async () => {
  const report = makeReport();
  report.resumoCursos.itens = Array.from({ length: 4 }, (_, index) => ({
    cursoId: `course-${index}`, curso: `Curso de teste ${index + 1}`, modalidade: 'TECNICO',
    previstoNoMes: 400, recebidoNoMes: 300, emAtraso: 100, quantidadeParcelas: 4,
    quantidadeRecebidas: 3, quantidadeEmAtraso: 1, quantidadeTurmas: 1, quantidadeAlunos: 4,
  }));
  report.resumoCursos.quantidadeCursos = 7;
  report.resumoCursos.quantidadeOmitidas = 3;
  const fonts = await resources();
  const complete = await createCaixaReportPdfDocument(report, undefined, fonts);
  const concise = await createCaixaConcisePdfDocument(report, undefined, fonts);
  const [[overview], [conciseOverview]] = await Promise.all([
    extract(complete.output('arraybuffer'), [1]),
    extract(concise.output('arraybuffer'), [1]),
  ]);
  assert(overview.items.some(item => item.str === '+ 3 curso(s) na Seção 4'));
  assert(conciseOverview.items.some(item => item.str === '+ 3 curso(s) no relatório completo'));
  assert(!conciseOverview.items.some(item => item.str.includes('Seção 4')));
  assert.equal(concise.getNumberOfPages(), 2);
});
