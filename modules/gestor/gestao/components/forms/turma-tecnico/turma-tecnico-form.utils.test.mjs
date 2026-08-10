import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import test from 'node:test';

const source = readFileSync(new URL('./turma-tecnico-form.utils.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
const compiledModule = { exports: {} };
new Function('module', 'exports', code)(compiledModule, compiledModule.exports);
const { addMonthsToISODate, parseCurrencyBRLInput } = compiledModule.exports;

test('sugere o fim da turma exatamente 24 meses após o início', () => {
  assert.equal(addMonthsToISODate('2026-08-29', 24), '2028-08-29');
});

test('ajusta o último dia quando o mês de destino não possui a mesma data', () => {
  assert.equal(addMonthsToISODate('2024-02-29', 24), '2026-02-28');
  assert.equal(addMonthsToISODate('2026-01-31', 1), '2026-02-28');
});

test('rejeita datas incompletas ou inválidas', () => {
  assert.equal(addMonthsToISODate('', 24), '');
  assert.equal(addMonthsToISODate('2026-02-30', 24), '');
});

test('converte a máscara monetária brasileira durante a digitação', () => {
  assert.equal(parseCurrencyBRLInput('1'), 0.01);
  assert.equal(parseCurrencyBRLInput('15000'), 150);
  assert.equal(parseCurrencyBRLInput('R$ 279,90'), 279.9);
  assert.equal(parseCurrencyBRLInput(''), 0);
});
