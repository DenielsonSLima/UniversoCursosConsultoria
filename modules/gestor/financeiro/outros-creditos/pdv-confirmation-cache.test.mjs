import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

const source = readFileSync(new URL('./useOtherCreditPayment.ts', import.meta.url), 'utf8');
const key = id => ['financeiro', 'outros-creditos', 'payment', id];
const pending = id => ({ payment: { id, status: 'PENDENTE' } });
const paid = id => ({ payment: { id, status: 'PAGO' } });

function loadHook(client, text = source) {
  const effects = [];
  const cleanup = [];
  let options;
  const modules = {
    react: {
      useEffect: fn => effects.push(fn),
      useRef: value => ({ current: value }),
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    },
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useQuery: () => ({ data: pending('current'), isError: false }),
      useMutation: () => ({}),
    },
    '../financeiro.queryKeys': { financeiroQueryKeys: {
      outrosCreditosRoot: ['financeiro', 'outros-creditos'], resumoKpis: ['summary'], contasBancariasSaldos: ['accounts'],
    } },
    '../receber/banese/gestor-banese-payment.service': { gestorBanesePaymentService: {} },
    './other-credit-payment.service': {
      watchOtherCreditPayment: () => () => {},
      shouldWatchOtherCredit: () => true,
    },
    './pdv-confirmation-loop': { startPdvConfirmation: input => { options = input; return () => {}; } },
  };
  const exports = {};
  const compiled = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  exports.useOtherCreditPayment('current');
  effects.forEach(effect => { const dispose = effect(); if (dispose) cleanup.push(dispose); });
  assert.equal(typeof options?.onData, 'function');
  return { receive: options.onData, dispose: () => cleanup.forEach(fn => fn()) };
}

function slowLocalRead(client, id) {
  client.setQueryData(key(id), pending(id));
  let release;
  let signal;
  const done = client.fetchQuery({ queryKey: key(id), queryFn: context => {
    signal = context.signal;
    return new Promise(resolve => { release = resolve; });
  } }).catch(() => null);
  return { done, release: () => release(pending(id)), isAborted: () => signal.aborted };
}

test('reproduz a corrida anterior: leitura antiga substitui PAGO quando não é cancelada', async () => {
  const client = new QueryClient();
  const local = slowLocalRead(client, 'current');
  const before = source.replace('await queryClient.cancelQueries({ queryKey: key, exact: true });', '');
  assert.notEqual(before, source, 'Production cancellation boundary must be present');
  const hook = loadHook(client, before);
  await hook.receive(paid('current'));
  local.release(); await local.done;
  assert.equal(client.getQueryData(key('current')).payment.status, 'PENDENTE');
  hook.dispose(); client.clear();
});

test('check canônico cancela somente a leitura anterior do mesmo título antes de publicar PAGO', async () => {
  const client = new QueryClient();
  const local = slowLocalRead(client, 'current');
  const neighbor = slowLocalRead(client, 'other');
  const hook = loadHook(client);
  await hook.receive(paid('current'));
  assert.equal(local.isAborted(), true);
  assert.equal(neighbor.isAborted(), false);
  local.release(); neighbor.release();
  await Promise.all([local.done, neighbor.done]);
  assert.equal(client.getQueryData(key('current')).payment.status, 'PAGO');
  assert.equal(client.getQueryData(key('other')).payment.status, 'PENDENTE');
  hook.dispose(); client.clear();
});

test('desmontagem durante cancelamento impede publicação tardia do check', async () => {
  const client = new QueryClient();
  const local = slowLocalRead(client, 'current');
  const hook = loadHook(client);
  const update = hook.receive(paid('current'));
  hook.dispose();
  await update;
  local.release(); await local.done;
  assert.equal(client.getQueryData(key('current')).payment.status, 'PENDENTE');
  client.clear();
});
