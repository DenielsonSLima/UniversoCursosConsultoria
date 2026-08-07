/**
 * O nome da coluna é legado: no modo `SEM_RATEIO`, ela representa o polo
 * responsável pelo contrato; nos demais modos, continua sendo a Matriz.
 */
export const getEmprestimosRealtimeSubscription = (poloResponsavelId: string) => ({
  table: 'emprestimos_financeiros',
  filter: `polo_matriz_id=eq.${poloResponsavelId}`,
});
