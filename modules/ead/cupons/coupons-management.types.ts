export interface EadCoupon {
  id: string;
  poloId: string;
  code: string;
  discountPercent: 50 | 100;
  totalLimit: number | null;
  startsAt: string;
  endsAt: string;
  perStudentLimit: number;
  active: boolean;
  allCourses: boolean;
  courseIds: string[];
  reservedCount: number;
  confirmedCount: number;
  createdAt: string;
  updatedAt: string;
}

export type EadCouponDraft = Pick<EadCoupon,
  'code' | 'discountPercent' | 'totalLimit' | 'startsAt' | 'endsAt'
  | 'perStudentLimit' | 'active' | 'allCourses' | 'courseIds'
> & { id?: string; updatedAt?: string };

export interface EadCouponHistoryItem {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  status: 'RESERVED' | 'CONFIRMED' | 'RELEASED';
  originalAmount: number;
  discountAmount: number;
  payableAmount: number;
  receivedAmount: number;
  receivableId: string | null;
  matriculaId: string | null;
  createdAt: string;
  confirmedAt: string | null;
  releasedAt?: string | null;
  reviewRequired: boolean;
}

export interface EadCouponCourseOption { id: string; name: string }

export interface EadCouponPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SaveEadCouponInput {
  poloId: string;
  coupon: EadCouponDraft;
  requestId: string;
}
