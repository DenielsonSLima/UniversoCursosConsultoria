import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import type { CaixaDetailedReport } from './caixa-report.types';
import {
  getCaixaReportPosicaoTotal,
} from './caixa-report.posicao-total';
import {
  buildCaixaAdjustmentLines,
  CAIXA_REPORT_PDF_PIPELINE,
  createCaixaReportPdfDocument,
  getCaixaResultLabel,
  inspectCaixaPdfOperatorsForTest,
} from './caixa-report.vector-pdf';

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
  versao: 6,
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
    email: 'email-desatualizado@polo.local',
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
  financiamento: {
    disponivel: true,
    dados: {
      competencia: '2026-08-01',
      creditoLiberadoMatriz: 2500,
      obrigacaoRateada: 520,
      principalRateado: 480,
      encargosRateados: 40,
      pagoRateado: 520,
      observacao: 'Financiamento fora do resultado operacional.',
    },
  },
  patrimonio: {
    disponivel: true,
    dados: {
      versao: 1,
      competencia: '2026-08-01',
      escopoTipo: 'POLO',
      poloId: null,
      posicaoFechamento: {
        registrosAtivos: 1,
        unidadesAtivas: 2,
        valorAtivoCusto: '1250.50',
      },
      aquisicoesCompetencia: {
        registros: 1,
        unidades: 2,
        valorCusto: '1250.50',
      },
      perdasCompetencia: {
        movimentos: 0,
        unidades: 0,
        valorCusto: '0.00',
      },
      observacao: 'Patrimônio não altera o resultado operacional.',
    },
  },
  posicaoLiquida: {
    disponivel: true,
    dados: {
      versao: 1,
      competencia: '2026-08-01',
      escopoTipo: 'POLO',
      poloId: null,
      valorPatrimonialCusto: '1250.50',
      saldoEmprestimosAPagar: '520.00',
      valorLiquido: '730.50',
      observacao: 'Patrimônio a custo menos empréstimos a pagar.',
    },
  },
  posicaoTotal: {
    disponivel: true,
    dataCorte: '2026-08-06',
    dados: {
      saldoCaixaRegistrado: '15.80',
      valorPatrimonialCusto: '1250.50',
      saldoEmprestimosAPagar: '520.00',
      valorTotalLiquido: '746.30',
      observacao: 'Caixa registrado no fechamento mais patrimônio a custo menos empréstimos a pagar.',
    },
  },
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
  const [regularFont, mediumFont, semiBoldFont, boldFont, extraBoldFont, blackFont] = await Promise.all([
    readFile(resolve('public/fonts/Inter-Regular.ttf')),
    readFile(resolve('public/fonts/Inter-Medium.ttf')),
    readFile(resolve('public/fonts/Inter-SemiBold.ttf')),
    readFile(resolve('public/fonts/Inter-Bold.ttf')),
    readFile(resolve('public/fonts/Inter-ExtraBold.ttf')),
    readFile(resolve('public/fonts/Inter-Black.ttf')),
  ]);
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
  assert.equal(pages.length, 5);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 0));
  assert.doesNotMatch(source, /\b3\s+Tr\b/);
  assert.match(source, /\/FontFile2\b/);
  assert.match(source, /universo\.cursoseconsultoria@gmail\.com/);
  assert.doesNotMatch(source, /email-desatualizado@polo\.local/);
  assert.match(source, /\(CAIXA /);
  // Text drawn with the embedded Inter subset is encoded as glyph IDs in the
  // PDF stream. Page count and text operators prove the dedicated vector page;
  // textual content is verified through Poppler extraction in the PDF smoke.
  assert.ok(pages[1]?.hasTextOperator);
  assert.ok(Object.hasOwn(pdf.getFontList(), 'InterUniverso'));
  if (process.env.CAIXA_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CAIXA_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('mantém conteúdo vetorial quando logo e marca paisagem são imagens decorativas', async () => {
  const [regularFont, mediumFont, semiBoldFont, boldFont, extraBoldFont, blackFont, logoFile] = await Promise.all([
    readFile(resolve('public/fonts/Inter-Regular.ttf')),
    readFile(resolve('public/fonts/Inter-Medium.ttf')),
    readFile(resolve('public/fonts/Inter-SemiBold.ttf')),
    readFile(resolve('public/fonts/Inter-Bold.ttf')),
    readFile(resolve('public/fonts/Inter-ExtraBold.ttf')),
    readFile(resolve('public/fonts/Inter-Black.ttf')),
    readFile(resolve('public/LogoUniverso.png')),
  ]);
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

test('mantém a prestação operacional quando posições complementares não são autorizadas', async () => {
  const [regularFont, mediumFont, semiBoldFont, boldFont, extraBoldFont, blackFont] = await Promise.all([
    readFile(resolve('public/fonts/Inter-Regular.ttf')),
    readFile(resolve('public/fonts/Inter-Medium.ttf')),
    readFile(resolve('public/fonts/Inter-SemiBold.ttf')),
    readFile(resolve('public/fonts/Inter-Bold.ttf')),
    readFile(resolve('public/fonts/Inter-ExtraBold.ttf')),
    readFile(resolve('public/fonts/Inter-Black.ttf')),
  ]);
  const asArrayBuffer = (file: Uint8Array) => file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  const report = makeReport();
  report.financiamento = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.patrimonio = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.posicaoLiquida = { disponivel: false, motivo: 'ACESSO_RESTRITO' };
  report.posicaoTotal = {
    disponivel: false,
    dataCorte: '2026-08-06',
    motivo: 'ACESSO_RESTRITO',
    observacao: 'Escopo complementar indisponível.',
  };

  const pdf = await createCaixaReportPdfDocument(report, undefined, {
    regularFontBuffer: asArrayBuffer(regularFont),
    mediumFontBuffer: asArrayBuffer(mediumFont),
    semiBoldFontBuffer: asArrayBuffer(semiBoldFont),
    boldFontBuffer: asArrayBuffer(boldFont),
    extraBoldFontBuffer: asArrayBuffer(extraBoldFont),
    blackFontBuffer: asArrayBuffer(blackFont),
  });
  const pages = inspectCaixaPdfOperatorsForTest(pdf);

  assert.equal(pages.length, 5);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 0));
  if (process.env.CAIXA_PDF_RESTRICTED_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.CAIXA_PDF_RESTRICTED_FIXTURE_OUTPUT,
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

test('usa a posição total recebida do backend sem recompor valores no PDF', () => {
  const position = getCaixaReportPosicaoTotal(makeReport());
  assert.ok(position?.disponivel);
  if (!position?.disponivel) throw new Error('A posição total deveria estar disponível neste fixture.');
  assert.equal(position.dados.saldoCaixaRegistrado, '15.80');
  assert.equal(position.dados.valorPatrimonialCusto, '1250.50');
  assert.equal(position.dados.saldoEmprestimosAPagar, '520.00');
  assert.equal(position.dados.valorTotalLiquido, '746.30');
});

test('reutiliza exclusivamente o compositor institucional canônico', async () => {
  const [source, documentSource, positionsPreviewSource, modalSource] = await Promise.all([
    readFile(resolve('modules/gestor/caixa/report/caixa-report.vector-pdf.ts'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportDocument.tsx'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportNonOperationalPositions.tsx'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportPreviewModal.tsx'), 'utf8'),
  ]);

  assert.match(source, /drawCanonicalInstitutionalHeader/);
  assert.match(source, /normalizeCanonicalInstitutionalHeader/);
  assert.match(source, /getCanonicalPdfInlineImage/);
  assert.doesNotMatch(source, /\bconst\s+drawHeader\s*=/);
  assert.doesNotMatch(source, /\bHEADER_BOTTOM\b/);
  assert.match(source, /eyebrow:\s*['"]Caixa · uso interno['"]/);
  assert.match(source, /label:\s*['"]Competência['"]/);
  assert.match(source, /drawNonOperationalPositionsPage/);
  assert.match(source, /drawLiquidPositionBand/);
  assert.match(source, /drawTotalPositionCard/);
  assert.match(source, /POSIÇÃO TOTAL NO CORTE/);
  assert.match(source, /dados\.valorTotalLiquido/);
  assert.match(source, /dados\.saldoCaixaRegistrado/);
  assert.match(source, /formatCaixaCanonicalCurrency\(patrimonio\./);
  assert.match(source, /formatCaixaCanonicalCurrency\(dados\.valorLiquido\)/);
  assert.match(source, /formatCaixaCurrency\(financiamento\./);
  assert.match(source, /drawRestrictedNonOperationalPosition/);
  assert.match(source, /EMITIDO EM/);
  assert.doesNotMatch(source, /GERADO PELO BACKEND/);
  assert.match(documentSource, /meta=\{\{/);
  assert.match(documentSource, /CaixaReportNonOperationalPositions/);
  assert.match(documentSource, /PositionTotalMetric/);
  assert.match(documentSource, /getCaixaReportPosicaoTotal/);
  assert.match(documentSource, /dados\.valorTotalLiquido/);
  assert.match(documentSource, /Emitido em/);
  assert.doesNotMatch(documentSource, /Gerado pelo backend/);
  assert.doesNotMatch(documentSource, /rightContent=/);
  assert.match(positionsPreviewSource, /LiquidPositionBand/);
  assert.doesNotMatch(positionsPreviewSource, /eyebrow="Posição patrimonial líquida"/);
  assert.match(modalSource, /URL\.createObjectURL\(preparedPdf\.blob\)/);
  assert.match(modalSource, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(modalSource, /<iframe/);
  assert.match(modalSource, /downloadPdfBlob\(preparedPdf\.blob, preparedPdf\.fileName\)/);
  assert.doesNotMatch(modalSource, /CaixaReportDocument/);
});
