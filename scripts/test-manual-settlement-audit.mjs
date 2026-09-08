import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSync } from 'esbuild';

const result = buildSync({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { ManualSettlementAudit } from './modules/gestor/financeiro/receber/components/modalidade-receber/ManualSettlementAudit';
      export const render = (item) => renderToStaticMarkup(React.createElement(ManualSettlementAudit, { item }));
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(
  compiled, compiled.exports, (await import('node:module')).createRequire(import.meta.url),
);
const { render } = compiled.exports;

test('baixa manual mostra ator e conclusão em Maceió, sem usar a data retroativa do pagamento', () => {
  const html = render({
    status: 'PAGO', origemPagamento: 'PRESENCIAL',
    manualSettlementActorName: 'Operador de teste',
    manualSettlementCompletedAt: '2026-09-08T02:41:32Z',
    dataPagamento: '2026-08-24',
  });
  assert.match(html, /Baixa por: Operador de teste/);
  assert.match(html, /07\/09\/2026, 23:41:32/);
  assert.doesNotMatch(html, /24\/08\/2026/);
});

test('legado sem auditoria não inventa usuário nem data/hora', () => {
  const html = render({
    status: 'PAGO', origemPagamento: 'PRESENCIAL',
    dataPagamento: '2026-08-24', createdAt: '2026-09-08T02:41:32Z',
  });
  assert.match(html, /Usuário não registrado/);
  assert.match(html, /Data e hora da baixa não registradas/);
  assert.doesNotMatch(html, /23:41/);
});

test('horário inválido e nome vazio recebem indicação honesta', () => {
  const html = render({
    status: 'PAGO', origemPagamento: 'PRESENCIAL',
    manualSettlementActorName: ' ', manualSettlementCompletedAt: 'invalid',
  });
  assert.match(html, /Usuário não registrado/);
  assert.match(html, /Data e hora da baixa não registradas/);
});

test('recebimento bancário e cobrança não paga não exibem auditoria manual', () => {
  assert.equal(render({ status: 'PAGO', origemPagamento: 'BANESE', gatewayProvider: 'banese_card' }), '');
  assert.equal(render({ status: 'PENDENTE', origemPagamento: 'PRESENCIAL' }), '');
  assert.equal(render({ status: 'ESTORNADO', manualSettlementCompletedAt: '2026-09-08T02:41:32Z' }), '');
});

test('nome do operador é escapado como texto', () => {
  const html = render({ status: 'PAGO', origemPagamento: 'PRESENCIAL', manualSettlementActorName: '<img src=x>' });
  assert.match(html, /&lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img/);
});
