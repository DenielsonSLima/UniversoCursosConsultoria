import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliacaoOrigemBaixaPanel from './ConciliacaoOrigemBaixaPanel';

const renderPanel = () => renderToStaticMarkup(<ConciliacaoOrigemBaixaPanel
  rows={[]}
  searchTerm=""
  sourceSystemFilter="PROESC"
  onChangeSourceSystem={() => {}}
  refreshingIds={[]}
  isLoading={false}
  isError={false}
  onSearchTermChange={() => {}}
  onRefresh={() => {}}
  page={1}
  pageSize={20}
  totalItems={71}
  totalPages={9}
  onPageChange={() => {}}
  selectedCanal="TODOS"
  onSelectCanal={() => {}}
  selectedStatus="PAGO"
  onSelectStatus={() => {}}
  settlementStartDate=""
  settlementEndDate=""
  onSettlementStartDateChange={() => {}}
  onSettlementEndDateChange={() => {}}
  onClearSettlementPeriod={() => {}}
  channelCounts={{ totalCount: 71, pendenteCount: 0, apiCount: 11, cnabCount: 7,
    caixaCount: 5, historicoCount: 3, proescCount: 41, mpCount: 0, outroCount: 4 }}
/>);

test('painel apresenta automação Banese e Proesc e mantém os canais históricos', () => {
  const html = renderPanel();
  assert.match(html, /Conciliação automática · Banese e Proesc/);
  assert.match(html, /Caixa \/ Manual/);
  assert.match(html, /CNAB 240/);
  assert.match(html, /Histórico/);
  assert.doesNotMatch(html, /Mercado Pago|Atualizar Dados|Sincronizar Visíveis|Worker/);
  assert.match(html, />41<\/span>/);
});

test('filtro de origem acessível apresenta opções controladas sem filtrar os dados', () => {
  const html = renderPanel();
  assert.match(html, /<option value="ALL">Todas<\/option>/);
  assert.match(html, /<option value="PROESC" selected="">Proesc<\/option>/);
  assert.match(html, /<option value="BANESE">Banese<\/option>/);
  assert.ok(html.indexOf('Buscar cobrança') < html.indexOf('value="PROESC"'));
  assert.match(html, />71<\/strong>/);
});

test('paginação usa total de páginas retornado pelo servidor', () => {
  assert.match(renderPanel(), />9<\/button>/);
});
