import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  currentCompetenciaInMaceio,
  formatCompetenciaInput,
  parseCompetenciaInput,
} from './components/relatorios.date-presentation.ts';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('relatório financeiro recebe competência em MM/AAAA e envia AAAA-MM', async () => {
  const report = await read('./components/RelatorioFinanceiroTurmaMensal.tsx');

  assert.doesNotMatch(report, /type="month"/);
  assert.match(report, /placeholder="MM\/AAAA"/);
  assert.match(report, /parseCompetenciaInput/);
  assert.match(report, /aria-invalid=\{!competenciaInputValida\}/);
  assert.match(report, /aria-describedby=\{!competenciaInputValida/);
  assert.match(report, /printDisabled=\{!competenciaInputValida\}/);
  assert.match(report, /onBlur=\{\(\) =>/);
  assert.equal(formatCompetenciaInput('2026-09'), '09/2026');
  assert.equal(parseCompetenciaInput('09/2026'), '2026-09');
  assert.equal(parseCompetenciaInput('13/2026'), null);
});

test('competência atual respeita o mês civil de Maceió na borda do UTC', () => {
  const afterUtcMonthTurn = new Date('2026-10-01T01:00:00.000Z');
  assert.equal(currentCompetenciaInMaceio(afterUtcMonthTurn), '2026-09');
});
