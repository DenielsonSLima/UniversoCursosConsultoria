import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { makeCaixaReportFixture as makeReport } from './caixa-report.fixture';
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
  assert.equal(pages.length, 6);
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
  report.convenios = { disponivel: false, motivo: 'ACESSO_RESTRITO' };

  const pdf = await createCaixaReportPdfDocument(report, undefined, {
    regularFontBuffer: asArrayBuffer(regularFont),
    mediumFontBuffer: asArrayBuffer(mediumFont),
    semiBoldFontBuffer: asArrayBuffer(semiBoldFont),
    boldFontBuffer: asArrayBuffer(boldFont),
    extraBoldFontBuffer: asArrayBuffer(extraBoldFont),
    blackFontBuffer: asArrayBuffer(blackFont),
  });
  const pages = inspectCaixaPdfOperatorsForTest(pdf);

  assert.equal(pages.length, 6);
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
  assert.deepEqual(buildCaixaAdjustmentLines(receipt).at(-1), 'Diferença a conferir: R$\u00a07,25');
});

test('PDF diferencia cálculo informado, dados API e prova Proesc sem ocultar o residual', () => {
  const receipt = makeReport().recebimentos[0];
  for (const [status, label] of [
    ['CALCULADO_REGRA_INFORMADA_PROESC', 'Calculado pelas regras informadas'],
    ['API_E_REGRA_INFORMADA_PROESC', 'API Proesc + cálculo pelas regras'],
    ['PARCIAL_POR_API_PROESC', 'Dados explícitos da API Proesc'],
    ['CONCILIADO_POR_CONFERENCIA_PROESC', 'Conferido no Proesc'],
  ] as const) {
    receipt.composicaoStatus = status;
    receipt.diferencaNaoDiscriminada = -19.9;
    const lines = buildCaixaAdjustmentLines(receipt);
    assert.equal(lines[0], label);
    assert.match(lines.at(-1)!, /Diferença a conferir: -R\$\s19,90/);
  }
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
  const [
    sourceMain,
    summarySource,
    nonOperationalSource,
    sharedSource,
    documentSource,
    positionsPreviewSource,
    modalSource,
  ] = await Promise.all([
    readFile(resolve('modules/gestor/caixa/report/caixa-report.vector-pdf.ts'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/caixa-report.vector-pdf.summary.ts'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/caixa-report.vector-pdf.non-operational.ts'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/caixa-report.vector-pdf.shared.ts'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportDocument.tsx'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportNonOperationalPositions.tsx'), 'utf8'),
    readFile(resolve('modules/gestor/caixa/report/CaixaReportPreviewModal.tsx'), 'utf8'),
  ]);
  const source = `${sourceMain}\n${summarySource}\n${nonOperationalSource}\n${sharedSource}`;

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

test('indicadores mensais em conferência preservam paginação e exportação vetorial', async () => {
  const report = makeReport();
  report.resumo.compromissos.receberVencido = 1250;
  report.resumo.compromissos.margemInadimplencia = 25;
  report.resumo.compromissos.inadimplenciaMensal = {
    periodoInicio: '2026-08-01', periodoFimExclusivo: '2026-09-01', dataCorte: '2026-08-06',
    baseElegivel: 5000, quantidadeElegiveis: 20, quantidadeEmConferencia: 3,
    valorNominalEmConferencia: 750, completo: false, criterio: 'VENCIMENTO_MENSAL_POSICAO_NO_CORTE',
  };
  const fonts = await Promise.all([
    ['regular', 'Regular'], ['medium', 'Medium'], ['semiBold', 'SemiBold'],
    ['bold', 'Bold'], ['extraBold', 'ExtraBold'], ['black', 'Black'],
  ].map(async ([key, suffix]) => {
    const bytes = await readFile(resolve(`public/fonts/Inter-${suffix}.ttf`));
    return [`${key}FontBuffer`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)];
  }));
  const pdf = await createCaixaReportPdfDocument(report, undefined, Object.fromEntries(fonts));
  const pages = inspectCaixaPdfOperatorsForTest(pdf);
  assert.equal(pages.length, 6);
  assert.ok(pages.every((page) => page.hasTextOperator && page.imageDrawCount === 0));
  if (process.env.CAIXA_PDF_FIXTURE_OUTPUT) {
    await writeFile(`${process.env.CAIXA_PDF_FIXTURE_OUTPUT}.review.pdf`, new Uint8Array(pdf.output('arraybuffer')));
  }
});
