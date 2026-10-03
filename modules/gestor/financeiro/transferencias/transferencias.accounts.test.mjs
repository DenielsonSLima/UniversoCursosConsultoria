import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const account = (poloId, balance, overrides = {}) => ({
  id: 'shared-bank', banco: 'Banco compartilhado', conta: '123', ativo: true,
  polo_id: 'matriz', polos_uso: ['matriz', 'polo'], saldo_atual: 260,
  saldo_contabil_conta: 260, saldo_gerencial_polo: balance,
  saldo_inicial: 0, recebido: 0, pago: 0, ...overrides,
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('transferências consultam e isolam o saldo canônico de cada polo', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'universo-transferencias-accounts-'));
  const bundle = join(directory, 'accounts.cjs');
  await build({
    stdin: {
      contents: `
        export { transferenciaAccountsOptions, transferenciaAccountsKey } from './hooks/useTransferenciaAccountsQueries';
        export { QueryClient, QueryObserver } from '@tanstack/react-query';
      `,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'ts',
    },
    outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
    plugins: [{ name: 'rpc-transport', setup(api) {
      api.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        loader: 'js', contents: `export const supabase = {
          rpc: (name, args) => globalThis.__transferenciasAccountsRpc(name, args),
        };`,
      }));
    } }],
  });
  const { transferenciaAccountsOptions: options, transferenciaAccountsKey: key, QueryClient, QueryObserver } = require(bundle);
  const clients = [];
  const client = () => {
    const instance = new QueryClient();
    clients.push(instance);
    return instance;
  };
  try {
    await t.test('mesma conta tem saldos distintos por polo; saldo negativo e zero são preservados', async () => {
      const calls = [];
      globalThis.__transferenciasAccountsRpc = async (name, args) => {
        calls.push([name, args]);
        return { data: [account(args.p_polo_id, args.p_polo_id === 'matriz' ? 300 : -40)], error: null };
      };
      const cache = client();
      const [origin, destination] = await Promise.all([
        cache.fetchQuery(options('matriz')), cache.fetchQuery(options('polo')),
      ]);
      assert.equal(origin[0].saldoGerencialPolo, 300);
      assert.equal(destination[0].saldoGerencialPolo, -40);
      assert.equal(origin[0].saldoContabilConta, 260);
      assert.equal(destination[0].saldoContabilConta, 260);
      assert.deepEqual(calls.map(([name]) => name), Array(2).fill('get_contas_bancarias_para_polo_secure'));
      assert.deepEqual(calls.map(([, args]) => args.p_polo_id).sort(), ['matriz', 'polo']);
      globalThis.__transferenciasAccountsRpc = async () => ({ data: [account('polo', 0)], error: null });
      assert.equal((await cache.fetchQuery(options('polo')))[0].saldoGerencialPolo, 0);
    });

    await t.test('troca rápida não herda saldo anterior nem permite resposta atrasada sobrescrever o polo atual', async () => {
      const pending = new Map();
      globalThis.__transferenciasAccountsRpc = (name, args) => new Promise((resolve) => pending.set(args.p_polo_id, resolve));
      const cache = client();
      const observer = new QueryObserver(cache, options('matriz'));
      const unsubscribe = observer.subscribe(() => {});
      observer.setOptions(options('polo'));
      assert.equal(observer.getCurrentResult().data, undefined);
      pending.get('polo')({ data: [account('polo', 90)], error: null });
      await settle();
      assert.equal(observer.getCurrentResult().data[0].saldoGerencialPolo, 90);
      pending.get('matriz')({ data: [account('matriz', 170)], error: null });
      await settle();
      assert.equal(observer.getCurrentResult().data[0].saldoGerencialPolo, 90);
      unsubscribe();
    });

    await t.test('origem/destino no mesmo polo compartilham consulta; polos diferentes isolam erro e invalidação', async () => {
      const calls = [];
      globalThis.__transferenciasAccountsRpc = async (name, args) => {
        calls.push(args.p_polo_id);
        return { data: [account(args.p_polo_id, 25)], error: null };
      };
      const cache = client();
      await Promise.all([cache.fetchQuery(options('matriz')), cache.fetchQuery(options('matriz'))]);
      assert.equal(calls.length, 1);
      await cache.fetchQuery(options('polo'));
      await cache.invalidateQueries({ queryKey: key('matriz'), exact: true });
      assert.equal(cache.getQueryState(key('matriz')).isInvalidated, true);
      assert.equal(cache.getQueryState(key('polo')).isInvalidated, false);
      globalThis.__transferenciasAccountsRpc = async () => ({ data: null, error: new Error('Acesso negado') });
      await assert.rejects(cache.fetchQuery(options('matriz')), /Acesso negado/);
      assert.equal(cache.getQueryState(key('polo')).status, 'success');
    });

    await t.test('saldo ausente/inválido não vira zero nem saldo global; contas fora do polo e inativas são excluídas', async () => {
      const cache = client();
      for (const missing of [undefined, null, 'inválido']) {
        globalThis.__transferenciasAccountsRpc = async () => ({ data: [account('polo', missing)], error: null });
        await assert.rejects(cache.fetchQuery(options('polo')), /saldo por polo/);
      }
      globalThis.__transferenciasAccountsRpc = async () => ({
        data: [account('polo', 12), account('polo', undefined, { ativo: false }),
          account('polo', undefined, { polos_uso: ['matriz'] })], error: null,
      });
      assert.equal((await cache.fetchQuery(options('polo'))).length, 1);
      for (const absent of ['', 'todos']) {
        assert.equal(options(absent).enabled, false);
        assert.deepEqual(await options(absent).queryFn(), []);
      }
    });
  } finally {
    clients.forEach((cache) => cache.clear());
    delete globalThis.__transferenciasAccountsRpc;
    await rm(directory, { recursive: true, force: true });
  }
});
