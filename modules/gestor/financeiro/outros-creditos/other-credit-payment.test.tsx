import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OtherCreditPaymentContent } from './OtherCreditPaymentModal';
import { getOtherCreditPayment, refreshOtherCreditPayment, safeOtherCreditLink, shouldWatchOtherCredit, type OtherCreditPayment } from './other-credit-payment.service';
import { supabase } from '../../../../lib/supabase';
import { buildBanesePixImageFixture, buildBanesePixPayloadFixture } from '../../../../supabase/functions/banese/internal/testing/pix-fixture';

const base: OtherCreditPayment = {
  payment: {
    id: '00000000-0000-4000-8000-000000000001', categoria: 'OUTROS_CREDITOS',
    descricao: 'Crédito de teste', valor: 300, status: 'PENDENTE', data_vencimento: '2026-09-26',
    gateway_environment: 'production', gateway_provider: 'banese_card', gateway_payment_method: 'BOLETO',
    gateway_boleto_linha_digitavel: '1'.repeat(47), gateway_boleto_codigo_barras: '2'.repeat(44),
  },
  customerName: 'Pagador de teste', canPay: true, canRefresh: true,
  boletoAvailable: true, pixState: 'pending', needsReview: false,
};
const html = (data: OtherCreditPayment) => renderToStaticMarkup(<OtherCreditPaymentContent data={data} />);
const completePix = (): OtherCreditPayment => ({
  ...base, pixState: 'available', payment: { ...base.payment,
    gateway_pix_payload: buildBanesePixPayloadFixture('SYNTHETICPDV', 300),
    gateway_pix_encoded_image: `data:image/png;base64,${buildBanesePixImageFixture(1)}`,
  },
});

test('QR sintético válido aparece em destaque com copia e cola, sem chamada de rede', t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Rede proibida neste teste'); });
  const data = completePix();
  const text = html(data);
  assert.match(text, /<img[^>]+alt="QR Code Pix oficial desta cobrança Banese"/);
  assert.match(text, /data:image\/png;base64,/);
  assert.match(text, /sm:h-\[280px\]/);
  assert.match(text, /Copiar Pix/);
  assert.match(text, /Resumo do atendimento/);
  assert.ok(text.includes(data.payment.gateway_pix_payload!));
  assert.equal(fetch.mock.callCount(), 0);
});

test('Pix parcial, inválido ou ainda pendente não mostra imagem ou copia e cola', () => {
  for (const data of [
    { ...completePix(), pixState: 'pending' as const },
    { ...completePix(), payment: { ...completePix().payment, gateway_pix_payload: 'invalido' } },
    { ...completePix(), payment: { ...completePix().payment, gateway_pix_encoded_image: null } },
    { ...completePix(), pixState: 'sandbox-unavailable' as const, payment: { ...completePix().payment, gateway_environment: 'sandbox' } },
  ]) {
    const text = html(data);
    assert.doesNotMatch(text, /<img|Copiar Pix|Ver código Pix copia e cola/);
    assert.match(text, /Boleto da mesma cobrança/);
  }
});

test('status terminal sempre suprime ações mesmo diante de capacidades antigas', () => {
  for (const changes of [
    { status: 'PAGO' }, { status: 'CANCELADO' }, { status: 'ESTORNADO' }, { status: 'DEVOLVIDO' },
    { gateway_status: 'PAID' }, { gateway_status: 'CONFIRMED' }, { gateway_status: 'CANCELED_BY_BANK' },
  ]) {
    const data = { ...completePix(), payment: { ...completePix().payment, ...changes } };
    const text = renderToStaticMarkup(<OtherCreditPaymentContent data={data} onRefresh={() => {}} onOpenDocument={() => {}} />);
    assert.doesNotMatch(text, /<img|Copiar Pix|Copiar linha digitável|Abrir boleto PDF|Verificar pagamento/);
  }
});

test('consulta e documento respeitam capacidades e bloqueiam cliques durante carregamento', () => {
  const callbacks = { onRefresh() {}, onOpenDocument() {} };
  const text = renderToStaticMarkup(<OtherCreditPaymentContent data={base} {...callbacks} refreshPending documentPending />);
  assert.match(text, /Verificando pagamento/);
  assert.match(text, /Preparando PDF/);
  assert.ok((text.match(/disabled=""/g) || []).length >= 2);
  const blocked = renderToStaticMarkup(<OtherCreditPaymentContent data={{ ...base, canRefresh: false, boletoAvailable: false }} {...callbacks} />);
  assert.doesNotMatch(blocked, /Verificar pagamento|Abrir boleto PDF|Copiar linha digitável/);
});

test('PDV exibe valor canônico, boleto existente e Pix pendente sem sugerir reemissão', () => {
  const text = html(base);
  assert.match(text, /300,00/);
  assert.match(text, /Aguardando pagamento/);
  assert.match(text, /Boleto da mesma cobrança/);
  assert.doesNotMatch(text, /<img|reemiss|cancelamento|Pagamento confirmado/);
});

test('pagamento confirmado retira meios de pagamento e mostra o recebido canônico', () => {
  const text = html({ ...base, canPay: false, boletoAvailable: false, payment: {
    ...base.payment, status: 'PAGO', valor_pago: 297, data_pagamento: '2026-09-26',
  } });
  assert.match(text, /Pagamento confirmado/);
  assert.match(text, /297,00/);
  assert.doesNotMatch(text, /Boleto da mesma|Aguardando pagamento|<img/);
});

test('cancelamento ou ambiguidade não expõem boleto/QR mesmo com campos antigos', () => {
  for (const status of ['CANCELADO', 'ESTORNADO', 'AGUARDANDO_CONFIRMACAO']) {
    const text = html({ ...base, canPay: false, payment: { ...base.payment, status } });
    assert.doesNotMatch(text, /Boleto da mesma cobrança|1{10}|<img|Pagamento confirmado/);
  }
});

test('leitura privada valida o mesmo ID e preserva AbortSignal', async t => {
  const controller = new AbortController();
  const calls: any[] = [];
  const invoke = t.mock.method(Object.getPrototypeOf(supabase.functions), 'invoke', async (name: string, options: any) => {
    calls.push({ name, options });
    return { data: base, error: null };
  });
  assert.equal(await getOtherCreditPayment(base.payment.id, controller.signal), base);
  assert.deepEqual(calls[0].options.body, { action: 'get', receivableId: base.payment.id });
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].name, 'gestor-other-credit-payment');
  invoke.mock.mockImplementation(async () => ({ data: { ...base, payment: { ...base.payment, id: 'outro' } }, error: null }));
  await assert.rejects(getOtherCreditPayment(base.payment.id, controller.signal), /não disponível/);
});

test('consulta manual usa somente refresh, uma vez, com cancelamento definido', async t => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
  } });
  try {
    const calls: any[] = [];
    t.mock.method(Object.getPrototypeOf(supabase.functions), 'invoke', async (name: string, options: any) => {
      calls.push({ name, options }); return { data: { success: true }, error: null };
    });
    await refreshOtherCreditPayment(base.payment.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'asaas-api');
    assert.deepEqual(calls[0].options.body, { action: 'refresh-receivable-status', receivableId: base.payment.id });
    assert.ok(calls[0].options.signal instanceof AbortSignal);
  } finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow }); }
});

test('acompanhamento para em erro, encerramento ou dez minutos; links inseguros são rejeitados', () => {
  assert.equal(shouldWatchOtherCredit(base, false, 0, 599_999), true);
  assert.equal(shouldWatchOtherCredit(base, false, 0, 600_000), false);
  assert.equal(shouldWatchOtherCredit(base, true, 0, 1), false);
  assert.equal(shouldWatchOtherCredit({ ...base, canPay: false }, false, 0, 1), false);
  assert.equal(shouldWatchOtherCredit(undefined, false, 0, 1), false);
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://user:secret@example.com', '/relative']) {
    assert.equal(safeOtherCreditLink(value), null);
  }
  assert.equal(safeOtherCreditLink('https://universocc.com.br/aluno'), 'https://universocc.com.br/aluno');
});
