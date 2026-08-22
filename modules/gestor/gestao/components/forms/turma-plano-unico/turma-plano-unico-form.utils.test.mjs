import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import test from 'node:test';

const source = readFileSync(new URL('./turma-plano-unico-form.utils.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
const compiledModule = { exports: {} };
new Function('module', 'exports', code)(compiledModule, compiledModule.exports);
const {
  formatCivilDate,
  formatCurrencyBRL,
  formatPercentageBR,
  getPreviewInstallments,
  parseCurrencyBRLInput,
} = compiledModule.exports;

test('formata e interpreta moeda brasileira sempre com duas casas', () => {
  assert.equal(formatCurrencyBRL(500).replace(/\u00a0/g, ' '), 'R$ 500,00');
  assert.equal(formatCurrencyBRL(0).replace(/\u00a0/g, ' '), 'R$ 0,00');
  assert.equal(parseCurrencyBRLInput('R$ 1.234,56'), 1234.56);
  assert.equal(parseCurrencyBRLInput('500'), 500);
  assert.equal(parseCurrencyBRLInput('500,5'), 500.5);
  assert.equal(formatPercentageBR(2).replace(/\u00a0/g, ' '), '2,00');
});

test('formata datas civis sem depender do fuso do navegador', () => {
  assert.equal(formatCivilDate('2026-01-31'), '31/01/2026');
  assert.equal(formatCivilDate('2026-02-30'), '—');
});

test('a interface apenas reduz a lista de parcelas devolvida pelo servidor', () => {
  const schedule = Array.from({ length: 8 }, (_, index) => ({
    id: `server-${index + 1}`,
    tipo: 'PARCELA',
    numero: index + 1,
    label: `Parcela ${index + 1}`,
    valor: 50,
    dataVencimento: `2026-${String(index + 1).padStart(2, '0')}-10`,
  }));
  assert.deepEqual(getPreviewInstallments(schedule).map((item) => item.numero), [1, 2, 3, 7, 8]);
});
