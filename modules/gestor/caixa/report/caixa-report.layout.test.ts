import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCaixaReportPagesFit,
  isCaixaReportPageOverflowing,
} from './caixa-report.layout';

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
