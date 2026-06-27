import { useTurmasPaginadas } from '../../hooks/useTurmasPaginadas';

export const useGestaoEspecializacaoTurmas = (poloId?: string) => {
  return useTurmasPaginadas('ESPECIALIZACAO', poloId);
};
