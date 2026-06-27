import { useTurmasPaginadas } from '../../hooks/useTurmasPaginadas';

export const useGestaoLivresTurmas = (poloId?: string) => {
  return useTurmasPaginadas('LIVRE', poloId);
};
