export const getCalendarioAulasRealtimeSubscription = (turmaId: string) => ({
  table: 'aulas_turma',
  filter: `turma_id=eq.${turmaId}`,
});
