import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';

const base = fileURLToPath(new URL('../../../', import.meta.url));
const jsdom = process.env.EAD_TEST_JSDOM_MODULE;
const { JSDOM } = await import(jsdom ? pathToFileURL(resolve(jsdom)).href : 'jsdom');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const syntheticQuote = {
  couponId: 'coupon-synthetic', turmaId: 'turma-synthetic', code: 'METADE', discountPercent: 50,
  originalAmount: 123.46, discountAmount: 61.73, payableAmount: 61.73,
};

const compile = async (directory, dev, supabaseUrl = 'http://127.0.0.1:54321') => {
  const outfile = resolve(directory, `student-${dev}-${supabaseUrl.includes('supabase.co') ? 'official' : 'local'}.mjs`);
  const compiled = await build({ stdin: { resolveDir: base, contents: `
    export {useCourseCheckout} from './modules/aluno/cursos/hooks/useCourseCheckout';
    export {default as EadCheckoutReviewModal} from './modules/aluno/cursos/components/EadCheckoutReviewModal';
    export {eadCouponStudentService,parseEadCouponQuote,parseEadCouponFreeRedemption} from './modules/ead/cupons/coupons-student.service';
    export {paymentCheckoutService} from './modules/asaas/asaas.service';` },
  bundle: true, write: false, outfile, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
  loader: { '.css': 'empty' }, define: { 'import.meta.env': JSON.stringify({ DEV: dev,
    VITE_EAD_COUPONS_ENABLED: 'true', VITE_SUPABASE_URL: supabaseUrl }) },
  plugins: [{ name: 'isolated-coupon-transport', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const supabase=globalThis.__studentCouponTransport;' }));
  } }] });
  await writeFile(outfile, compiled.outputFiles[0].contents);
  return import(pathToFileURL(outfile).href);
};

test('checkout EAD usa cotação canônica, protege resgate, mantém idempotência e isola identidade', async () => {
  await mkdir(resolve(base, 'tmp'), { recursive: true });
  const temp = await mkdtemp(resolve(base, 'tmp/coupon-student-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  }
  const rpcCalls = [], edgeCalls = [], channels = [];
  let quoteResponse = syntheticQuote, quoteWait = null, freeWait = null, edgeWait = null, edgeError = null;
  let invalidations = 0, freeCalls = 0, available = true;
  globalThis.__studentCouponTransport = {
    rpc(name, body) {
      rpcCalls.push({ name, body });
      let promise;
      if (name === 'ead_coupons_available') {
        promise = Promise.resolve({ data: available, error: null });
      } else if (name === 'ead_coupon_quote') {
        promise = quoteWait ? quoteWait.promise : Promise.resolve({ data: quoteResponse, error: null });
      } else if (name === 'ead_coupon_redeem_free') {
        freeCalls++;
        promise = freeWait ? freeWait.promise : Promise.resolve({ data: {
          matriculaId: 'enrollment-synthetic', couponId: syntheticQuote.couponId, status: 'CONFIRMED',
          originalAmount: 123.46, discountAmount: 123.46, payableAmount: 0,
        }, error: null });
      } else throw new Error(`Unexpected RPC ${name}`);
      promise.abortSignal = () => promise;
      return promise;
    },
    functions: { async invoke(name, { body }) {
      assert.equal(name, 'payment-checkout'); edgeCalls.push(body);
      if (edgeWait) return edgeWait.promise;
      if (edgeError) return { data: null, error: new Error(edgeError) };
      return { data: { url: 'http://localhost/synthetic-payment', receivableId: 'receivable-synthetic', matriculaId: 'enrollment-synthetic', presentation: 'PIX',
        payment: { provider: 'banese', method: 'BOLETO', value: body.couponCode ? 61.73 : 123.46, pixQrCode: { payload: 'synthetic-pix' } } }, error: null };
    } },
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { status: 'PENDENTE' }, error: null }) }; },
    channel(name) {
      const channel = { name, handlers: [], removed: false,
        on(_kind, filter, callback) { this.handlers.push({ filter, callback }); return this; },
        subscribe(callback) { this.status = callback; return this; } };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { channel.removed = true; },
  };
  let root, client;
  try {
    const module = await compile(temp, true);
    const { useCourseCheckout, EadCheckoutReviewModal, parseEadCouponQuote, parseEadCouponFreeRedemption } = module;
    assert.throws(() => parseEadCouponQuote({ ...syntheticQuote, discountPercent: '50' }), /inválidos/);
    assert.throws(() => parseEadCouponQuote({ ...syntheticQuote, payableAmount: -1 }), /inválidos/);
    assert.throws(() => parseEadCouponQuote({ ...syntheticQuote, discountPercent: 100 }), /inválidos/);
    assert.throws(() => parseEadCouponFreeRedemption({ status: 'PENDING' }), /inválido/);
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 1, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
    let view;
    function Harness({ alunoId }) {
      view = useCourseCheckout({ alunoId, hasAlunoContext: true, queryClient: client,
        loadingTechnicalEnrollmentProfile: false, technicalEnrollmentMissingFields: [],
        invalidateStudentCourseAccess: () => { invalidations++; } });
      return view.eadCheckoutReview ? React.createElement(EadCheckoutReviewModal, { view })
        : React.createElement('output', null, view.eadPaymentConfirmation);
    }
    root = createRoot(document.getElementById('root'));
    const settle = async (ms = 25) => act(async () => { await new Promise(done => setTimeout(done, ms)); });
    const render = async alunoId => { await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { alunoId })))); await settle(); };
    const course = { id: 'course-synthetic', nome: 'Curso fictício', modalidade: 'EAD', valor: 999 };
    const apply = async code => {
      await act(async () => view.eadCoupon.setCode(code));
      await act(async () => view.eadCoupon.apply()); await settle(); await settle();
    };
    const click = async label => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
      assert(button, `Button not found: ${label}`);
      await act(async () => button.click()); await settle();
    };
    await render('student-synthetic');
    await act(async () => view.openEadCheckoutReview(course)); await settle();
    assert(document.querySelector('[aria-label="Cupom de desconto"]'));
    assert.equal(view.eadCoupon.quote, null);
    await apply(' metade ');
    assert(rpcCalls.some(call => call.name === 'ead_coupons_available'));
    assert.deepEqual(rpcCalls.find(call => call.name === 'ead_coupon_quote').body, { p_code: 'METADE', p_course_id: course.id });
    assert.equal(view.eadCoupon.quote.payableAmount, 61.73, 'Server quotation replaces stale catalogue amount');
    assert.match(document.body.textContent, /61,73/);
    assert.match(document.body.textContent, /123,46/);
    assert(!document.body.textContent.includes('999,00'));
    const studentChannel = channels.find(c => c.name.startsWith('ead-coupon-student'));
    assert.deepEqual(studentChannel.handlers.map(h => h.filter.filter), ['coupon_id=eq.coupon-synthetic', 'aluno_id=eq.student-synthetic']);
    const beforeRefresh = rpcCalls.length;
    await act(async () => studentChannel.handlers[0].callback()); await settle(250); await settle();
    assert(rpcCalls.length > beforeRefresh, 'Realtime refreshes the active coupon quotation automatically');

    await act(async () => view.setEadPaymentMethod('PIX'));
    edgeError = 'Resposta temporária de teste';
    await act(async () => {
      view.startCheckout(course, { id: syntheticQuote.turmaId }, { method: 'BOLETO', presentation: 'PIX', installments: 1 }, 'METADE');
      view.startCheckout(course, { id: syntheticQuote.turmaId }, { method: 'BOLETO', presentation: 'PIX', installments: 1 }, 'METADE');
    }); await settle();
    assert.equal(edgeCalls.length, 1, 'Double click performs one checkout');
    assert.equal(edgeCalls[0].couponCode, 'METADE');
    assert.equal(edgeCalls[0].turmaId, syntheticQuote.turmaId);
    assert(!('amount' in edgeCalls[0]), 'Frontend cannot submit a discounted amount');
    edgeError = null;
    await click('Pagar R$ 61,73');
    assert.equal(edgeCalls.length, 2);
    assert.equal(edgeCalls[1].requestId, edgeCalls[0].requestId, 'An ambiguous retry keeps the request identity');
    assert.equal(view.eadPaymentConfirmation, '', 'A 50% coupon never confirms course access without payment');
    assert.equal(view.eadPaymentPanel.payment.value, 61.73);
    await act(async () => view.setEadPaymentPanel(null));
    assert(invalidations > 0);

    await act(async () => view.openEadCheckoutReview(course));
    await apply('METADE');
    quoteResponse = { ...syntheticQuote, requestId: '00000000-0000-4000-8000-000000000001' };
    await act(async () => view.eadCoupon.apply()); await settle(); await settle();
    await act(async () => view.setEadPaymentMethod('PIX'));
    await click('Pagar R$ 61,73');
    assert.equal(edgeCalls.at(-1).requestId, quoteResponse.requestId, 'A resumed reservation uses its original server request identity');
    await act(async () => view.setEadPaymentPanel(null));
    quoteResponse = syntheticQuote;
    await act(async () => view.openEadCheckoutReview(course)); await apply('METADE');
    await act(async () => view.eadCoupon.clear());
    assert.equal(view.eadCoupon.quote, null);
    assert.equal(view.eadCoupon.code, '');
    await act(async () => view.startCheckout(course, null, { method: 'BOLETO', presentation: 'PIX', installments: 1 })); await settle();
    assert(!('couponCode' in edgeCalls.at(-1)), 'The original checkout payload remains coupon-free');
    await act(async () => view.setEadPaymentPanel(null));

    quoteResponse = { ...syntheticQuote, code: 'GRATIS', discountPercent: 100, discountAmount: 123.46, payableAmount: 0 };
    await act(async () => view.openEadCheckoutReview(course)); await apply('gratis');
    assert.equal(document.querySelector('[aria-labelledby="ead-checkout-title"]').getAttribute('aria-modal'), 'true');
    assert(![...document.querySelectorAll('button')].some(node => node.textContent === 'Pix'));
    const beforeFreeEdge = edgeCalls.length;
    freeWait = deferred();
    await act(async () => { view.eadCoupon.redeemFree(); view.eadCoupon.redeemFree(); }); await settle();
    assert.equal(freeCalls, 1);
    assert([...document.querySelectorAll('button')].find(node => node.textContent.includes('Confirmar curso gratuito')).disabled);
    await click('Voltar'); assert(view.eadCheckoutReview, 'Closing is blocked while a redemption is pending');
    const pendingFree = freeWait; freeWait = null;
    await act(async () => pendingFree.resolve({ data: { matriculaId: 'enrollment-free', couponId: syntheticQuote.couponId,
      status: 'CONFIRMED', originalAmount: 123.46, discountAmount: 123.46, payableAmount: 0 }, error: null })); await settle();
    assert.equal(view.eadCheckoutReview, null);
    assert.match(view.eadPaymentConfirmation, /Gratuidade por cupom confirmada/);
    assert.equal(edgeCalls.length, beforeFreeEdge, 'Free redemption never invokes a bank provider');
    await act(async () => view.openEadCheckoutReview(course)); await apply('GRATIS');
    freeWait = deferred();
    await act(async () => view.eadCoupon.redeemFree()); await settle();
    const ambiguousRequest = rpcCalls.findLast(call => call.name === 'ead_coupon_redeem_free').body.p_request_id;
    const lostFree = freeWait; freeWait = null;
    await act(async () => lostFree.resolve({ data: null, error: { message: 'Resposta perdida após confirmação fictícia' } })); await settle();
    assert(view.eadCheckoutReview, 'A failed response keeps the review open');
    quoteResponse = { ...quoteResponse, requestId: ambiguousRequest };
    await act(async () => client.invalidateQueries({ queryKey: ['ead-cupons', 'student', 'student-synthetic'] })); await settle();
    assert.equal(view.eadCoupon.quote.requestId, ambiguousRequest);
    await click('Confirmar curso gratuito');
    assert.equal(rpcCalls.findLast(call => call.name === 'ead_coupon_redeem_free').body.p_request_id, ambiguousRequest,
      'A confirmed free redemption with a lost response replays the original server request');
    assert.equal(view.eadCheckoutReview, null);
    assert.equal(edgeCalls.length, beforeFreeEdge);


    await act(async () => view.openEadCheckoutReview(course));
    quoteWait = deferred();
    await act(async () => view.eadCoupon.setCode('GRATIS'));
    await act(async () => view.eadCoupon.apply()); await settle();
    const oldWait = quoteWait; quoteWait = null;
    await render('other-student-synthetic');
    assert.equal(view.eadCoupon.code, ''); assert.equal(view.eadCoupon.quote, null);
    await act(async () => oldWait.resolve({ data: quoteResponse, error: null })); await settle();
    assert.equal(view.eadCoupon.quote, null, 'An old identity quotation cannot populate another student');
    assert(channels.filter(c => c.name.startsWith('ead-coupon-student')).every(c => c.removed));

    quoteResponse = syntheticQuote;
    await apply('METADE');
    edgeWait = deferred();
    await act(async () => view.startCheckout(course, { id: syntheticQuote.turmaId }, { method: 'BOLETO', presentation: 'PIX', installments: 1 }, 'METADE'));
    await settle();
    const oldEdge = edgeWait; edgeWait = null;
    await render('third-student-synthetic');
    await act(async () => oldEdge.resolve({ data: { url: 'http://localhost/old-payment', presentation: 'PIX',
      payment: { provider: 'banese', method: 'BOLETO', pixQrCode: { payload: 'old-student-pix' } } }, error: null })); await settle();
    assert(view.eadCheckoutReview, 'An old identity checkout response cannot close the current review');
    assert.equal(view.eadPaymentPanel, null, 'A previous student payment panel is discarded');
    quoteResponse = { ...syntheticQuote, code: 'GRATIS', discountPercent: 100, discountAmount: 123.46, payableAmount: 0 };
    await apply('GRATIS'); freeWait = deferred();
    await act(async () => view.eadCoupon.redeemFree()); await settle();
    const oldFree = freeWait; freeWait = null;
    await render('fourth-student-synthetic');
    await act(async () => oldFree.resolve({ data: { matriculaId: 'enrollment-prior-student', couponId: syntheticQuote.couponId,
      status: 'CONFIRMED', originalAmount: 123.46, discountAmount: 123.46, payableAmount: 0 }, error: null })); await settle();
    assert(view.eadCheckoutReview, 'An old identity free redemption cannot close the current review');
    assert.equal(view.eadCoupon.quote, null);

    const production = await compile(temp, false);
    const beforeBlocked = rpcCalls.length, beforeBlockedEdge = edgeCalls.length;
    await assert.rejects(production.eadCouponStudentService.quote({ code: 'GRATIS', courseId: course.id }), /neste ambiente/);
    await assert.rejects(production.eadCouponStudentService.redeemFree({ code: 'GRATIS', turmaId: 'x', requestId: 'x' }), /neste ambiente/);
    await assert.rejects(production.paymentCheckoutService.getPublicCheckout(course.id, 'student', null, undefined, null, 'request', 'METADE'), /neste ambiente/);
    assert.equal(rpcCalls.length, beforeBlocked); assert.equal(edgeCalls.length, beforeBlockedEdge);
    dom.reconfigure({ url: 'https://www.universocc.com.br/' });
    const official = await compile(temp, false, 'https://kfekgwyqozhicpfuunpo.supabase.co');
    quoteResponse = syntheticQuote;
    assert.equal((await official.eadCouponStudentService.quote({ code: 'METADE', courseId: course.id })).payableAmount, 61.73,
      'The authorized production host and Supabase project can use the server contract');
    dom.reconfigure({ url: 'http://localhost/' });
    await apply('METADE');
    available = false;
    await act(async () => client.invalidateQueries({ queryKey: ['ead-cupons', 'availability'] })); await settle();
    assert.equal(view.eadCoupon.enabled, false);
    assert.equal(view.eadCoupon.visible, true, 'An entered code remains visible if the server disables coupons');
    assert.equal(view.eadCoupon.quote, null);
    assert.match(view.eadCoupon.error, /Remova o código/);
    const fullPrice = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Continuar para pagamento'));
    assert(fullPrice?.disabled, 'A capability change cannot silently turn a discounted purchase into a full-price charge');
    await act(async () => view.eadCoupon.clear());
    assert.equal(view.eadCoupon.visible, false);

  } finally {
    if (root) await act(async () => root.unmount());
    client?.clear(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
    delete globalThis.__studentCouponTransport;
    await rm(temp, { recursive: true, force: true });
  }
});
