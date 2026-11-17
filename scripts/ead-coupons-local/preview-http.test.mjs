import assert from 'node:assert/strict';
import test from 'node:test';

const address = process.env.COUPONS_PREVIEW_URL;
test('HTTP da prévia usa SQL local, dados fictícios e protege origem/identidades', { skip: !address }, async () => {
  const url = new URL(address);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.protocol, 'http:');
  const origin = url.origin;
  const html = await (await fetch(origin)).text();
  const token = html.match(/__LOCAL_COUPONS_TOKEN__="([a-f0-9]+)"/)[1];
  const request = async (path, identity = 'manager', body) => {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: {
      'content-type': 'application/json', 'x-local-coupons-token': token, 'x-preview-identity': identity,
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, value: await response.json() };
  };
  const rpc = async (identity, name, args) => request('/api/rpc', identity, { name, args });
  assert.equal((await fetch(origin + '/api/state')).status, 403);
  assert.equal((await fetch(origin + '/api/state', { headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(origin + '/main.js')).status, 200);
  assert.equal((await fetch(origin + '/main.css')).status, 200);
  const manager = (await request('/api/state')).value;
  const list = (await rpc('manager', 'ead_coupons_list', { p_polo_id: manager.poloId })).value;
  assert.ok(list.data.items.length >= 2);
  const code = `HTTP${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const saved = (await rpc('manager', 'ead_coupons_save', { p_polo_id: manager.poloId, p_request_id: crypto.randomUUID(), p_coupon: {
    code, discountPercent: 100, totalLimit: 2, perStudentLimit: 2, active: true, allCourses: false,
    courseIds: [manager.courses[0].id], startsAt: new Date(Date.now() - 86_400_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(),
  } })).value;
  assert.equal(saved.error, null);
  const quote = (await rpc('student-4', 'ead_coupon_quote', { p_code: code, p_course_id: manager.courses[0].id })).value;
  assert.equal(quote.error, null);
  const redeemed = (await rpc('student-4', 'ead_coupon_redeem_free', { p_code: code, p_turma_id: quote.data.turmaId, p_request_id: crypto.randomUUID() })).value;
  assert.equal(redeemed.data.status, 'CONFIRMED');
  let state = (await request('/api/state', 'student-4')).value;
  assert.equal(state.enrollments[0].status, 'ATIVO');
  assert.equal(state.payments.length, 0);
  const paidQuote = (await rpc('student-4', 'ead_coupon_quote', { p_code: 'LOCAL375', p_course_id: manager.courses[1].id })).value;
  assert.equal(paidQuote.data.discountPercent, 37.5);
  assert.equal(paidQuote.data.payableAmount, 62.44);
  const checkoutBody = { courseId: manager.courses[1].id, alunoId: state.alunoId, turmaId: paidQuote.data.turmaId,
    method: 'BOLETO', couponCode: 'LOCAL375', requestId: crypto.randomUUID() };
  const checkout = (await request('/api/checkout', 'student-4', checkoutBody)).value;
  assert.equal(checkout.error, null);
  assert.equal(checkout.data.awaitingConfirmation, true);
  assert.equal((await request('/api/checkout', 'student-4', checkoutBody)).value.data.receivableId, checkout.data.receivableId);
  state = (await request('/api/state', 'student-4')).value;
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].amount, 62.44);
  assert.equal(state.payments[0].redemptionStatus, 'RESERVED');
  assert.equal(state.enrollments.find(item => item.courseId === manager.courses[1].id).status, 'PENDENTE');
  assert.equal((await request('/api/simulate-payment', 'student-4', { receivableId: checkout.data.receivableId })).value.confirmed, true);
  state = (await request('/api/state', 'student-4')).value;
  assert.equal(state.enrollments.find(item => item.courseId === manager.courses[1].id).status, 'ATIVO');
  assert.equal(state.payments[0].status, 'PAGO');
  assert.equal(state.payments[0].redemptionStatus, 'CONFIRMED');
  const coupon = list.data.items.find(item => item.code === 'LOCAL375');
  const history = (await rpc('manager', 'ead_coupons_history', { p_polo_id: manager.poloId, p_coupon_id: coupon.id })).value;
  assert.equal(history.data.items.find(item => item.studentId === state.alunoId).receivedAmount, 62.44);
  assert.equal((await rpc('student-4', 'ead_coupons_list', { p_polo_id: manager.poloId })).value.error.code, '42501');
  assert.equal((await rpc('manager', 'delete_all_data', {})).status, 400);
});
