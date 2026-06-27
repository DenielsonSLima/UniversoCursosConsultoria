import {
  cursosEspecializacaoQueryKeys,
  cursosEspecializacaoService,
} from '../cursos-especializacao.service';
import { useCursosPresenciaisQueries } from '../../hooks/useCursosPresenciaisQueries';

export function useCursosEspecializacaoQueries() {
  const { cursosQuery, invalidateCursos } = useCursosPresenciaisQueries({
    queryKeys: cursosEspecializacaoQueryKeys,
    getCursos: cursosEspecializacaoService.getCursos,
  });

  return {
    cursosQuery,
    invalidateCursosEspecializacao: invalidateCursos,
  };
}
