/** Não repete automaticamente uma leitura já cancelada pelo PostgreSQL. */
export const retryDatabaseRead = (failureCount: number, error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error && error.code === '57014') {
    return false;
  }
  return failureCount < 1;
};
