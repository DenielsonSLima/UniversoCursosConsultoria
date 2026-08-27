import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [summary, service, page, tabs, health, realtime] = await Promise.all([
  readFile(new URL('./ResumoTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./resumo-financeiro.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../FinanceiroPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/FinancialUnderlineTabs.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./BaneseApiHealthCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../hooks/useFinanceiroRealtime.ts', import.meta.url), 'utf8'),
]);

test('Resumo usa somente contratos financeiros autorizados e não mascara ausência de dados', () => {
  assert.match(service, /get_financeiro_summary/);
  assert.match(service, /Promise\.all\(filters\.periods/);
  assert.match(service, /poloId !== 'todos'/);
  assert.match(service, /O backend não retornou o resumo financeiro autorizado/);
  assert.doesNotMatch(service, /get_fluxo_consolidado_3_meses|get_student_status_kpis_secure|pix/i);
});

test('Resumo separa posição, vencidos e fluxo em consultas independentes', () => {
  assert.match(summary, /resumoFinanceiroByPoloPeriod/);
  assert.match(summary, /resumoOverdueByPolo/);
  assert.match(summary, /resumoFlowByPolo/);
  assert.match(summary, /SectionError/);
  assert.match(summary, /Hoje/);
  assert.match(summary, /Este mês/);
  assert.match(summary, /Personalizado/);
  assert.doesNotMatch(summary, /Matrículas Ativas|Buscar Mensalidades|get_student_status_kpis_secure/);
});

test('Navegação principal é responsiva, acessível e respeita as permissões disponíveis', () => {
  assert.match(page, /availableTabs=\{visibleTabIds\}/);
  assert.match(page, /mobileMode="select"/);
  assert.match(page, /role="tabpanel"/);
  assert.match(tabs, /aria-controls/);
  assert.match(tabs, /scrollIntoView/);
  assert.match(tabs, /\[&::-webkit-scrollbar\]:hidden/);
});

test('Saúde Banese explicita escopo institucional e realtime invalida o novo resumo', () => {
  assert.match(health, /Escopo global/);
  assert.match(health, /independe do polo e do período selecionados acima/);
  assert.match(realtime, /financeiroQueryKeys\.resumoKpis/);
});
