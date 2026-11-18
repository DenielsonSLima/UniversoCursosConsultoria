import assert from 'node:assert/strict';
import test from 'node:test';
import { createCuponsFixture, makeCoupon } from './cupons-ead.ui.fixture.mjs';

const future = '2099-12-01T12:00';
test('expirado e esgotado, cancelamento, validação e prorrogação preservam contrato', async () => {
  const f = createCuponsFixture();
  const { window, document, click, button, setValue } = f;
  try {
    const coupon = makeCoupon({ active: false, startsAt: '2020-01-01T00:00:12.123Z', endsAt: '2020-02-01T00:00:00Z', totalLimit: 1, reservedCount: 0, confirmedCount: 1 });
    window.coupons['polo-a'] = [coupon];
    await window.mount(); await f.flush();
    assert.match(document.querySelector('.cupom-status-badges').textContent, /ExpiradoDesativadoEsgotado/);
    await click(button('Prorrogar validade'));
    assert.match(document.querySelector('[role=dialog]').textContent, /continuará desativado/);
    assert.match(document.querySelector('[role=dialog]').textContent, /não libera novas utilizações/);
    await click(button('Cancelar'));
    assert.equal(document.querySelector('[role=dialog]'), null);
    assert.equal(window.requests.filter(r => r.name === 'ead_coupons_save').length, 0);
    await click(button('Prorrogar validade'));
    await setValue(document.getElementById('cupom-extend-end'), '2020-03-01T12:00');
    await click(button('Confirmar prorrogação'));
    assert.match(document.querySelector('[role=alert]').textContent, /deve ser futura/);
    await setValue(document.getElementById('cupom-extend-end'), future);
    await click(button('Confirmar prorrogação')); await f.flush();
    const { p_coupon: draft } = window.requests.find(r => r.name === 'ead_coupons_save').args;
    assert.equal(draft.active, false);
    assert.equal(draft.startsAt, coupon.startsAt);
    assert.equal(draft.updatedAt, coupon.updatedAt);
    assert.equal(draft.totalLimit, coupon.totalLimit);
    assert.equal('confirmedCount' in draft, false);
    assert.equal(document.querySelector('[role=dialog]'), null);
  } finally { await f.close(); }
});
test('erro de concorrência permanece visível e retry reutiliza requestId sem edição', async () => {
  const f = createCuponsFixture();
  const { window, document, click, button, setValue } = f;
  try {
    await window.mount(); await f.flush();
    await click(button('Prorrogar validade'));
    await setValue(document.getElementById('cupom-extend-end'), future);
    window.saveErrors.push({ code: 'PT409', message: 'O cupom foi alterado' });
    await click(button('Confirmar prorrogação')); await f.flush();
    assert.match(document.querySelector('[role=alert]').textContent, /Feche e reabra/);
    await click(button('Confirmar prorrogação')); await f.flush();
    const calls = window.requests.filter(r => r.name === 'ead_coupons_save');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id);
  } finally { await f.close(); }
});
test('virada de validade atualiza status ao recuperar foco sem consultar ou salvar', async () => {
  const f = createCuponsFixture();
  const { window, document } = f;
  try {
    let now = Date.parse('2026-11-17T12:00:00Z');
    window.Date.now = () => now;
    window.coupons['polo-a'] = [makeCoupon({ totalLimit: null, endsAt: '2026-11-17T12:00:01Z' })];
    await window.mount(); await f.flush();
    assert.equal(document.querySelector('.cupom-status-badges').textContent, 'Ativo');
    now += 1000;
    await window.interact(() => window.dispatchEvent(new window.Event('focus')));
    assert.equal(document.querySelector('.cupom-status-badges').textContent, 'Expirado');
    assert.equal(window.requests.filter(r => r.name === 'ead_coupons_save').length, 0);
  } finally { await f.close(); }
});
test('prorrogação pendente bloqueia segundo envio e fechamento', async () => {
  const f = createCuponsFixture();
  const { window, document, click, button, setValue } = f;
  let release;
  try {
    await window.mount(); await f.flush();
    await click(button('Prorrogar validade'));
    await setValue(document.getElementById('cupom-extend-end'), future);
    window.saveDelay = new Promise(resolve => { release = resolve; });
    await click(button('Confirmar prorrogação'));
    assert.equal(document.querySelector('fieldset').disabled, true);
    assert.equal(button('Cancelar').disabled, true);
    assert.equal(button('Salvando').disabled, true);
    await click(button('Salvando'));
    await window.interact(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.ok(document.querySelector('[role=dialog]'));
    assert.equal(window.requests.filter(r => r.name === 'ead_coupons_save').length, 1);
    release(); await f.flush(); await f.flush();
    assert.equal(document.querySelector('[role=dialog]'), null);
  } finally { release?.(); await f.close(); }
});
test('relógio atualiza no limite sem interação ou recarregamento', async () => {
  const f = createCuponsFixture();
  try {
    f.window.coupons['polo-a'] = [makeCoupon({ totalLimit: null, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 250).toISOString() })];
    await f.window.mount(); await f.flush();
    assert.equal(f.document.querySelector('.cupom-status-badges').textContent, 'Ativo');
    await f.flush(300);
    assert.equal(f.document.querySelector('.cupom-status-badges').textContent, 'Expirado');
  } finally { await f.close(); }
});
