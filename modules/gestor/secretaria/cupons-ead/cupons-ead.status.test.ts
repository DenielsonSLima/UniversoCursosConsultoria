import test from 'node:test';
import assert from 'node:assert/strict';
import { couponBadges } from './cupons-ead.status.ts';
import { extendCupomDraft } from './formularios/cupom-extension.model.ts';
import type { EadCoupon } from '../../../ead/cupons/coupons-management.types.ts';

const coupon: EadCoupon = {
  id: 'coupon', poloId: 'polo', code: 'UNIEAD', discountPercent: 100, totalLimit: 1,
  startsAt: '2026-11-16T17:08:22.123Z', endsAt: '2026-11-16T17:20:14.123Z',
  perStudentLimit: 1, active: true, allCourses: false, courseIds: ['course'],
  reservedCount: 0, confirmedCount: 1, createdAt: '2026-11-16T17:08:22.123Z', updatedAt: '2026-11-16T18:00:00.001Z',
};
const labels = (data: EadCoupon, now: string) => couponBadges(data, Date.parse(now)).map(item => item.label);

test('expiração inclui instante final, nunca fica Ativo e mantém esgotamento', () => {
  assert.deepEqual(labels(coupon, coupon.endsAt), ['Expirado', 'Esgotado']);
  assert.deepEqual(labels({ ...coupon, totalLimit: null }, coupon.endsAt), ['Expirado']);
  assert.deepEqual(labels({ ...coupon, active: false }, coupon.endsAt), ['Expirado', 'Desativado', 'Esgotado']);
});
test('início inclusivo, agendado, desativado e reservas respeitam disponibilidade', () => {
  assert.deepEqual(labels({ ...coupon, totalLimit: null }, '2026-11-16T17:08:22.122Z'), ['Agendado']);
  assert.deepEqual(labels({ ...coupon, totalLimit: null }, coupon.startsAt), ['Ativo']);
  assert.deepEqual(labels({ ...coupon, totalLimit: null, active: false }, coupon.startsAt), ['Desativado']);
  assert.deepEqual(labels({ ...coupon, confirmedCount: 0, reservedCount: 1 }, coupon.startsAt), ['Esgotado']);
});
test('prorrogação muda só o fim, preservando precisão, limites e desativação', () => {
  const original = { ...coupon, active: false };
  const result = extendCupomDraft(original, '2026-12-17T20:00:00Z', Date.parse('2026-11-17T20:00:00Z'));
  for (const key of ['id', 'updatedAt', 'code', 'discountPercent', 'totalLimit', 'startsAt', 'perStudentLimit', 'active', 'allCourses'] as const) {
    assert.equal(result[key], original[key]);
  }
  assert.deepEqual(result.courseIds, original.courseIds);
  assert.notEqual(result.courseIds, original.courseIds);
  assert.equal(result.endsAt, '2026-12-17T20:00:00.000Z');
  assert.equal('reservedCount' in result, false);
  assert.equal('confirmedCount' in result, false);
  assert.deepEqual(labels({ ...original, ...result }, '2026-11-17T20:00:00Z'), ['Desativado', 'Esgotado']);
});
test('prorrogação rejeita data ausente, passada, igual ou anterior ao término atual', () => {
  for (const end of ['', 'invalid', coupon.endsAt, '2026-11-16T17:10:00Z', '2026-11-17T20:00:00Z']) {
    assert.throws(() => extendCupomDraft(coupon, end, Date.parse('2026-11-17T20:00:00Z')));
  }
  assert.throws(() => extendCupomDraft({ ...coupon, endsAt: '2027-01-01T00:00:00Z' }, '2026-12-01T00:00:00Z', Date.parse('2026-11-17T20:00:00Z')));
});
