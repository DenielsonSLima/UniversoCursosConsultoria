import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import type { CaixaDetailedReport } from './caixa-report.types';
import { CAIXA_REPORT_FONTS_A } from './caixa-report.fonts-a';
import { CAIXA_REPORT_FONTS_B } from './caixa-report.fonts-b';
import {
  buildCaixaAdjustmentLines,
  CAIXA_REPORT_PDF_PIPELINE,
  createCaixaReportPdfDocument,
  getCaixaResultLabel,
  inspectCaixaPdfOperatorsForTest,
} from './caixa-report.vector-pdf';

const getEmbeddedFontFiles = () => [
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_A.regular, 'base64')),
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_A.medium, 'base64')),
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_A.semiBold, 'base64')),
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_B.bold, 'base64')),
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_B.extraBold, 'base64')),
  gunzipSync(Buffer.from(CAIXA_REPORT_FONTS_B.black, 'base64')),
] as const;

const emptyTotals = {
  valorBase: 0,
  jurosIdentificados: 0,
  multaIdentificada: 0,
  acrescimoIdentificado: 0,
  descontoIdentificado: 0,
  diferencaNaoDiscriminada: 0,
  valorFinal: 0,
  quantidade: 0,
  quantidadeNaoDiscriminada: 0,
};

const recurringTotals = {
  previstoNoMes: 0,
  recebidoNoMes: 0,
  emAtraso: 0,
  valorBaseRecebido: 0,
  juros: 0,
  multa: 0,
  acrescimo: 0,
  desconto: 0,
  diferencaNaoDiscriminada: 0,
  quantidadeParcelas: 0,
  quantidadeRecebidas: 0,
  quantidadeEmAtraso: 0,
  quantidadeCursos: 0,
  quantidadeTurmas: 0,
  quantidadeAlunos: 0,
};

const makeReport = (): CaixaDetailedReport => ({
  versao: 3,
  geradoEm: '2026-08-06T03:00:00Z',
  completo: true,
  confidencial: true,
  limitePorTabela: 300,
  limiteTotal: 300,
  institucional: {
    id: null,
    nome: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    cidade: 'Japoatã',
    estado: 'SE',
    endereco: 'Rua C',
    numero: 'S/N',
    bairro: 'Centro',
    cep: '49950-000',
    telefone: '(79) 99602-8316',
    email: '',
    logo_url: null,
    is_matriz: true,
    watermark_url: null,
    watermark_opacity: 0.1,
    watermark_scale: 100,
    watermark_rotate: false,
    landscape_watermark_url: null,
    landscape_watermark_opacity: 0.1,
    landscape_watermark_scale: 100,
    landscape_watermark_rotate: false,
  },
  resumo: {
    versao: 2,
    meta: {
      competencia: '2026-08-01',
      periodoInicio: '2026-08-01',
      periodoFimExclusivo: '2026-09-01',
      geradoEm: '2026-08-06T03:00:00Z',
      escopoTipo: 'POLO',
      poloId: null,
      escopoRotulo: 'Universo Cursos e Consultoria · Japoatã/SE',
      fonteSaldo: 'CONTABIL_SISTEMA',
      extratoBancarioDisponivel: false,
    },
    saldosHoje: { registradoTotal: 15.8, bancarioRegistrado: 15.8, caixaLocal: 0, compartilhadoTotal: 15.8, posicaoCompartilhadaEscopo: 15.8, naoAtribuido: 0 },
    resumoCompetencia: { entradasRecebidasBrutas: 0.9, tarifasBancariasConfirmadas: 0, saidasPagas: 0, resultado: 0.9, resultadoStatus: 'POSITIVO', quantidadeRecebimentos: 1, quantidadePagamentos: 0 },
    compromissos: { aReceber: 0, receberVencido: 0, aPagar: 0, pagarVencido: 0 },
    receitasPorModalidade: [
      { codigo: 'EAD', rotulo: 'Cursos EAD', valor: 0.9, quantidade: 1, percentual: 100 },
      { codigo: 'ESPECIALIZACAO', rotulo: 'Especialização', valor: 0, quantidade: 0, percentual: 0 },
      { codigo: 'TECNICO', rotulo: 'Cursos técnicos', valor: 0, quantidade: 0, percentual: 0 },
      { codigo: 'LIVRE', rotulo: 'Cursos livres', valor: 0, quantidade: 0, percentual: 0 },
    ],
    despesasPorCategoria: [],
    serieMensal: [],
    contas: [],
    classificacao: { quantidadeSemPolo: 0, valorSemPolo: 0 },
    conciliacao: { recebimentosConciliados: 1, pagamentosConciliados: 0, pendentes: 0, ultimaAtualizacao: null },
    qualidadeDados: { movimentosSemPolo: 0, pagamentosSemConta: 0, pagamentosSemData: 0, receitasSemModalidade: 0, tarifasEstimadasIgnoradas: 0 },
  },
  totaisRecebimentos: { ...emptyTotals, valorBase: 99.9, descontoIdentificado: 99, valorFinal: 0.9, quantidade: 1 },
  totaisDespesas: { ...emptyTotals },
  resumoCursos: { itens: [], quantidadeCursos: 0, quantidadeOmitidas: 0, totais: { previstoNoMes: 0, recebidoNoMes: 0, emAtraso: 0, quantidadeTurmas: 0, quantidadeAlunos: 0 } },
  analiseRecorrente: { modalidades: [], turmas: [], totais: recurringTotals },
  recebimentos: [{
    id: 'receipt-1',
    dataPagamento: '2026-08-05',
    dataVencimento: '2026-08-12',
    descricao: 'Aperfeiçoamento em Educação Interdimensional - Inscrição Online',
    pagador: 'EDUARDO THOMAS DE LIMA E SILVA',
    polo: 'Universo Cursos e Consultoria · Japoatã/SE',
    curso: 'Aperfeiçoamento em Educação Interdimensional',
    modalidade: 'EAD',
    turma: 'EAD Turma Única',
    parcelaNumero: null,
    totalParcelas: null,
    tipoLancamento: 'MATRICULA',
    formaPagamento: 'BOLETO',
    conta: 'CAIXA DA UNIDADE · Ag. CAIXA · Conta CX-0001',
    valorBase: 99.9,
    juros: 0,
    multa: 0,
    acrescimo: 0,
    desconto: 99,
    diferencaNaoDiscriminada: 0,
    composicaoStatus: 'COMPOSICAO_EXPLICITA',
    valorRecebido: 0.9,
  }],
  despesas: [],
});

test('gera páginas com texto vetorial visível, Inter incorporada e nenhuma captura full-page', async () => {
  const [regularFont, mediumFont, semiBoldFont, boldFont, extraBoldFont, blackFont] = getEmbeddedFontFiles();
  const report = makeReport();
  const pdf = await createCaixaReportPdfDocument(
    report,
    undefined,
    {
      regularFontBuffer: regularFont.buffer.slice(
        regularFont.byteOffset,
        regularFont.byteOffset + regularFont.byteLength,
      ),
      mediumFontBuffer: mediumFont.buffer.slice(
        mediumFont.byteOffset,
        mediumFont.byteOffset + mediumFont.byteLength,
      ),
      semiBoldFontBuffer: semiBoldFont.buffer.slice(
        semiBoldFont.byteOffset,
        semiBoldFont.byteOffset + semiBoldFont.byteLength,
      ),
      boldFontBuffer: boldFont.buffer.slice(
        boldFont.byteOffset,
        boldFont.byteOffset + boldFont.byteLength,
      ),
      extraBoldFontBuffer: extraBoldFont.buffer.slice(
        extraBoldFont.byteOffset,
        extraBoldFont.byteOffset + extraBoldFont.byteLength,
      ),
      blackFontBuffer: blackFont.buffer.slice(
        blackFont.byteOffset,
        blackFont.byteOffset + blackFont.byteLength,
      ),
    },
  );
  const pages = inspectCaixaPdfOperatorsForTest(pdf);
  const source = pdf.output();

  assert.equal(CAIXA_REPORT_PDF_PIPELINE, 'native-vector');
  assert.equal(pages.length, 4);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 0));
  assert.doesNotMatch(source, /\b3\s+Tr\b/);
  assert.match(source, /\/FontFile2\b/);
  assert.ok(Object.hasOwn(pdf.getFontList(), 'InterUniverso'));
  if (process.env.CAIXA_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CAIXA_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('mantém conteúdo vetorial quando logo e marca paisagem são imagens decorativas', async () => {
  const [regularFont, mediumFont, semiBoldFont, boldFont, extraBoldFont, blackFont] = getEmbeddedFontFiles();
  const logoFile = await readFile(resolve('public/LogoUniverso.png'));
  const asArrayBuffer = (file: Uint8Array) => file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  const logoDataUrl = `data:image/png;base64,${logoFile.toString('base64')}`;
  const report = makeReport();
  report.institucional.landscape_watermark_url = logoDataUrl;
  report.institucional.landscape_watermark_opacity = 0.12;
  report.institucional.landscape_watermark_scale = 55;
  report.institucional.landscape_watermark_rotate = true;
  const pdf = await createCaixaReportPdfDocument(report, undefined, {
    regularFontBuffer: asArrayBuffer(regularFont),
    mediumFontBuffer: asArrayBuffer(mediumFont),
    semiBoldFontBuffer: asArrayBuffer(semiBoldFont),
    boldFontBuffer: asArrayBuffer(boldFont),
    extraBoldFontBuffer: asArrayBuffer(extraBoldFont),
    blackFontBuffer: asArrayBuffer(blackFont),
    logoDataUrl,
    backgroundDataUrl: logoDataUrl,
  });
  const pages = inspectCaixaPdfOperatorsForTest(pdf);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 2));
  assert.doesNotMatch(pdf.output(), /\b3\s+Tr\b/);
  if (process.env.CAIXA_BRANDED_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CAIXA_BRANDED_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('preserva rótulo do resultado e diferença financeira não discriminada', () => {
  assert.equal(getCaixaResultLabel('NEGATIVO'), 'Déficit do mês');
  assert.equal(getCaixaResultLabel('POSITIVO'), 'Superávit do mês');
  assert.equal(getCaixaResultLabel('NEUTRO'), 'Resultado do mês');
  const receipt = makeReport().recebimentos[0];
  receipt.diferencaNaoDiscriminada = 7.25;
  assert.deepEqual(buildCaixaAdjustmentLines(receipt).at(-1), 'Não discrim.: R$\u00a07,25');
});
