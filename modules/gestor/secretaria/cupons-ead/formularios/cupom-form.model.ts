import type { EadCoupon, EadCouponDraft } from '../../../../ead/cupons/coupons-management.types';

export interface CupomFormState {
  code: string;
  discountPercent: '50' | '100';
  unlimited: boolean;
  totalLimit: string;
  startsAt: string;
  endsAt: string;
  perStudentLimit: string;
  active: boolean;
  allCourses: boolean;
  courseIds: string[];
}

export function toLocalDateTime(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function createCupomForm(coupon?: EadCoupon | null, now = new Date()): CupomFormState {
  return {
    code: coupon?.code || '',
    discountPercent: String(coupon?.discountPercent || 50) as '50' | '100',
    unlimited: coupon ? coupon.totalLimit === null : false,
    totalLimit: String(coupon?.totalLimit ?? 100),
    startsAt: toLocalDateTime(coupon?.startsAt || now),
    endsAt: toLocalDateTime(coupon?.endsAt || new Date(now.getTime() + 30 * 86_400_000)),
    perStudentLimit: String(coupon?.perStudentLimit || 1),
    active: coupon?.active ?? true,
    allCourses: coupon?.allCourses ?? true,
    courseIds: [...(coupon?.courseIds || [])],
  };
}

const positiveInteger = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function validateCupomForm(state: CupomFormState): string | null {
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(state.code.trim().toUpperCase())) return 'Use um código de 3 a 40 letras, números, hífen ou sublinhado, começando com letra ou número.';
  if (!['50', '100'].includes(state.discountPercent)) return 'Selecione um benefício válido.';
  if (!state.unlimited && !positiveInteger(state.totalLimit)) return 'Informe uma quantidade total inteira maior que zero.';
  if (!positiveInteger(state.perStudentLimit)) return 'Informe um limite inteiro maior que zero para cada aluno.';
  const start = new Date(state.startsAt).getTime();
  const end = new Date(state.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Informe o início e o fim da validade.';
  if (end <= start) return 'O fim da validade deve ser posterior ao início.';
  if (!state.allCourses && state.courseIds.length === 0) return 'Selecione ao menos um curso participante.';
  return null;
}

export function cupomFormToDraft(state: CupomFormState, id?: string, updatedAt?: string): EadCouponDraft {
  const error = validateCupomForm(state);
  if (error) throw new Error(error);
  return {
    ...(id ? { id } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    code: state.code.trim().toUpperCase(),
    discountPercent: Number(state.discountPercent) as 50 | 100,
    totalLimit: state.unlimited ? null : Number(state.totalLimit),
    startsAt: new Date(state.startsAt).toISOString(),
    endsAt: new Date(state.endsAt).toISOString(),
    perStudentLimit: Number(state.perStudentLimit),
    active: state.active,
    allCourses: state.allCourses,
    courseIds: state.allCourses ? [] : [...new Set(state.courseIds)],
  };
}
