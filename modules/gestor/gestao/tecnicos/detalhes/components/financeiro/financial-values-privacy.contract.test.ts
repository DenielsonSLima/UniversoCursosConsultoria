import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const baseDir = resolve(
  process.cwd(),
  'modules/gestor/gestao/tecnicos/detalhes/components/financeiro',
);

const readSource = (relativePath: string) => readFileSync(
  resolve(baseDir, relativePath),
  'utf8',
);

const workspaceSource = readSource('../TurmaFinanceiro.tsx');
const configSource = readSource('FinanceiroConfig.tsx');
const summarySource = readSource('FinanceiroConfigSummary.tsx');
const listSource = readSource('FinanceiroAlunosList.tsx');
const tableSource = readSource('FinanceiroAlunosTable.tsx');

const between = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `marcador inicial ausente: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `marcador final ausente: ${endMarker}`);
  return source.slice(start, end);
};

test('valores financeiros iniciam ocultos e o controle global e acessivel', () => {
  assert.match(
    workspaceSource,
    /\[\s*valuesVisible\s*,\s*setValuesVisible\s*\]\s*=\s*(?:React\.)?useState(?:<boolean>)?\(false\)/,
  );
  assert.match(workspaceSource, /aria-pressed=\{valuesVisible\}/);
  assert.match(workspaceSource, /Ocultar valores financeiros/);
  assert.match(workspaceSource, /Exibir valores financeiros/);
  assert.match(workspaceSource, /aria-label=\{toggleLabel\}/);
  assert.match(workspaceSource, /title=\{toggleLabel\}/);
  assert.match(workspaceSource, /focus-visible:(?:outline|ring)/);
  assert.match(workspaceSource, /\[rulesEditing, setRulesEditing\] = (?:React\.)?useState\(false\)/);
  assert.match(workspaceSource, /disabled=\{rulesEditing\}/);
  assert.match(workspaceSource, /Valores na edição/);
  assert.doesNotMatch(workspaceSource, /localStorage|sessionStorage/);
});

test('a visibilidade percorre resumo e listagem sem estado concorrente', () => {
  assert.match(workspaceSource, /<FinanceiroConfig[\s\S]*?valuesVisible=\{valuesVisible\}/);
  assert.match(workspaceSource, /onRevealValues=\{\(\) => setValuesVisible\(true\)\}/);
  assert.match(workspaceSource, /onEditingChange=\{setRulesEditing\}/);
  assert.match(workspaceSource, /<FinanceiroAlunosList[\s\S]*?valuesVisible=\{valuesVisible\}/);
  assert.match(configSource, /valuesVisible\??:\s*boolean/);
  assert.match(configSource, /valuesVisible = false/);
  assert.match(configSource, /if \(!valuesVisible\) onRevealValues\(\);/);
  assert.match(configSource, /onEditingChange\(isEditing && !blocked\)/);
  assert.match(configSource, /return \(\) => onEditingChange\(false\)/);
  assert.match(configSource, /<FinanceiroConfigSummary[\s\S]*?valuesVisible=\{valuesVisible\}/);
  assert.match(summarySource, /valuesVisible\??:\s*boolean/);
  assert.match(summarySource, /valuesVisible = false/);
  assert.match(listSource, /valuesVisible\??:\s*boolean/);
  assert.match(listSource, /valuesVisible = false/);
  assert.match(listSource, /<FinanceiroAlunosTable[\s\S]*?valuesVisible=\{valuesVisible\}/);
  assert.match(tableSource, /valuesVisible\??:\s*boolean/);
  assert.match(tableSource, /valuesVisible = false/);

  for (const source of [workspaceSource, summarySource, tableSource]) {
    assert.match(source, /valuesVisible/);
    assert.match(source, /(?:•{3,}|Valor oculto)/i);
  }
});

test('a mascara e somente visual e a exportacao conserva valores reais', () => {
  const exportRows = between(listSource, 'const exportRows =', 'const getRequestId');
  assert.match(exportRows, /formatMoney\(row\.valorMatriculaEfetivo\)/);
  assert.match(exportRows, /formatMoney\(row\.valorMensalidadeEfetivo\)/);
  assert.doesNotMatch(exportRows, /valuesVisible|Valor oculto|•{3,}/i);

  const report = between(listSource, '<FinancialReportExportButton', '/>');
  assert.match(report, /formatMoney\(resumo\.total\)/);
  assert.match(report, /formatMoney\(resumo\.recebido\)/);
  assert.match(report, /formatMoney\(resumo\.inadimplencia\)/);
  assert.doesNotMatch(report, /valuesVisible|Valor oculto|•{3,}/i);
});
