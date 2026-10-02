import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapCaixaPosicaoTotalResumo } from '../caixa.mappers';
import { caixaFechamentoImplantacaoPresentation } from '../caixa-fechamento-implantacao.presentation';
import { CaixaStructuralOverview } from '../components/CaixaStructuralOverview';
import { makeCaixaReportFixture } from './caixa-report.fixture';
import { buildCaixaReportPages } from './caixa-report.pagination';
import { createCaixaReportPdfDocument, inspectCaixaPdfOperatorsForTest } from './caixa-report.vector-pdf';

const rawClosing = {
  data_encerramento: '2026-09-30', data_abertura: '2026-10-01',
  saldo_historico_controle_proesc: '8183.70', ajuste_encerramento_operacional: '-8183.70',
  saldo_encerramento_proesc: '0.00', saldo_abertura_proesc: '0.00',
};
const payload = () => ({
  versao: 1, competencia: '2026-09-01', data_corte: '2026-09-30',
  escopo_tipo: 'POLO', polo_id: 'synthetic-polo', disponivel: true,
  dados: {
    saldo_caixa_registrado: '100.00', valor_patrimonial_custo: '200.00',
    saldo_emprestimos_a_pagar: '50.00', valor_total_liquido: '777.77',
    observacao: 'Valores canônicos sem recomposição no cliente.',
    fechamento_implantacao: { ...rawClosing },
  },
});
const position = () => {
  const result = mapCaixaPosicaoTotalResumo(payload());
  assert.equal(result.disponivel, true);
  if (!result.disponivel) throw new Error('Fixture unavailable');
  return result;
};

test('mapeia fechamento opcional sem zerar caixa de outras origens nem recalcular posição', () => {
  const result = position();
  assert.equal(result.dados.saldoCaixaRegistrado, '100.00');
  assert.equal(result.dados.valorTotalLiquido, '777.77');
  assert.deepEqual(result.dados.fechamentoImplantacao, {
    dataEncerramento: '2026-09-30', dataAbertura: '2026-10-01',
    saldoHistoricoControleProesc: '8183.70', ajusteEncerramentoOperacional: '-8183.70',
    saldoEncerramentoProesc: '0.00', saldoAberturaProesc: '0.00',
  });
  const { fechamento_implantacao: omitted, ...data } = payload().dados;
  const previous = mapCaixaPosicaoTotalResumo({ ...payload(), dados: data });
  assert.equal(previous.disponivel && previous.dados.fechamentoImplantacao, undefined);
  assert.equal(caixaFechamentoImplantacaoPresentation(undefined), null);
});

test('rejeita metadados incompletos, número coercível, datas inválidas e encerramento fora do corte', () => {
  const variants = [null, {}, { ...rawClosing, saldo_historico_controle_proesc: 8183.7 },
    { ...rawClosing, ajuste_encerramento_operacional: '' },
    { ...rawClosing, saldo_abertura_proesc: undefined },
    { ...rawClosing, data_encerramento: '2026-09-29' },
    { ...rawClosing, data_abertura: '2026-10-02' },
    { ...rawClosing, data_abertura: '2026-13-01' }];
  for (const closing of variants) {
    assert.throws(() => mapCaixaPosicaoTotalResumo({ ...payload(),
      dados: { ...payload().dados, fechamento_implantacao: closing } }), /fechamento de implantação/);
  }
});

test('texto e UI distinguem histórico, ajuste, encerramento e abertura sem inventar valores', () => {
  const result = position();
  const content = caixaFechamentoImplantacaoPresentation(result.dados.fechamentoImplantacao)!;
  assert.match(content.lines[0], /8\.183,70.*R\$ -8\.183,70/);
  assert.match(content.lines[1], /30\/09\/2026: R\$ 0,00.*01\/10\/2026: R\$ 0,00/);
  assert.match(content.lines[2], /não é receita nem despesa/);
  const html = renderToStaticMarkup(<CaixaStructuralOverview posicaoTotal={result}
    isPosicaoTotalLoading={false} hasPosicaoTotalError={false}
    isPosicaoLiquidaLoading={false} hasPosicaoLiquidaError={true}
    isPatrimonioLoading={false} hasPatrimonioError={true} />);
  for (const line of content.lines) assert.ok(html.includes(line));
  assert.match(html, /Caixa no encerramento operacional/);
  assert.match(html, /R\$ 100,00/);
  assert.match(html, /R\$ 777,77/);
});

test('relatório preserva dados tipados da RPC até compositor e prévia', async () => {
  const [mapper, pdf, preview] = await Promise.all([
    'caixa-report.mapper.ts', 'caixa-report.vector-pdf.ts', 'CaixaReportDocument.tsx',
  ].map((name) => readFile(resolve('modules/gestor/caixa/report', name), 'utf8')));
  assert.match(mapper, /dados: posicaoTotalResumo\.dados/);
  assert.match(pdf, /drawFechamentoImplantacao\(pdf, report\.posicaoTotal\.dados\.fechamentoImplantacao/);
  assert.match(preview, /posicaoTotal\.dados\.fechamentoImplantacao/);
});

test('página de fechamento é condicional e não comprime nem substitui seções existentes', () => {
  const base = buildCaixaReportPages([], [], []);
  const closing = buildCaixaReportPages([], [], [], [], true);
  assert.equal(base.length, 6);
  assert.equal(closing.length, 7);
  assert.equal(closing[1].section, 'FECHAMENTO_IMPLANTACAO');
  assert.deepEqual(closing.filter((page) => page.section !== 'FECHAMENTO_IMPLANTACAO'), base);
});

test('Hero identifica saldosHoje como saldo atual, sem alterar fonte ou valor', async () => {
  const source = await readFile(resolve('modules/gestor/caixa/components/CaixaFlowHero.tsx'), 'utf8');
  assert.match(source, /Saldo contábil atual\. Não compõe a equação do resultado mensal\./);
  assert.doesNotMatch(source, /Posição contábil no corte/);
  assert.match(source, /formatCaixaCurrency\(statement\.saldosHoje\.registradoTotal\)/);
});

test('exporta fixture pelo compositor canônico com fechamento e recursos vetoriais', {
  skip: !process.env.CAIXA_CLOSING_PDF_FIXTURE_OUTPUT,
}, async () => {
  const report = makeCaixaReportFixture();
  const result = position();
  report.resumo.meta.competencia = '2026-09-01';
  report.resumo.meta.periodoInicio = '2026-09-01';
  report.resumo.meta.periodoFimExclusivo = '2026-10-01';
  report.geradoEm = '2026-10-02T03:00:00Z';
  report.resumo.compromissos.inadimplenciaMensal.dataCorte = '2026-09-30';
  report.posicaoTotal = { disponivel: true, dataCorte: result.dataCorte, dados: result.dados };
  const weights = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'];
  const buffers = await Promise.all(weights.map(async (weight) => {
    const bytes = await readFile(resolve(`public/fonts/Inter-${weight}.ttf`));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
  const pages = inspectCaixaPdfOperatorsForTest(pdf);
  assert.equal(pages.length, 7);
  assert.ok(pages.every((page) => page.hasTextOperator && page.imageDrawCount === 2));
  assert.doesNotMatch(pdf.output(), /\b3\s+Tr\b/);
  await writeFile(process.env.CAIXA_CLOSING_PDF_FIXTURE_OUTPUT!, new Uint8Array(pdf.output('arraybuffer')));
});
