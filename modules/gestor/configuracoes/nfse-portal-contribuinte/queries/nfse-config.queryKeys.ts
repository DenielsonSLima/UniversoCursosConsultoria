export const nfseConfigQueryKeys = {
  polos: (contextKey: string, matrixPoloId: string, authUserId = '') => [
    'nfse-portal-contribuinte', authUserId, contextKey, matrixPoloId, 'polos',
  ] as const,
};
