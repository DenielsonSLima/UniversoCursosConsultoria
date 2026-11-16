import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { createCouponHarness } from './fixtures/ead-coupons.harness.mjs';

const base = fileURLToPath(new URL('../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');

test('Secretaria e compra EAD atravessam serviços e SQL real com alunos e pagamentos fictícios', async () => {
  const h = await createCouponHarness();
  const { db, ids, scalar } = h;
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/coupons-integrated-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'navigator', 'HTMLInputElement',
    'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const rpcCalls = [], edgeCalls = [];
  const channels = new Set();
  const transport = {
    rpc(name, args) {
      rpcCalls.push({ name, args });
      const promise = h.rpc(name, args);
      promise.abortSignal = () => promise;
      return promise;
    },
    channel() {
      const channel = { on() { return this; }, subscribe(callback) { callback?.('SUBSCRIBED'); return this; } };
      channels.add(channel); return channel;
    },
    removeChannel(channel) { channels.delete(channel); },
    from(table) {
      assert(['contas_receber', 'matriculas'].includes(table));
      let rowId;
      return { select() { return this; }, eq(column, value) { assert.equal(column, 'id'); rowId = value; return this; },
        async maybeSingle() { return { data: (await db.query(`select * from public.${table} where id=$1`, [rowId])).rows[0] || null, error: null }; } };
    },
    functions: { async invoke(name, { body }) {
      assert.equal(name, 'payment-checkout');
      edgeCalls.push(body);
      assert.equal(body.couponCode, 'LOCAL50');
      assert.equal(body.alunoId, ids.student);
      assert.equal(body.amount, undefined);
      await h.asService();
      const result = await h.rpc('ead_coupon_prepare_checkout', {
        p_code: body.couponCode, p_aluno_id: body.alunoId, p_turma_id: body.turmaId,
        p_request_id: body.requestId, p_provider: 'banese_card', p_environment: 'sandbox',
        p_payment_method: 'BOLETO', p_due_date: '2028-12-31', p_description: 'Cobrança fictícia local — não pagável',
      });
      await h.asStudent();
      if (result.error) return result;
      return { error: null, data: { url: 'http://localhost/cobranca-ficticia', presentation: 'PIX',
        matriculaId: result.data.matriculaId, receivableId: result.data.receivableId,
        payment: { provider: 'banese_card', method: 'BOLETO', value: 49.95,
          pixQrCode: { payload: 'FICTICIO-NAO-PAGAVEL' } } } };
    } },
  };
  globalThis.__integratedCouponTransport = transport;
  let root, client, checkout;
  try {
    const outfile = resolve(temp, 'integrated.mjs');
    await build({ stdin: { resolveDir: base, contents: `
      export {default as CuponsEadPage} from './modules/gestor/secretaria/cupons-ead/CuponsEadPage';
      export {useCourseCheckout} from './modules/aluno/cursos/hooks/useCourseCheckout';
      export {default as EadCheckoutReviewModal} from './modules/aluno/cursos/components/EadCheckoutReviewModal';` },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      loader: { '.css': 'empty' }, define: { 'import.meta.env': JSON.stringify({ DEV: true,
        VITE_EAD_COUPONS_ENABLED: 'true', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }) },
      plugins: [{ name: 'local-postgres-boundary', setup(builder) {
        builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const supabase=globalThis.__integratedCouponTransport;' }));
      } }],
    });
    const { CuponsEadPage, useCourseCheckout, EadCheckoutReviewModal } = await import(pathToFileURL(outfile).href);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    root = createRoot(document.getElementById('root'));
    const render = component => act(async () => root.render(React.createElement(QueryClientProvider, { client }, component)));
    const settle = () => act(async () => { await new Promise(done => setTimeout(done, 40)); });
    const until = async (condition, label) => {
      for (let n = 0; n < 100; n++) { if (condition()) return; await settle(); }
      assert.fail(`${label}: ${document.body.textContent}`);
    };
    const button = text => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
    const input = async (selector, value) => act(async () => {
      const element = document.querySelector(selector); assert(element, selector);
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const createCoupon = async (code, free) => {
      await act(async () => button('Novo cupom').click());
      await input('#cupom-code', code);
      if (free) {
        await act(async () => document.getElementById('cupom-benefit').click());
        await until(() => [...document.querySelectorAll('[role="option"]')].some(option => option.textContent.includes('Curso gratuito')), 'opção gratuita');
        await act(async () => [...document.querySelectorAll('[role="option"]')].find(option => option.textContent.includes('Curso gratuito')).click());
      }
      await input('#cupom-student-limit', '2');
      await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await until(() => !document.querySelector('[role="dialog"]') && document.body.textContent.includes(code), `cadastro ${code}`);
    };
    await render(React.createElement(CuponsEadPage, { poloId: ids.polo, canManage: true, contextId: 'ficticio' }));
    await until(() => rpcCalls.some(call => call.name === 'ead_coupons_list'), 'listagem');
    await createCoupon('LOCALFREE', true);
    await createCoupon('LOCAL50', false);
    assert.equal(await scalar('select count(*)::int value from public.ead_coupons'), 2);

    await render(null); await client.cancelQueries(); client.clear(); await h.asStudent();
    function Student() {
      checkout = useCourseCheckout({ alunoId: ids.student, hasAlunoContext: true, queryClient: client,
        loadingTechnicalEnrollmentProfile: false, technicalEnrollmentMissingFields: [], invalidateStudentCourseAccess() {} });
      return checkout.eadCheckoutReview ? React.createElement(EadCheckoutReviewModal, { view: checkout }) : null;
    }
    await render(React.createElement(Student));
    const openCourse = async (id, code) => {
      await act(async () => checkout.openEadCheckoutReview({ id, nome: 'Curso fictício', modalidade: 'EAD', valor: 999,
        ead_config: { financeiro: { formasPagamento: ['BOLETO', 'PIX'] } } }));
      await until(() => document.querySelector('#ead-coupon-code'), 'disponibilidade dos cupons');
      await input('#ead-coupon-code', code);
      await act(async () => button('Aplicar').click());
      await until(() => Boolean(checkout.eadCoupon.quote), `cotação ${code}`);
    };
    await openCourse(ids.course, 'LOCALFREE');
    assert.equal(checkout.eadCoupon.quote.originalAmount, 200, 'valor vem do banco e não do catálogo fictício de R$999');
    await act(async () => { button('Confirmar curso gratuito').click(); button('Confirmar curso gratuito')?.click(); });
    await until(() => checkout.eadCheckoutReview === null, 'gratuidade');
    assert.equal(edgeCalls.length, 0);
    assert.equal(await scalar('select count(*)::int value from public.contas_receber'), 0);
    assert.equal(await scalar('select status value from public.matriculas where aluno_id=$1 and turma_id=$2', [ids.student, ids.turma]), 'ATIVO');

    await openCourse(ids.otherCourse, 'LOCAL50');
    assert.equal(checkout.eadCoupon.quote.payableAmount, 49.95);
    await act(async () => button('Pix').click());
    await act(async () => { button('Pagar R$\u00a049,95').click(); button('Pagar R$\u00a049,95')?.click(); });
    await until(() => Boolean(checkout.eadPaymentPanel), 'reserva com desconto');
    assert.equal(edgeCalls.length, 1);
    const receipt = (await db.query('select * from public.contas_receber')).rows[0];
    assert.equal(Number(receipt.valor), 49.95);
    assert.equal(await scalar('select status value from public.matriculas where id=$1', [receipt.matricula_id]), 'PENDENTE');
    await db.query("update public.contas_receber set status='PAGO',valor_pago=49.95,data_pagamento=current_date,gateway_status='PAID',origem_pagamento='BANESE' where id=$1", [receipt.id]);
    await assert.rejects(() => db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where receivable_id=$1", [receipt.id]));
    assert.equal(await scalar('select status value from public.matriculas where id=$1', [receipt.matricula_id]), 'PENDENTE', 'marcar situação paga sem prova não libera o curso');
    await h.recordSyntheticBankProof(receipt.id);
    await db.query("update public.inscricoes_online set status='PAGO',pago_em=now() where receivable_id=$1", [receipt.id]);
    assert.equal(await scalar('select status value from public.matriculas where id=$1', [receipt.matricula_id]), 'ATIVO');
    assert.equal(await scalar("select status value from public.ead_coupon_redemptions where receivable_id=$1", [receipt.id]), 'CONFIRMED');

    await render(null); await client.cancelQueries(); client.clear(); await h.asManager();
    await render(React.createElement(CuponsEadPage, { poloId: ids.polo, canManage: true, contextId: 'ficticio' }));
    await until(() => document.body.textContent.includes('LOCAL50'), 'histórico gestor');
    const article = [...document.querySelectorAll('article')].find(element => element.textContent.includes('LOCAL50'));
    await act(async () => [...article.querySelectorAll('button')].find(element => element.textContent.includes('Histórico')).click());
    await until(() => document.querySelector('[role="dialog"]')?.textContent.includes('Aluno fictício 1'), 'histórico pago');
    assert(document.querySelector('[role="dialog"]').textContent.includes('Recebido'));
    assert(document.querySelector('[role="dialog"]').textContent.includes('49,95'));
    assert.equal(await scalar('select sum(payable_amount)::numeric value from public.ead_coupon_redemptions'), '49.95');
  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear();
    assert.equal(channels.size, 0, 'canais removidos ao desmontar');
    dom.window.close(); delete globalThis.__integratedCouponTransport;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    await db.close(); await rm(temp, { recursive: true, force: true });
  }
});
