import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { caixaWorkspacePayablesQueryOptions } from '../caixa-workspace-payables.queries.ts';
import type { CaixaWorkspacePayablesPayload } from '../caixa-workspace-payables.types.ts';
import { CaixaWorkspacePayablesModal } from './CaixaWorkspacePayablesModal.tsx';
import { CaixaWorkspacePayablesPanel } from './CaixaWorkspacePayablesPanel.tsx';

const empresaId = '33333333-3333-3333-3333-333333333333';
const poloId = '44444444-4444-4444-4444-444444444444';
const competencia = '2026-09-01';

const createPayload = (): CaixaWorkspacePayablesPayload => ({
  versao: 2,
  meta: {
    snapshot_id: 'caixa-v2-0123456789abcdef0123456789abcdef',
    empresa_id: empresaId,
    polo_id: poloId,
    escopo_tipo: 'POLO',
    competencia,
    periodo_inicio: competencia,
    periodo_fim_exclusivo: '2026-10-01',
    data_corte: '2026-09-27',
    data_institucional: '2026-09-27',
    timezone: 'America/Maceio',
    criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
    unidade_contagem: 'LINHA_ECONOMICA',
    all_polos_admin_global_sistema: true,
  },
  filtro: 'ATRASADAS',
  paginacao: {
    pagina: 1,
    tamanho_pagina: 20,
    total_itens: 41,
    total_paginas: 3,
    tem_anterior: false,
    tem_proxima: true,
  },
  itens: [{
    chave: 'CONTA_PAGAR:11111111-1111-1111-1111-111111111111',
    fonte: 'CONTA_PAGAR_LEGADA',
    polo: { id: poloId, nome: 'Aracaju' },
    descricao: 'Aluguel da unidade',
    status: 'VENCIDO',
    datas: {
      vencimento: '2026-09-05',
      pagamento: null,
      registro: '2026-08-20',
    },
    valor_programado: '1200.00',
    valor_pago: '200.00',
    saldo_aberto: '1000.00',
  }],
});

const request = {
  empresaId,
  poloId,
  competencia,
  filtro: 'ATRASADAS' as const,
  pagina: 1,
  tamanhoPagina: 20,
};

const renderModal = (client: QueryClient, open = true) => renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <CaixaWorkspacePayablesModal
      open={open}
      onClose={() => undefined}
      empresaId={empresaId}
      poloId={poloId}
      competencia={competencia}
      filtro="ATRASADAS"
      title="Contas em atraso"
    />
  </QueryClientProvider>,
);

const renderPanel = (payload?: CaixaWorkspacePayablesPayload) => renderToStaticMarkup(
  <CaixaWorkspacePayablesPanel
    payload={payload}
    isLoading={false}
    isError={false}
    isFetching={false}
    onRetry={() => undefined}
    onPrevious={() => undefined}
    onNext={() => undefined}
  />,
);

test('painel apresenta item e valores canônicos sem recomposição', () => {
  const html = renderPanel(createPayload());

  assert.match(html, /Aluguel da unidade/);
  assert.match(html, /VENCIDO/);
  assert.match(html, /Conta a pagar/);
  assert.match(html, /Aracaju/);
  assert.match(html, /05\/09\/2026/);
  assert.match(html, /R\$ 1\.200,00/);
  assert.match(html, /R\$ 200,00/);
  assert.match(html, /R\$ 1\.000,00/);
  assert.match(html, /41 obrigações econômicas/);
  assert.match(html, /Página 1 de 3/);
});

test('paginação usa somente flags canônicas, inclusive no vazio', () => {
  const firstPage = renderPanel(createPayload());
  const previousOnFirst = firstPage.match(/<button[^>]*data-pagination-previous[^>]*>/)?.[0] || '';
  const nextOnFirst = firstPage.match(/<button[^>]*data-pagination-next[^>]*>/)?.[0] || '';
  assert.match(previousOnFirst, /\sdisabled=""/);
  assert.doesNotMatch(nextOnFirst, /\sdisabled=/);

  const emptyPayload = createPayload();
  emptyPayload.itens = [];
  emptyPayload.paginacao = {
    ...emptyPayload.paginacao,
    pagina: 2,
    tem_anterior: true,
    tem_proxima: false,
  };
  const empty = renderPanel(emptyPayload);
  assert.match(empty, /Nenhum título neste filtro/);
  assert.match(empty, /Página 2 de 3/);
  const previousOnEmpty = empty.match(/<button[^>]*data-pagination-previous[^>]*>/)?.[0] || '';
  const nextOnEmpty = empty.match(/<button[^>]*data-pagination-next[^>]*>/)?.[0] || '';
  assert.doesNotMatch(previousOnEmpty, /\sdisabled=/);
  assert.match(nextOnEmpty, /\sdisabled=""/);
});

test('loading, erro e modal fechado são estados isolados', () => {
  const loading = renderToStaticMarkup(
    <CaixaWorkspacePayablesPanel
      isLoading
      isError={false}
      isFetching
      onRetry={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );
  assert.match(loading, /Carregando contas a pagar/);
  assert.equal((loading.match(/motion-safe:animate-pulse/g) || []).length, 5);

  const error = renderToStaticMarkup(
    <CaixaWorkspacePayablesPanel
      isLoading={false}
      isError
      isFetching={false}
      onRetry={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );
  assert.match(error, /Não foi possível carregar as obrigações/);
  assert.match(error, /Tentar novamente/);

  const conflict = renderToStaticMarkup(
    <CaixaWorkspacePayablesPanel
      isLoading={false}
      isError
      isSnapshotConflict
      isFetching={false}
      onRetry={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );
  assert.match(conflict, /A lista mudou durante a navegação/);
  assert.match(conflict, /Recomeçar lista/);

  const client = new QueryClient();
  try {
    assert.equal(renderModal(client, false), '');
    assert.match(renderModal(client), /role="dialog"/);
    assert.match(renderModal(client), /Carregando contas a pagar/);
  } finally {
    client.clear();
  }
});

test('modal usa apenas a query v2 e renderiza o cache do filtro solicitado', () => {
  const client = new QueryClient();
  try {
    client.setQueryData(caixaWorkspacePayablesQueryOptions(request).queryKey, createPayload());
    const html = renderModal(client);
    assert.match(html, /Contas em atraso/);
    assert.match(html, /Aluguel da unidade/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /Fechar detalhamento de obrigações a pagar/);
  } finally {
    client.clear();
  }

  const componentsDir = join(process.cwd(), 'modules/gestor/caixa/workspace/components');
  const modalSource = readFileSync(join(componentsDir, 'CaixaWorkspacePayablesModal.tsx'), 'utf8');
  const panelSource = readFileSync(join(componentsDir, 'CaixaWorkspacePayablesPanel.tsx'), 'utf8');
  assert.match(modalSource, /caixaWorkspacePayablesQueryOptions\(request\)/);
  assert.match(modalSource, /enabled: open/);
  assert.match(modalSource, /void payablesQuery\.refetch\(\)/);
  assert.match(modalSource, /queryClient\.removeQueries\(\{/);
  assert.match(modalSource, /pagina: 1,[\s\S]*snapshotId: null/);
  assert.match(panelSource, /disabled=\{!payload\.paginacao\.tem_anterior\}/);
  assert.match(panelSource, /disabled=\{!payload\.paginacao\.tem_proxima\}/);
  assert.doesNotMatch(`${modalSource}\n${panelSource}`, /placeholderData|keepPreviousData|fallback/i);
  assert.doesNotMatch(`${modalSource}\n${panelSource}`, /parseFloat|parseInt|\.reduce\(|Math\./);
  assert.doesNotMatch(panelSource, /total_paginas\s*[+*/-]|total_itens\s*[+*/-]/);
});
