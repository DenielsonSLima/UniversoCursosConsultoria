import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaixaLinhaCorteCard } from './CaixaLinhaCorteCard';
import { mapCaixaLinhaCorte } from '../caixa-linha-corte.service';

const render = (amount: unknown) => renderToStaticMarkup(
  <CaixaLinhaCorteCard
    resumo={mapCaixaLinhaCorte({
      competencia: '2026-09-01', polo_id: null,
      receitas: { previstas: 500, previstas_a_vencer: amount },
      inadimplencia: { valor_vencido: 100 },
    })}
    isLoading={false}
    hasError={false}
  />,
);

test('card mostra valor canônico e não recalcula a partir dos outros totais', () => {
  assert.match(render(17.23), /Previstas a vencer:<\/span><strong[^>]*>R\$\s*17,23<\/strong>/);
});

test('card distingue valor zero de campo ausente ou inválido', () => {
  assert.match(render(0), /Previstas a vencer:<\/span><strong[^>]*>R\$\s*0,00<\/strong>/);
  for (const missing of [null, undefined, '', 'inválido']) {
    assert.match(render(missing), /Previstas a vencer:<\/span><strong[^>]*>Indisponível<\/strong>/);
  }
});

test('erro de carregamento não vira resumo financeiro zerado', () => {
  const html = renderToStaticMarkup(<CaixaLinhaCorteCard isLoading={false} hasError />);
  assert.match(html, /Não foi possível consolidar/);
  assert.doesNotMatch(html, /R\$|Sem movimentação confirmada/);
});
