export const cuponsEadKeys = {
  scope: (poloId: string, contextId: string) => ['ead-coupons', 'management', contextId, poloId] as const,
  list: (poloId: string, contextId: string, search: string, page: number) =>
    [...cuponsEadKeys.scope(poloId, contextId), 'list', search, page] as const,
  history: (poloId: string, contextId: string, couponId: string, page: number) =>
    [...cuponsEadKeys.scope(poloId, contextId), 'history', couponId, page] as const,
  courses: (poloId: string, contextId: string, search: string) =>
    [...cuponsEadKeys.scope(poloId, contextId), 'courses', search] as const,
};
