import type { EadCoupon } from '../../../ead/cupons/coupons-management.types';

export interface CouponBadge { label: string; tone: string }

export function couponBadges(coupon: EadCoupon, now = Date.now()): CouponBadge[] {
  const expired = now >= Date.parse(coupon.endsAt);
  const scheduled = now < Date.parse(coupon.startsAt);
  const exhausted = coupon.totalLimit !== null && coupon.reservedCount + coupon.confirmedCount >= coupon.totalLimit;
  const badges: CouponBadge[] = [];
  if (expired) badges.push({ label: 'Expirado', tone: 'is-expired' });
  if (!coupon.active) badges.push({ label: 'Desativado', tone: '' });
  if (!expired && scheduled) badges.push({ label: 'Agendado', tone: 'is-review' });
  if (exhausted) badges.push({ label: 'Esgotado', tone: 'is-review' });
  if (!badges.length) badges.push({ label: 'Ativo', tone: 'is-active' });
  return badges;
}
