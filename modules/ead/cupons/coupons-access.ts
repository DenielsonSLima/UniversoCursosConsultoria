/** A RPC repete a autorização por identidade e polo; esta guarda só controla a interface. */
export const hasEadCouponManagementAccess = (permissions: unknown, isMatriz: unknown = false): boolean => {
  if (isMatriz !== true || !permissions || typeof permissions !== 'object') return false;
  const modules = (permissions as { modules?: unknown }).modules;
  return Array.isArray(modules) && modules.includes('secretaria') && modules.includes('financeiro');
};
