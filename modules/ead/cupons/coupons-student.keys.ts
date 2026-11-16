export const eadCouponStudentKeys = {
  student: (studentId: string) => ['ead-cupons', 'student', studentId] as const,
  quote: (studentId: string, courseId: string, code: string) =>
    [...eadCouponStudentKeys.student(studentId), 'quote', courseId, code] as const,
};
