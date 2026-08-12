import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import test from 'node:test';

const source = readFileSync(new URL('./turma-plano-unico-form.utils.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
const compiledModule = { exports: {} };
new Function('module', 'exports', code)(compiledModule, compiledModule.exports);
const {
  addMonthsToISODate,
  buildInstallmentSchedule,
  formatCurrencyBRL,
  formatPercentageBR,
  getDiaVencimento,
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

test('divide o valor configurado pela turma e preserva o total em centavos', () => {
  const schedule = buildInstallmentSchedule(500, 3, '2026-08-10');

  assert.deepEqual(schedule.map((item) => item.valor), [166.67, 166.67, 166.66]);
  assert.equal(schedule.reduce((total, item) => total + item.valor, 0).toFixed(2), '500.00');
});

test('aceita qualquer quantidade configurada de parcelas dentro do limite', () => {
  assert.equal(buildInstallmentSchedule(840, 5, '2026-08-10').length, 5);
  assert.equal(buildInstallmentSchedule(840, 12, '2026-08-10').length, 12);
  assert.deepEqual(buildInstallmentSchedule(840, 61, '2026-08-10'), []);
});

test('repete o dia do primeiro vencimento e ajusta meses mais curtos', () => {
  const schedule = buildInstallmentSchedule(300, 3, '2026-01-31');

  assert.deepEqual(schedule.map((item) => item.vencimento), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(getDiaVencimento('2026-01-31'), 31);
  assert.equal(addMonthsToISODate('2024-02-29', 24), '2026-02-28');
});
