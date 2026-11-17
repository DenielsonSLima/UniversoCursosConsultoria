import type { EadCoupon, EadCouponDraft } from '../../../../ead/cupons/coupons-management.types';

export function extendCupomDraft(coupon: EadCoupon, endsAt: string, now = Date.now()): EadCouponDraft {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) throw new Error('Informe a nova data e hora de validade.');
  if (end <= Math.max(now, Date.parse(coupon.endsAt), Date.parse(coupon.startsAt))) {
    throw new Error('A nova validade deve ser futura e posterior ao fim atual.');
  }
  return {
    id: coupon.id, updatedAt: coupon.updatedAt, code: coupon.code,
    discountPercent: coupon.discountPercent, totalLimit: coupon.totalLimit,
    startsAt: coupon.startsAt, endsAt: new Date(end).toISOString(),
    perStudentLimit: coupon.perStudentLimit, active: coupon.active,
    allCourses: coupon.allCourses, courseIds: [...coupon.courseIds],
  };
}
