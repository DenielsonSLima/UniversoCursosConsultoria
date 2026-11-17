export interface EadCouponQuote {
  couponId: string;
  requestId?: string;
  turmaId: string;
  code: string;
  discountPercent: number;
  originalAmount: number;
  discountAmount: number;
  payableAmount: number;
}

export interface EadCouponFreeRedemption {
  matriculaId: string;
  couponId: string;
  status: 'CONFIRMED';
  originalAmount: number;
  discountAmount: number;
  payableAmount: 0;
}

export interface EadCouponQuoteInput {
  code: string;
  courseId: string;
  turmaId?: string | null;
}

export interface EadCouponFreeInput {
  code: string;
  turmaId: string;
  requestId: string;
}
