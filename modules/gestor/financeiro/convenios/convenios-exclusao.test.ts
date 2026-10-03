import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mapExcluirConvenioResult } from './convenios.mapper.ts';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');
const response = {
  replayed: false, convenio_id: 'convenio-sintetico', polo_id: 'polo-sintetico',
  competencia_ids: ['competencia-sintetica'],
};

test('exclusão mapeia escopo canônico e replay sem inventar resultado', () => {
  assert.deepEqual(mapExcluirConvenioResult(response), {
    replayed: false, convenioId: response.convenio_id, poloId: response.polo_id,
    competenciaIds: response.competencia_ids,
  });
  assert.equal(mapExcluirConvenioResult({ ...response, replayed: true }).replayed, true);
  for (const invalid of [
    null, {}, { ...response, replayed: 'true' }, { ...response, polo_id: '' },
    { ...response, convenio_id: null }, { ...response, competencia_ids: [] },
    { ...response, competencia_ids: [''] }, { ...response, competencia_ids: null },
  ]) assert.throws(() => mapExcluirConvenioResult(invalid), /Contrato inválido/);
});

test('excluir está acessível no card, tabela e detalhe e abre confirmação', async () => {
  const [card, table, details, tab] = await Promise.all([
    read('./components/ConvenioMonthCard.tsx'), read('./components/ConvenioMonthsTable.tsx'),
    read('./components/ConvenioMonthDetailsPage.tsx'), read('./ConveniosTab.tsx'),
  ]);
  for (const source of [card, table, details]) {
    assert.match(source, /onDelete\(mes\)/);
    assert.match(source, /Excluir/);
    assert.doesNotMatch(source, /conveniosService\.excluir/);
  }
  assert.match(tab, /ConvenioDeleteModal/);
  assert.match(tab, /deleteMutation\.reset\(\)/);
  assert.match(tab, /mutationFn:.*conveniosService\.excluir\(input\)/);
  assert.match(tab, /invalidateConveniosScope\(queryClient, result\.poloId\)/);
  assert.match(tab, /conveniosQueryKeys\.detail\(result\.poloId, competenciaId\)/);
  assert.match(tab, /<ConveniosPoloTab key=\{props\.poloId \|\| 'sem-polo'\}/);
  assert.match(tab, /if \(mes\.poloId !== poloId \|\| deleteMutation\.isPending\) return/);
  assert.match(tab, /if \(input\.poloId !== poloId \|\| deleteMutation\.isPending\) return/);
});

test('confirmação explícita, request estável, pendência bloqueia ação e fechamento', async () => {
  const modal = await read('./components/ConvenioDeleteModal.tsx');
  assert.match(modal, /useRef\(createConvenioRequestId\(\)\)/);
  assert.match(modal, /useState\(false\)/);
  assert.match(modal, /disabled=\{!confirmed \|\| isPending\}/);
  assert.match(modal, /if \(!confirmed \|\| isPending\) return/);
  assert.match(modal, /if \(!isPending\) onClose\(\)/);
  assert.match(modal, /poloId: mes\.poloId, convenioId: mes\.convenioId/);
  assert.match(modal, /convênio inteiro/);
  assert.match(modal, /parceiro e a trilha de auditoria serão preservados/);
  assert.match(modal, /canceladas ou estornadas/);
  assert.match(modal, /role="alert"/);
  assert.doesNotMatch(modal, /window\.(confirm|alert)|\.delete\(/);
});

test('serviço envia identidade de convênio e polo à RPC segura, sem delete direto', async () => {
  const service = await read('./convenios.service.ts');
  assert.match(service, /rpc\('excluir_convenio_financeiro_secure'/);
  assert.match(service, /p_request_id: input\.requestId/);
  assert.match(service, /p_polo_id: input\.poloId/);
  assert.match(service, /p_convenio_id: input\.convenioId/);
  assert.match(service, /return mapExcluirConvenioResult\(unwrap\(data\)\)/);
  assert.doesNotMatch(service, /\.delete\(/);
});
