import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const page = await Deno.readTextFile(new URL('./RelatoriosPage.tsx', import.meta.url));
const service = await Deno.readTextFile(new URL('./relatorios.service.ts', import.meta.url));
const resumo = await Deno.readTextFile(new URL('./components/RelatorioResumoFinanceiro.tsx', import.meta.url));
const fluxo = await Deno.readTextFile(new URL('./components/RelatorioFluxoCaixa.tsx', import.meta.url));
const inadimplencia = await Deno.readTextFile(new URL('./components/RelatorioInadimplencia.tsx', import.meta.url));

Deno.test('Central oferece resumos, fluxo de caixa e aging financeiro', () => {
  for (const reportId of [
    'financeiro-resumo-categorias',
    'financeiro-resumo-entradas',
    'financeiro-fluxo-caixa',
    'inadimplencia',
  ]) {
    assert.match(page, new RegExp("id: '" + reportId + "'"));
  }

  assert.match(page, /visao="CATEGORIAS"/);
  assert.match(page, /visao="ENTRADAS"/);
  assert.match(page, /<RelatorioFluxoCaixa/);
  assert.match(page, /activeReport === 'financeiro-resumo-categorias'/);
  assert.match(page, /activeReport === 'inadimplencia'/);
});

Deno.test('resumos usam agregações server-side e PDF vetorial', () => {
  assert.match(resumo, /tipo: visao === 'CATEGORIAS' \? 'CATEGORIAS' : 'ENTRADAS'/);
  assert.match(resumo, /data\?\.agregacoes\[config\.aggregation\]/);
  assert.match(resumo, /getMovimentacaoFinanceira/);
  assert.match(resumo, /FinancialReportExportButton/);
  assert.match(resumo, /antes do limite da prévia/);
  assert.match(resumo, /Resultado operacional/);
  assert.match(resumo, /totalEntradas - item\.totalSaidas/);
  assert.match(resumo, /Participação/);
  assert.doesNotMatch(resumo, /data\?\.movimentos.*reduce/);
});

Deno.test('fluxo de caixa é consultado pelo contrato e deixa clara a projeção', () => {
  assert.match(fluxo, /getFluxoCaixa/);
  assert.match(fluxo, /relatoriosKeys\.financeiro\.fluxo/);
  assert.match(fluxo, /FinancialReportExportButton/);
  assert.match(fluxo, /Não representa saldo bancário/);
  assert.match(fluxo, /Receitas em aberto/);
  assert.match(fluxo, /Despesas em aberto/);
  assert.match(fluxo, /Mês corrente completo/);
  assert.match(fluxo, /isOutflowLine/);
  assert.match(fluxo, /displayLineValue/);
});

Deno.test('inadimplência não consulta tabelas no navegador nem usa impressão raster', () => {
  assert.match(inadimplencia, /getInadimplencia/);
  assert.match(inadimplencia, /relatoriosKeys\.financeiro\.inadimplencia/);
  assert.match(inadimplencia, /FinancialReportExportButton/);
  assert.match(inadimplencia, /saldo residual/i);
  assert.match(inadimplencia, /percentualComparavel/);
  assert.match(inadimplencia, /A taxa de inadimplência fica oculta/);
  assert.doesNotMatch(inadimplencia, /\.from\('contas_receber'\)/);
  assert.doesNotMatch(inadimplencia, /window\.print/);
  assert.doesNotMatch(inadimplencia, /supabase/);
});

Deno.test('service valida payloads novos e chama RPCs protegidas', () => {
  assert.match(service, /'CATEGORIAS'/);
  assert.match(service, /agregacoes:/);
  assert.match(service, /get_relatorio_fluxo_caixa_secure/);
  assert.match(service, /get_relatorio_inadimplencia_secure/);
  assert.match(service, /mapRelatorioFluxoCaixa/);
  assert.match(service, /mapRelatorioInadimplencia/);
  assert.match(service, /percentualComparavel/);
});

Deno.test('relatórios não carregam metadados legados da integração Asaas', () => {
  assert.doesNotMatch(service, /asaas_status/);
  assert.doesNotMatch(service, /asaas_invoice_url/);
});
