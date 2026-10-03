import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

// Apresentação sintética: nenhum navegador, RPC, cálculo financeiro ou dado real.
const require = createRequire(resolve(process.cwd(), 'package.json'));
const { buildSync } = require('esbuild');
const jsdomPath = process.env.RENEGOCIACAO_JSDOM_PATH;
if (!jsdomPath) throw new Error('Defina RENEGOCIACAO_JSDOM_PATH para jsdom@26.1.0.');
assert.equal(require(join(jsdomPath, 'package.json')).version, '26.1.0');
const { JSDOM } = require(jsdomPath);
const components = process.env.RENEGOCIACAO_TEST_SOURCE_ROOT
  ? resolve(process.env.RENEGOCIACAO_TEST_SOURCE_ROOT, 'modules/gestor/financeiro/renegociacoes/components')
  : fileURLToPath(new URL('.', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'universo-canonical-summary-'));
const bundle = join(temporary, 'canonical-summary.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });

buildSync({
  stdin: {
    contents: `
      import React from 'react';
      import {renderToStaticMarkup} from 'react-dom/server';
      import CanonicalSummary from './CanonicalSummary.tsx';
      export {approvalReasonLabel} from '../renegociacoes.approval-labels.ts';
      export {renegociacaoErrorMessage} from '../renegociacoes.presentation.ts';
      export const renderSummary=(props,editor=false)=>renderToStaticMarkup(
        <CanonicalSummary {...props} scheduleEditor={editor
          ? <section aria-label="Editor de cronograma sintético"><button>Recalcular parcelas</button></section>
          : undefined}/>
      );
    `,
    loader: 'tsx', resolveDir: components, sourcefile: 'canonical-summary.fixture.tsx',
  },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
  nodePaths: [dirname(dirname(require.resolve('react/package.json')))],
  define: { 'process.env.NODE_ENV': '"test"' },
});
const { renderSummary, approvalReasonLabel, renegociacaoErrorMessage } = require(bundle);

test('erros do cronograma orientam a correção em português', () => {
  assert.match(renegociacaoErrorMessage({ code: '22023', message: 'RENEGOTIATION_CUSTOM_SCHEDULE_TOTAL_MISMATCH' }), /soma dos valores/);
  assert.match(renegociacaoErrorMessage({ code: '22023', message: 'RENEGOTIATION_INVALID_CUSTOM_SCHEDULE' }), /vencimentos válidos/);
});

const totals = {
  principalCents: 40000, accruedInterestCents: 1800, accruedPenaltyCents: 800,
  grossDebtCents: 42600, waivedInterestCents: 600, waivedPenaltyCents: 0,
  commercialDiscountCents: 2000, negotiatedCents: 40000, negotiatedTotalCents: 40000,
  downPaymentCents: 10000, financedCents: 30000,
};
const financialRules = {
  punctualDiscount: { kind: 'FIXED_CENTS', amountCents: 500 },
  monthlyInterest: { kind: 'MONTHLY_PERCENTAGE', basisPoints: 100 },
  penalty: { kind: 'PERCENTAGE', basisPoints: 200 },
};
const props = {
  totals,
  schedule: { installmentCount: 2, firstDueDate: '2026-11-05', entries: [
    { kind: 'DOWN_PAYMENT', sequence: 0, dueDate: '2026-10-05', amountCents: 10000 },
    { kind: 'INSTALLMENT', sequence: 1, dueDate: '2026-11-05', amountCents: 15000 },
    { kind: 'INSTALLMENT', sequence: 2, dueDate: '2026-12-05', amountCents: 15000 },
  ] },
  policy: {
    kind: 'TECHNICAL', defaults: { origin: 'TURMA', ...financialRules }, effective: financialRules,
    provenance: { punctualDiscount: 'HERDADO', monthlyInterest: 'HERDADO', penalty: 'HERDADO' },
    differsFromDefault: false,
  },
  sourceItems: [{ receivableId: 'titulo-sintetico', number: 9, position: 1,
    dueDate: '2026-09-05', overdue: true, openAmountCents: 40000 }],
  requiresApproval: true,
  approvalReasons: ['COMMERCIAL_DISCOUNT', 'WAIVED_INTEREST', 'WAIVED_PENALTY',
    'POLICY_PUNCTUAL_DISCOUNT_CHANGED', 'POLICY_MONTHLY_INTEREST_CHANGED',
    'POLICY_PENALTY_CHANGED', 'CUSTOM_SCHEDULE', 'FUTURE_INTERNAL_RULE'],
};
const normalized = (element) => element?.textContent.replace(/\s+/g, ' ').trim();
const valueFor = (document, label) => normalized([...document.querySelectorAll('dt')]
  .find((element) => element.textContent === label)?.nextElementSibling);

function withDocument(properties, run, editor = false) {
  const snapshot = JSON.stringify(properties);
  const dom = new JSDOM(renderSummary(properties, editor));
  try {
    run(dom.window.document);
    assert.equal(JSON.stringify(properties), snapshot, 'apresentação não altera o retorno canônico');
  } finally { dom.window.close(); }
}

test('motivos de aprovação são traduzidos e códigos desconhecidos nunca aparecem na interface', () => {
  const labels = [
    'Desconto comercial aplicado ao total do acordo.',
    'Juros apurados parcialmente ou totalmente perdoados.',
    'Multa apurada parcialmente ou totalmente perdoada.',
    'Desconto de pontualidade das novas parcelas alterado.',
    'Juros mensais das novas parcelas alterados.',
    'Multa das novas parcelas alterada.',
    'Cronograma personalizado: valores ou vencimentos das parcelas foram alterados.',
    'Condição personalizada que exige análise e aprovação.',
  ];
  assert.deepEqual(props.approvalReasons.map(approvalReasonLabel), labels);
  for (const unknown of ['', 'constructor', '__proto__', 'FUTURE_INTERNAL_RULE']) {
    assert.equal(approvalReasonLabel(unknown), labels.at(-1));
  }
  withDocument(props, (document) => {
    assert.deepEqual([...document.querySelectorAll('[role="status"] li')].map(normalized), labels);
    assert.match(normalized(document.body), /Proposta sujeita à aprovação/);
    for (const code of props.approvalReasons) assert.ok(!document.body.textContent.includes(code));
  });
});

test('desconto comercial fica destacado e separado da pontualidade futura, sem recalcular totais', () => {
  withDocument(props, (document) => {
    assert.equal(valueFor(document, 'Desconto comercial concedido'), '− R$ 20,00');
    const commercialLabel = [...document.querySelectorAll('dt')]
      .find((element) => element.textContent === 'Desconto comercial concedido');
    assert.ok(commercialLabel.parentElement.classList.contains('bg-emerald-50'));
    assert.equal(valueFor(document, 'Principal'), 'R$ 400,00');
    assert.equal(valueFor(document, 'Total negociado'), 'R$ 400,00');
    assert.equal(valueFor(document, 'Saldo parcelado'), 'R$ 300,00');
    const futureLabel = [...document.querySelectorAll('p')]
      .find((element) => element.textContent === 'Desconto de pontualidade futuro');
    assert.equal(normalized(futureLabel.nextElementSibling), 'R$ 5,00');
    assert.match(normalized(document.body), /desconto comercial já está abatido do total negociado/);
    assert.match(normalized(document.body), /não foi abatido do total negociado acima/);
    assert.match(normalized(document.body), /depende do pagamento pontual de cada nova parcela/);
    assert.match(normalized(document.body), /Herdado da turma/);
  });
});

test('editor opcional substitui só o cronograma e preserva readonly e política de aprovação existentes', () => {
  withDocument(props, (document) => {
    assert.ok(document.querySelector('#renegociacao-cronograma'));
    const readonly = document.querySelector('#renegociacao-cronograma').closest('section');
    assert.match(normalized(readonly), /Parcela 1\s*05\/11\/2026\s*R\$ 150,00/);
    assert.match(normalized(readonly), /Parcela 2\s*05\/12\/2026\s*R\$ 150,00/);
    assert.equal(document.querySelector('button'), null);
  });
  withDocument(props, (document) => {
    assert.equal(document.querySelector('#renegociacao-cronograma'), null);
    assert.ok(document.querySelector('[aria-label="Editor de cronograma sintético"]'));
    assert.equal(normalized(document.querySelector('button')), 'Recalcular parcelas');
    for (const section of ['composicao', 'politica', 'originais']) {
      assert.ok(document.querySelector(`#renegociacao-${section}`), `preserva ${section}`);
    }
    assert.equal(valueFor(document, 'Total negociado'), 'R$ 400,00');
    assert.match(normalized(document.body), /Títulos originais \(1\)/);
    assert.match(normalized(document.body), /Proposta sujeita à aprovação/);
  }, true);
  withDocument({ ...props, requiresApproval: false }, (document) => {
    assert.match(normalized(document.body), /Condições sem necessidade de aprovação/);
    assert.equal(document.querySelector('[role="status"]'), null);
  });
});
