import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';

import {
  buildFinancialReportPdf,
  createFinancialReportPdfDocument,
  financialReportValueToText,
  inspectFinancialReportPdfOperatorsForTest,
  FINANCIAL_REPORT_PDF_PIPELINE,
  type FinancialReportPdfInput,
} from './financial-report.vector-pdf';
import { FinancialReportStatusBadge } from './FinancialReportPreview';
import { normalizeCanonicalPdfWatermarkStyle } from '../../secretaria/shared/canonical-document-vector-pdf';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const makeInput = (count = 26): FinancialReportPdfInput => ({
  title: 'Relatório de Receitas',
  subtitle: 'Receitas operacionais filtradas pelo contrato financeiro canônico.',
  rightTitle: 'Relatórios Financeiros',
  rightType: 'Receitas Operacionais',
  fileName: 'relatorio-receitas-2026-08-12',
  columns: [
    { label: 'Vencimento' },
    { label: 'Descrição / contraparte' },
    { label: 'Categoria' },
    { label: 'Previsto', align: 'right' },
    { label: 'Realizado', align: 'right' },
  ],
  rows: Array.from({ length: count }, (_, index) => ({
    id: `receipt-${index + 1}`,
    cells: [
      `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
      `Receita ${index + 1} da matrícula do aluno ${index + 1}`,
      'Mensalidade',
      'R$ 99,90',
      index % 2 === 0 ? 'R$ 99,90' : '—',
    ],
  })),
  filters: [
    { label: 'Período', value: '01/08/2026 a 31/08/2026' },
    { label: 'Escopo', value: 'Matriz' },
    { label: 'Situação', value: 'Ativos' },
  ],
  summaryCards: [
    { label: 'Total previsto', value: 'R$ 2.597,40', tone: 'slate' },
    { label: 'Total realizado', value: 'R$ 1.298,70', tone: 'emerald' },
  ],
  footerNote: 'Valores e saldos são calculados pelo contrato financeiro canônico.',
  recordLabel: 'lançamentos',
  tone: 'emerald',
  issuedAt: new Date('2026-08-12T15:00:00.000Z'),
  company: {
    nomeFantasia: 'Universo Cursos e Consultoria',
    cnpj: '13.278.137/0001-54',
    endereco: 'Rua C',
    numero: 'S/N',
    bairro: 'Centro',
    cidade: 'Japoatã',
    uf: 'SE',
    cep: '49950-000',
    telefone: '(79) 99861-7614',
    tipo: 'Matriz',
  },
});

test('normaliza células React em texto selecionável antes da composição', () => {
  assert.equal(financialReportValueToText(['Receita ', 42, '  confirmada']), 'Receita 42 confirmada');
  assert.equal(
    financialReportValueToText(React.createElement(FinancialReportStatusBadge, { status: 'PAGO' })),
    'PAGO',
  );
  assert.equal(financialReportValueToText(null), '');
});

test('preserva o texto explícito do badge de status dentro da tabela PDF', async () => {
  const input = makeInput(1);
  input.rows[0].cells[2] = React.createElement(FinancialReportStatusBadge, { status: 'PAGO' });
  const pdf = await createFinancialReportPdfDocument(input);
  assert.match(pdf.output(), /PAGO/);
});

test('gera relatório financeiro vetorial paginado, com texto e sem imagem de página', async () => {
  const pdf = await createFinancialReportPdfDocument(makeInput());
  const pages = inspectFinancialReportPdfOperatorsForTest(pdf);
  const source = pdf.output();

  assert.equal(FINANCIAL_REPORT_PDF_PIPELINE, 'native-vector');
  assert.ok(pages.length >= 2);
  assert.ok(pages.every((page) => page.hasTextOperator));
  assert.ok(pages.every((page) => page.imageDrawCount === 1));
  assert.ok(pages.every((page) => page.hasRotatedImageMatrix));
  assert.match(source, /Receita 1/);
  assert.match(source, /Receita 26/);
  assert.match(source, /CONTINUA/);
  assert.doesNotMatch(source, /html2canvas|financeiro-report-page/i);
  assert.match(source, /\/ca 0\.03/);

  if (process.env.FINANCIAL_REPORT_PDF_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.FINANCIAL_REPORT_PDF_FIXTURE_OUTPUT,
      new Uint8Array(pdf.output('arraybuffer')),
    );
  }
});

test('falha explicitamente antes de desenhar uma linha que não cabe na A4', async () => {
  const input = makeInput(1);
  input.rows[0].cells[1] = 'Detalhamento operacional muito longo '.repeat(600);

  await assert.rejects(
    () => createFinancialReportPdfDocument(input),
    /registro receipt-1 é longo demais para caber integralmente em uma página A4/i,
  );
});

test('entrega Blob PDF para a mesma prévia, download e impressão', async () => {
  const blob = await buildFinancialReportPdf(makeInput(1));
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 0);
});

test('preserva opacidade, escala e rotação da marca configurada no PDF vetorial', async () => {
  assert.deepEqual(normalizeCanonicalPdfWatermarkStyle({
    enabled: true,
    imageUrl: ONE_PIXEL_PNG,
    label: null,
    opacity: 0.32,
    scale: 30,
    rotate: true,
  }, 45), { opacity: 0.32, scale: 30, rotation: 45 });

  const smallInput = makeInput(1);
  smallInput.polo = {
    watermark_url: ONE_PIXEL_PNG,
    watermark_opacity: 0.32,
    watermark_scale: 30,
    watermark_rotate: true,
  };
  const largeInput = makeInput(1);
  largeInput.polo = {
    watermarkUrl: ONE_PIXEL_PNG,
    watermarkOpacity: 0.32,
    watermarkScale: 80,
    watermarkRotate: true,
  };
  const unrotatedInput = makeInput(1);
  unrotatedInput.polo = {
    watermarkUrl: ONE_PIXEL_PNG,
    watermarkOpacity: 0.32,
    watermarkScale: 30,
    watermarkRotate: false,
  };

  const [smallPdf, largePdf, unrotatedPdf] = await Promise.all([
    createFinancialReportPdfDocument(smallInput),
    createFinancialReportPdfDocument(largeInput),
    createFinancialReportPdfDocument(unrotatedInput),
  ]);
  const small = inspectFinancialReportPdfOperatorsForTest(smallPdf)[0];
  const large = inspectFinancialReportPdfOperatorsForTest(largePdf)[0];
  const unrotated = inspectFinancialReportPdfOperatorsForTest(unrotatedPdf)[0];
  const smallScale = small.imageScaleMatrices[0]?.a ?? 0;
  const largeScale = large.imageScaleMatrices[0]?.a ?? 0;

  assert.equal(small.imageDrawCount, 1);
  assert.equal(small.hasRotatedImageMatrix, true);
  assert.equal(unrotated.hasRotatedImageMatrix, false);
  assert.ok(largeScale > smallScale * 2.5, `${largeScale} deveria superar ${smallScale}`);
  assert.equal(small.hasTextOperator, true);
  assert.equal(small.hasVectorGeometry, true);
  assert.match(smallPdf.output(), /\/ca 0\.32/);

  if (process.env.FINANCIAL_REPORT_WATERMARK_FIXTURE_OUTPUT) {
    await writeFile(
      process.env.FINANCIAL_REPORT_WATERMARK_FIXTURE_OUTPUT,
      new Uint8Array(smallPdf.output('arraybuffer')),
    );
  }
});

test('imagem legada sem campo rotate permanece sem rotação implícita', async () => {
  assert.equal(normalizeCanonicalPdfWatermarkStyle({
    enabled: true,
    imageUrl: ONE_PIXEL_PNG,
    label: null,
    opacity: 0.1,
    scale: 50,
  }, 45, { hasImage: true }).rotation, 0);
  assert.equal(normalizeCanonicalPdfWatermarkStyle({
    enabled: true,
    imageUrl: null,
    label: 'UNIVERSO',
    opacity: 0.03,
    scale: 50,
  }, 45, { hasImage: false }).rotation, 45);

  const input = makeInput(1);
  input.polo = {
    watermark_url: ONE_PIXEL_PNG,
    watermark_opacity: 0.1,
    watermark_scale: 50,
  };
  const pdf = await createFinancialReportPdfDocument(input);
  assert.equal(inspectFinancialReportPdfOperatorsForTest(pdf)[0].hasRotatedImageMatrix, false);
});

test('logo configurada inválida falha e ausência de logo mantém o fallback canônico', async () => {
  for (const logoUrl of [
    'unsupported://logo-institucional',
    'data:image/png;base64,AAAA',
  ]) {
    const invalid = makeInput(1);
    invalid.company = { ...invalid.company, logoUrl };
    await assert.rejects(
      () => createFinancialReportPdfDocument(invalid),
      /logo institucional configurada/i,
    );
  }

  const withoutLogo = await createFinancialReportPdfDocument(makeInput(1));
  assert.equal(inspectFinancialReportPdfOperatorsForTest(withoutLogo)[0].imageDrawCount, 1);
});

test('congela a data de criação do PDF no issuedAt recebido', async () => {
  const input = makeInput(1);
  input.issuedAt = new Date('2026-08-12T15:27:31.000Z');
  const pdf = await createFinancialReportPdfDocument(input);
  const creationDate = pdf.getCreationDate('jsDate');
  assert.ok(creationDate instanceof Date);
  assert.equal(creationDate.toISOString(), input.issuedAt.toISOString());
});
