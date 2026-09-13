import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

const hook = await readFile(new URL('./hooks/useBaneseConciliacaoQueries.ts', import.meta.url), 'utf8');
const tab = await readFile(new URL('./ConciliacaoBancariaTab.tsx', import.meta.url), 'utf8');
const service = await readFile(new URL('./conciliacao-bancaria.service.ts', import.meta.url), 'utf8');
const queryBody = hook.match(/const cnabOverviewQuery = useQuery\(\{([\s\S]*?)\n {2}\}\);/)?.[1];
assert.ok(queryBody, 'O teste deve executar as opções da consulta CNAB real.');
const queryOptions = new Function('params', 'baneseCnab240Service', 'BANESE_CNAB240_OVERVIEW_QUERY_KEY',
  `return ({${queryBody}});`);

test('CNAB não consulta desativado; ativação consulta e desativação/desmontagem não refaz', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let calls = 0;
  const bank = { getOverview: async () => { calls += 1; return { edi7Configured: true }; } };
  const key = ['banese-cnab240', 'overview'];
  const options = (enabled: boolean) => queryOptions({ cnabEnabled: enabled }, bank, key);
  const observer = new QueryObserver(client, options(false));
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await client.invalidateQueries({ queryKey: key });
    assert.equal(calls, 0);
    observer.setOptions(options(true));
    await client.getQueryCache().find({ queryKey: key })?.promise;
    assert.equal(calls, 1);
    assert.deepEqual(observer.getCurrentResult().data, { edi7Configured: true });
    observer.setOptions(options(false));
    await client.invalidateQueries({ queryKey: key, refetchType: 'active' });
    assert.equal(calls, 1);
    unsubscribe();
    await client.invalidateQueries({ queryKey: key, refetchType: 'active' });
    assert.equal(calls, 1);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test('diagnóstico, remessa e retorno habilitam CNAB; lista de recebimentos não habilita', () => {
  assert.match(tab, /cnabEnabled: activeSubTab !== 'conciliacao'/);
  assert.match(hook, /cnabEnabled\?: boolean/);
  assert.match(service, /getOverview\(\)[\s\S]*?action: 'overview'/);
});

test('erro estruturado de configuração é preservado e exibido no diagnóstico', () => {
  assert.match(service, /body\?\.error \|\| body\?\.message/);
  assert.match(service, /if \(error\) throw new Error\(await extractFunctionErrorMessage\(error\)\)/);
  const diagnostic = tab.split("{activeSubTab === 'diagnostico' && (")[1];
  assert.match(diagnostic, /Configuração CNAB240 pendente/);
  assert.match(diagnostic, /Consulta CNAB240 indisponível/);
  assert.match(diagnostic, /\{overviewError\}/);
});
