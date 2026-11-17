export const eadCouponStudentKeys = {
  student: (studentId: string) => ['ead-cupons', 'student', studentId] as const,
  quote: (studentId: string, courseId: string, code: string, turmaId?: string | null) =>
    [...eadCouponStudentKeys.student(studentId), 'quote', courseId, turmaId || null, code] as const,
};
