import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jsPDF } from 'jspdf';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaixaReceiptsTable } from './CaixaReportTables';
import { drawMovementTable } from './caixa-report.vector-pdf.tables';
import { drawComposition } from './caixa-report.vector-pdf.summary';
import { makeCaixaReportFixture } from './caixa-report.fixture';
import { createCaixaReportPdfDocument } from './caixa-report.vector-pdf';
import { CAIXA_PARTIAL_COMPOSITION_NOTE, caixaPartialCompositionLabel } from '../caixa-composicao.presentation';
import { formatCaixaCurrency } from '../caixa.formatters';

const totals = {
  valorBase: 1399.5, jurosIdentificados: 0, multaIdentificada: 0,
  acrescimoIdentificado: 0, descontoIdentificado: 79.6,
  diferencaNaoDiscriminada: -19.9, valorFinal: 1300,
  quantidade: 5, quantidadeNaoDiscriminada: 1,
};

test('resumo nativo identifica subtotal parcial sem alterar valores e sem mudar estado completo', () => {
  const pdf = new jsPDF();
  pdf.setFont = (() => pdf) as typeof pdf.setFont;
  const text: string[] = [];
  pdf.text = ((value: string | string[]) => {
    text.push(...(Array.isArray(value) ? value : [value]));
    return pdf;
  }) as typeof pdf.text;
  drawComposition(pdf, 10, 10, 135, totals, 'emerald');
  assert.ok(text.includes(caixaPartialCompositionLabel(1)!));
  assert.ok(text.includes(CAIXA_PARTIAL_COMPOSITION_NOTE));
  for (const value of [1300, 1399.5, 79.6, -19.9]) {
    assert.ok(text.includes(formatCaixaCurrency(value)));
  }
  assert.equal(caixaPartialCompositionLabel(0), null);
  assert.equal(totals.descontoIdentificado, 79.6);
});

test('prévia usa os mesmos rótulos e não recalcula os subtotais canônicos', async () => {
  const preview = await readFile(resolve('modules/gestor/caixa/report/CaixaReportDocument.tsx'), 'utf8');
  assert.match(preview, /caixaPartialCompositionLabel\(report\.totaisRecebimentos\.quantidadeNaoDiscriminada\)/);
  assert.match(preview, /caixaPartialCompositionLabel\(report\.totaisDespesas\.quantidadeNaoDiscriminada\)/);
  assert.match(preview, /formatCaixaCurrency\(report\.totaisRecebimentos\.descontoIdentificado\)/);
});

test('rodapé nativo e prévia não confundem composição incompleta com diferença de valor', () => {
  const noDifference = { ...totals, diferencaNaoDiscriminada: 0 };
  const html = renderToStaticMarkup(
    <CaixaReceiptsTable rows={[]} totals={noDifference} showTotals />,
  );
  assert.match(html, /1 com composição a conferir/);
  assert.doesNotMatch(html, /com diferença a conferir/i);
  const pdf = new jsPDF();
  pdf.setFont = (() => pdf) as typeof pdf.setFont;
  const text: string[] = [];
  pdf.text = ((value: string | string[]) => {
    text.push(...(Array.isArray(value) ? value : [value]));
    return pdf;
  }) as typeof pdf.text;
  drawMovementTable(pdf, [], noDifference, true, 'emerald', 10);
  assert.match(text.join(' '), /1 COM COMPOSIÇÃO A CONFERIR/);
  assert.doesNotMatch(text.join(' '), /COM DIFERENÇA A CONFERIR/);
});

test('fixture parcial usa exportador canônico, fontes e recursos institucionais isolados', {
  skip: !process.env.CAIXA_PARTIAL_PDF_FIXTURE_OUTPUT,
}, async () => {
  const report = makeCaixaReportFixture();
  report.totaisRecebimentos = { ...totals };
  const weights = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];
  const buffers = await Promise.all(weights.map(async (weight) => {
    const file = await readFile(resolve(`public/fonts/Inter-${weight}.ttf`));
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  }));
  const logo = await readFile(resolve('public/LogoUniverso.png'));
  const logoDataUrl = `data:image/png;base64,${logo.toString('base64')}`;
  report.institucional.landscape_watermark_url = logoDataUrl;
  report.institucional.landscape_watermark_opacity = 0.12;
  report.institucional.landscape_watermark_scale = 55;
  report.institucional.landscape_watermark_rotate = true;
  const pdf = await createCaixaReportPdfDocument(report, undefined, {
    regularFontBuffer: buffers[0], mediumFontBuffer: buffers[1], semiBoldFontBuffer: buffers[2],
    boldFontBuffer: buffers[3], extraBoldFontBuffer: buffers[4], blackFontBuffer: buffers[5],
    logoDataUrl, backgroundDataUrl: logoDataUrl,
  });
  assert.equal(pdf.getNumberOfPages(), 6);
  await writeFile(process.env.CAIXA_PARTIAL_PDF_FIXTURE_OUTPUT!, new Uint8Array(pdf.output('arraybuffer')));
});
