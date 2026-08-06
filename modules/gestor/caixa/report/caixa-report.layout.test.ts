import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaReportPagesFit,
  getCaixaReportArtworkPreset,
  isCaixaReportPageOverflowing,
} from './caixa-report.layout';
import {
  CAIXA_REPORT_TEXT_LAYER_MODE,
  getCaixaReportPdfErrorMessage,
} from './caixa-report.pdf';

test('preserva a prévia sem perdas e reduz somente relatórios extensos', () => {
  assert.equal(CAIXA_REPORT_TEXT_LAYER_MODE, 'preserve-artwork-text');
  assert.deepEqual(getCaixaReportArtworkPreset(1), {
    artworkFormat: 'PNG',
    artworkScale: 2.5,
  });
  assert.deepEqual(getCaixaReportArtworkPreset(8), {
    artworkFormat: 'PNG',
    artworkScale: 2.5,
  });
  assert.deepEqual(getCaixaReportArtworkPreset(9), {
    artworkFormat: 'PNG',
    artworkScale: 2,
  });
  assert.deepEqual(getCaixaReportArtworkPreset(15), {
    artworkFormat: 'PNG',
    artworkScale: 2,
  });
  assert.deepEqual(getCaixaReportArtworkPreset(16), {
    artworkFormat: 'PNG',
    artworkScale: 2,
  });
  assert.deepEqual(getCaixaReportArtworkPreset(31), {
    artworkFormat: 'PNG',
    artworkScale: 1.5,
  });
});

test('traduz a causa técnica da falha do PDF para uma orientação útil', () => {
  assert.match(
    getCaixaReportPdfErrorMessage(new Error('Uma imagem obrigatória não pôde ser decodificada.')),
    /logo ou a marca d’água/i,
  );
  assert.match(
    getCaixaReportPdfErrorMessage(new Error('A página 2 excedeu a área segura.')),
    /ultrapassou a área segura/i,
  );
  assert.match(
    getCaixaReportPdfErrorMessage(new RangeError('Out of memory while allocating canvas')),
    /sem memória/i,
  );
});

test('aceita pequenas diferenças de arredondamento do navegador', () => {
  assert.equal(isCaixaReportPageOverflowing({
    clientHeight: 794,
    clientWidth: 1123,
    scrollHeight: 796,
    scrollWidth: 1125,
  }), false);
});

test('bloqueia geração quando conteúdo vertical ou horizontal seria cortado', () => {
  assert.equal(isCaixaReportPageOverflowing({
    clientHeight: 794,
    clientWidth: 1123,
    scrollHeight: 797,
    scrollWidth: 1123,
  }), true);

  assert.throws(
    () => assertCaixaReportPagesFit([{
      clientHeight: 794,
      clientWidth: 1123,
      scrollHeight: 794,
      scrollWidth: 1126,
    }]),
    /página 1 excedeu/i,
  );
});
