import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const temporary = await mkdtemp(join(tmpdir(), 'universo-canonical-summary-'));
const bundle = join(temporary, 'summary.cjs');
after(async () => { await rm(temporary, { recursive: true, force: true }); });
await build({
  stdin: { contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import CanonicalSummary from './CanonicalSummary.tsx';
    const policy={defaults:{origin:'TURMA'},effective:{punctualDiscount:{amountCents:1000},
      monthlyInterest:{basisPoints:100},penalty:{kind:'PERCENTAGE',basisPoints:200}},
      provenance:{punctualDiscount:'HERDADO',monthlyInterest:'HERDADO',penalty:'HERDADO'},
      receiptPolicy:{daysAfterDue:60,instruction:'Não receber após 60 dias do vencimento.'}};
    const props={policy,sourceItems:[],schedule:{cadence:'FIXED_DAYS',intervalDays:45,installmentCount:1,
      firstDueDate:'2026-11-10',entries:[{kind:'INSTALLMENT',sequence:1,dueDate:'2026-11-10',amountCents:15000}]},
      totals:{principalCents:15000,accruedInterestCents:0,accruedPenaltyCents:0,grossDebtCents:15000,
        waivedInterestCents:0,waivedPenaltyCents:0,commercialDiscountCents:0,negotiatedCents:15000,
        downPaymentCents:0,financedCents:15000}};
    export const render=()=>renderToStaticMarkup(<><CanonicalSummary {...props}/><CanonicalSummary {...props}/></>);
  `, loader: 'tsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)), sourcefile: 'summary.fixture.tsx' },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
});
const { render } = createRequire(import.meta.url)(bundle);

test('duas revisões simultâneas possuem IDs próprios e rótulos acessíveis, sem mudar valores canônicos', () => {
  const markup = render();
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const labels = [...markup.matchAll(/aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8, 'detalhe e confirmação não compartilham IDs');
  assert.deepEqual(labels.sort(), ids.sort());
  assert.match(markup, /Intervalo fixo de 45 dias/);
  assert.match(markup, /Não receber após 60 dias/);
  assert.match(markup, /150,00/);
});
