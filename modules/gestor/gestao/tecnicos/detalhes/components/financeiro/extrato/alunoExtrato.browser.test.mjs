import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixture, issuedReceivable, supabaseStub } from './alunoExtrato.browser.fixture.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../../../../../..');
const dependencies = process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies ? pathToFileURL(resolve(dependencies, '../extrato-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const { chromium } = requireTool('playwright');
const output = resolve(process.env.ALUNO_EXTRATO_ARTIFACTS || '/tmp/aluno-extrato');
let browser, javascript, css;

before(async () => {
  await mkdir(output, { recursive: true });
  const result = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import Statement from './AlunoFinanceiroExtrato';
      const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
      client.setQueryData(['turma-financeiro-extrato-aluno','unrelated-enrollment'],{sentinel:true});
      window.queryClient=client;window.calls=[];window.channels=[];
      let app;
      window.mount=()=>{app=createRoot(document.getElementById('root'));app.render(
        <QueryClientProvider client={client}><Statement matriculaId={window.fixture.matriculaId}
          onBack={()=>{window.backRequested=true}}/></QueryClientProvider>)};
      window.unmount=()=>app.unmount();
      window.emitReceivable=(id=window.fixture.matriculaId,eventType='UPDATE')=>{
        for(const channel of window.channels)for(const handler of channel.handlers){
          if(handler.filter.table==='contas_receber'&&handler.filter.filter==='matricula_id=eq.'+id)
            handler.callback({eventType,new:{matricula_id:id},old:eventType==='INSERT'?{}:{matricula_id:id}});
        }
      };
      window.reconnect=()=>window.channels.forEach(channel=>channel.onStatus('SUBSCRIBED'));
      window.otherQueryInvalidated=()=>client.getQueryState(['turma-financeiro-extrato-aluno','unrelated-enrollment']).isInvalidated;`,
      loader: 'tsx', resolveDir: directory },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', nodePaths: dependencies ? [dependencies] : [],
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'controlled-boundaries', setup(plugin) {
      const stubs = {
        rpc: supabaseStub,
        academic: 'export const formatMatricula=()=>"TEST-0001";',
        pdf: 'export const financialReportValueToText=()=>"";',
        toast: `import React,{useState} from 'react';
          export function useToast(){const [toasts,setToasts]=useState([]);const add=(title,message)=>setToasts(list=>[...list,{title,message}]);
            return {toasts,removeToast(){},toast:{success:add,error:add,info:add,warning:add}};}
          export default function Toast({toasts}){return <div>{toasts.map((item,index)=><div role="status" key={index}>{item.title}: {item.message}</div>)}</div>}`,
      };
      for (const [filter, path] of [
        [/lib\/supabase$/, 'rpc'], [/lib\/academicUtils$/, 'academic'],
        [/shared\/ToastNotification$/, 'toast'], [/financial-report\.vector-pdf\.resources$/, 'pdf'],
      ]) plugin.onResolve({ filter }, () => ({ path, namespace: 'controlled' }));
      plugin.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({ contents: stubs[path], loader: 'tsx', resolveDir: root }));
    } }],
  });
  javascript = result.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await requireTool('postcss')([requireTool('tailwindcss')({ ...config,
    content: [resolve(directory, '*.tsx'), resolve(root, 'modules/gestor/financeiro/receber/components/modalidade-receber/ReceivableAmountSummary.tsx')],
  })]).process(styles, { from: resolve(root, 'styles.css') })).css;
  browser = await chromium.launch({ headless: true, ...(process.env.EAD_UI_BROWSER_EXECUTABLE
    ? { executablePath: process.env.EAD_UI_BROWSER_EXECUTABLE } : { channel: 'chromium' }) });
});
after(async () => { await browser?.close(); });

async function open(fixture = createFixture(), width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url() === 'https://portal.test/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body><main id="root" style="padding:24px"></main></body></html>' })
    : route.abort('blockedbyclient'));
  await page.goto('https://portal.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: javascript });
  await page.evaluate(value => { window.fixture=value;window.mount(); }, fixture);
  return { page, context, errors };
}

async function row(page, description = 'Parcela sintética 1/12') {
  const selected = page.getByRole('row').filter({ hasText: description });
  await selected.waitFor();
  return selected;
}

async function assertReadOnlyCalls(page) {
  const calls = await page.evaluate(() => window.calls);
  assert.ok(calls.every(call => call.kind === 'rpc' && call.name === 'get_aluno_extrato_financeiro'
    || call.kind === 'function' && call.name === 'banese-boleto-document'));
}

test('an issued Banese boleto remains unpaid and opens only the existing authenticated document', async () => {
  const { page, context, errors } = await open();
  try {
    const installment = await row(page);
    assert.match(await installment.innerText(), /Boleto emitido/i);
    assert.match(await installment.innerText(), /Banese/);
    assert.match(await installment.innerText(), /PENDENTE/);
    assert.doesNotMatch(await installment.innerText(), /Sem sincronização|Origem: Aguardando|PAGO/);
    assert.match(await installment.innerText(), /Desconto do boleto: R\$\s*20,00/);
    assert.match(await installment.innerText(), /Válido até 15\/11\/2026/);
    await page.getByText('0 paga(s), 1 pendente(s), 1 lançamento(s) no total.', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(output, 'issued-unpaid.png'), fullPage: true });
    await installment.getByRole('button', { name: 'Abrir boleto', exact: true }).click();
    await page.waitForFunction(() => window.calls.some(call => call.name === 'banese-boleto-document'));
    const calls = await page.evaluate(() => window.calls.filter(call => call.kind === 'function'));
    assert.deepEqual(calls, [{ kind: 'function', name: 'banese-boleto-document', args: { body: { receivableId: issuedReceivable().id } } }]);
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('payment and reversal events refresh only the mounted enrollment statement', async () => {
  const { page, context, errors } = await open();
  try {
    await row(page);
    await page.waitForFunction(() => window.calls.filter(call => call.kind === 'rpc').length >= 2);
    const paid = createFixture([issuedReceivable({ status: 'PAGO', valor_pago: 280,
      data_pagamento: '2026-10-09', gateway_status: 'RECEIVED', origem_pagamento: 'BANESE',
      gateway_settlement_channel: 'PIX', desconto_aplicado: 20,
    })], { recebido: 280, pendente: 0, pagos: 1, pendentes: 0 });
    await page.evaluate(value => { window.fixture=value;window.emitReceivable(); }, paid);
    const installment = await row(page);
    await installment.getByText('PAGO', { exact: true }).waitFor();
    assert.match(await installment.innerText(), /Pix \(BolePix\)/);
    assert.match(await installment.innerText(), /Recebido: R\$\s*280,00/);
    assert.match(await installment.innerText(), /Desconto aplicado: R\$\s*20,00/);
    assert.equal(await installment.getByRole('button', { name: 'Abrir boleto', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.otherQueryInvalidated()), false);
    await page.evaluate(value => { window.fixture=value;window.emitReceivable(); }, createFixture());
    await installment.getByText('PENDENTE', { exact: true }).waitFor();
    await installment.getByRole('button', { name: 'Abrir boleto', exact: true }).waitFor();
    await page.evaluate(value => { window.fixture=value;window.emitReceivable(undefined,'INSERT'); }, createFixture([
      issuedReceivable(), issuedReceivable({ id: 'new-installment', descricao: 'Parcela sintética 2/12' }),
    ], { total: 600, pendente: 600, pendentes: 2 }));
    await row(page, 'Parcela sintética 2/12');
    await page.getByText('0 paga(s), 2 pendente(s), 2 lançamento(s) no total.', { exact: true }).waitFor();
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('reconnection reconciles a missed settlement without changing another enrollment', async () => {
  const { page, context, errors } = await open();
  try {
    await row(page);
    await page.waitForFunction(() => window.calls.filter(call => call.kind === 'rpc').length >= 2);
    const initialReads = await page.evaluate(() => window.calls.length);
    await page.evaluate(() => window.emitReceivable('different-enrollment'));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.calls.length), initialReads);
    await page.evaluate(value => { window.fixture=value;window.reconnect(); }, createFixture([
      issuedReceivable({ status: 'PAGO', valor_pago: 300, origem_pagamento: 'PRESENCIAL', gateway_status: 'CANCELED' }),
    ], { recebido: 300, pendente: 0, pagos: 1, pendentes: 0 }));
    const installment = await row(page);
    await installment.getByText('PAGO', { exact: true }).waitFor();
    assert.match(await installment.innerText(), /Manual/);
    assert.equal(await page.evaluate(() => window.otherQueryInvalidated()), false);
    await page.evaluate(() => window.unmount());
    assert.equal(await page.evaluate(() => window.channels.length), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('local, imported and canceled charges never gain an issuance or settlement action', async () => {
  const local = issuedReceivable({ descricao: 'Matrícula local', gateway_provider: null, gateway_payment_id: null,
    gateway_status: null, destino_cobranca: 'LOCAL', emissao_ciclo_status: 'NAO_APLICAVEL', origem_pagamento: 'LOCAL' });
  const imported = issuedReceivable({ id: 'legacy', descricao: 'Histórico sintético', origem_pagamento: 'SISTEMA_ANTERIOR',
    operation_capabilities: { sourceSystem: 'PROESC', provenanceKind: 'PROESC_HISTORY', canOpenExisting: false } });
  const canceled = issuedReceivable({ id: 'cancelled', descricao: 'Parcela cancelada', status: 'CANCELADO' });
  const missingCapability = issuedReceivable({ id: 'restricted', descricao: 'Parcela sem capacidade', operation_capabilities: null });
  const { page, context, errors } = await open(createFixture([local, imported, canceled, missingCapability]), 390);
  try {
    assert.match(await (await row(page, 'Matrícula local')).innerText(), /Sem boleto/i);
    assert.match(await (await row(page, 'Histórico sintético')).innerText(), /Histórico Proesc/i);
    assert.match(await (await row(page, 'Parcela cancelada')).innerText(), /Cancelada/i);
    assert.equal(await page.getByRole('button', { name: /Abrir boleto|Emitir|Receber|Documento financeiro/ }).count(), 0);
    assert.equal(await page.getByRole('link').count(), 0);
    await page.screenshot({ path: resolve(output, 'restricted-mobile.png'), fullPage: true });
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('legacy Asaas link is retained without submitting a new bank operation', async () => {
  const legacy = issuedReceivable({ gateway_provider: null, gateway_payment_id: null, gateway_status: null,
    gateway_payment_method: null, emissao_gerenciada_turma: false, emissao_ciclo_status: null,
    destino_cobranca: null, asaas_payment_id: 'legacy-id', asaas_status: 'PENDING',
    asaas_invoice_url: 'https://legacy.example.test/charge', operation_capabilities: null });
  const { page, context, errors } = await open(createFixture([legacy]));
  try {
    const installment = await row(page);
    assert.match(await installment.innerText(), /Cobrança emitida/i);
    assert.match(await installment.innerText(), /Asaas/);
    await page.evaluate(() => { window.open=(...args)=>{window.openedLegacy=args;return null;}; });
    await installment.getByRole('button', { name: 'Abrir cobrança', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.openedLegacy), ['https://legacy.example.test/charge', '_blank', 'noopener,noreferrer']);
    assert.equal(await page.getByRole('button', { name: 'Abrir boleto', exact: true }).count(), 0);
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('denied document access stays denied and produces visible feedback', async () => {
  const { page, context, errors } = await open(createFixture(undefined, { documentError: true }));
  try {
    await (await row(page)).getByRole('button', { name: 'Abrir boleto', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Sem permissão para consultar o boleto.' }).waitFor();
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('failed statement read displays an error without presenting stale financial totals', async () => {
  const { page, context, errors } = await open(createFixture(undefined, { readError: true }));
  try {
    await page.getByText('Não foi possível carregar o extrato financeiro.', { exact: true }).waitFor();
    assert.equal(await page.getByText('Boleto emitido', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('table').count(), 0);
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    assert.equal(await page.evaluate(() => window.backRequested), true);
    await assertReadOnlyCalls(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
