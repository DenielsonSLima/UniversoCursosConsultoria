import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('navegação posiciona Convênios após Empréstimos e antes de Transferências', async () => {
  const page = await read('../FinanceiroPage.tsx');
  const loans = page.indexOf("id: 'emprestimos'");
  const agreements = page.indexOf("id: 'convenios'");
  const transfers = page.indexOf("id: 'transferencias'");
  assert.ok(loans >= 0 && loans < agreements && agreements < transfers);
  assert.match(page, /case 'convenios'/);
});

test('tela abre em cards, oferece status, busca, crédito e fechamento manual', async () => {
  const tab = await read('./ConveniosTab.tsx');
  assert.match(tab, /useState<ViewMode>\('cards'\)/);
  assert.match(tab, /useState<ConvenioStatusScope>\('ABERTOS'\)/);
  assert.match(tab, /'FINALIZADOS'/);
  assert.match(tab, /Buscar convênio, parceiro ou competência/);
  assert.match(tab, /ConvenioCreditModal/);
  assert.match(tab, /ConvenioCloseMonthModal/);
});

test('serviço usa somente os cinco RPCs canônicos e Realtime por polo com debounce', async () => {
  const service = await read('./convenios.service.ts');
  const realtime = await read('./hooks/useConveniosRealtime.ts');
  for (const rpc of [
    'listar_convenios_financeiros_meses_secure',
    'obter_convenio_financeiro_mes_secure',
    'criar_convenio_financeiro_secure',
    'lancar_credito_convenio_financeiro_secure',
    'finalizar_convenio_financeiro_mes_secure',
  ]) assert.match(service, new RegExp(rpc));
  assert.match(realtime, /finance_realtime_events/);
  assert.match(realtime, /polo_id=eq\.\$\{poloId\}/);
  assert.match(realtime, /convenios_financeiros_competencias/);
  assert.match(realtime, /}, 250\)/);
});

test('RBAC publica Convênios nos três pontos de configuração', async () => {
  const [access, userOptions, profileOptions] = await Promise.all([
    read('../../access-control.ts'),
    read('../../configuracoes/usuarios/components/user-access-options.tsx'),
    read('../../configuracoes/perfis-acesso/PerfilAcessoInternalTabsSection.tsx'),
  ]);
  assert.match(access, /'convenios'/);
  assert.match(userOptions, /id: 'convenios'/);
  assert.match(profileOptions, /id: 'convenios'/);
});
