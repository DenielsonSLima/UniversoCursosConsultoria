import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const page = await Deno.readTextFile(new URL('./RelatoriosPage.tsx', import.meta.url));
const component = await Deno.readTextFile(new URL('./components/RelatorioMovimentacaoFinanceira.tsx', import.meta.url));
const service = await Deno.readTextFile(new URL('./relatorios.service.ts', import.meta.url));

const separatedReports = [
  ['extrato-financeiro-conta', 'EXTRATO_CONTA'],
  ['financeiro-entradas', 'ENTRADAS'],
  ['financeiro-saidas', 'SAIDAS'],
  ['financeiro-receitas', 'RECEITAS'],
  ['financeiro-despesas', 'DESPESAS'],
] as const;

Deno.test('Central de Relatórios oferece cinco cartões financeiros separados', () => {
  for (const [menuId, reportType] of separatedReports) {
    assert.match(page, new RegExp(`id: '${menuId}'`));
    assert.match(page, new RegExp(`tipo=\\"${reportType}\\"`));
  }
  assert.doesNotMatch(page, /case 'financeiro':/);
});

Deno.test('as cinco telas usam o mesmo contrato financeiro, filtros e prévia paginada', () => {
  assert.match(service, /get_relatorio_movimentacao_financeira_secure/);
  assert.match(component, /Filtro(?:s)? do relatório/);
  assert.match(component, /Conta para extrato/);
  assert.match(component, /Categoria/);
  assert.match(component, /Situação/);
  assert.match(component, /Buscar/);
  assert.match(component, /data\.completo/);
  assert.match(component, /FinancialReportExportButton/);
  assert.match(component, /Entradas filtradas/);
  assert.match(component, /Saldo da conta/);
  assert.match(service, /const asRequiredRelatorioNumber/);
  assert.match(service, /typeof value !== 'number'/);
  assert.match(service, /asRequiredRelatorioNumber\(resumo\.valor_previsto/);
  assert.match(service, /asRequiredRelatorioNumber\(item\.valor/);
});
