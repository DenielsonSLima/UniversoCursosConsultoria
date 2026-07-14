const normalizeStatus = (status?: string | null) => (status || '').trim().toUpperCase();

export const isActivePortalStatus = (status?: string | null) => {
  if (!status) return true;
  const normalized = normalizeStatus(status);
  return normalized !== 'INATIVO'
    && normalized !== 'INACTIVE'
    && normalized !== 'BLOQUEADO';
};
