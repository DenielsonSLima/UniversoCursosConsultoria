const activeClasses = new Map<string, number>();
export const isManualCycleObservationActive = (turmaId: string) => (activeClasses.get(turmaId) ?? 0) > 0;
export function beginManualCycleObservation(turmaId: string) {
  activeClasses.set(turmaId, (activeClasses.get(turmaId) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const remaining = (activeClasses.get(turmaId) ?? 1) - 1;
    if (remaining > 0) activeClasses.set(turmaId, remaining); else activeClasses.delete(turmaId);
  };
}
