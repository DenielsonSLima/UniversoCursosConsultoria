import { cursosLivresQueryKeys, cursosLivresService } from '../cursos-livres.service';
import { useCursosPresenciaisQueries } from '../../hooks/useCursosPresenciaisQueries';

export function useCursosLivresQueries() {
  const { cursosQuery, invalidateCursos } = useCursosPresenciaisQueries({
    queryKeys: cursosLivresQueryKeys,
    getCursos: cursosLivresService.getCursos,
  });

  return {
    cursosQuery,
    invalidateCursosLivres: invalidateCursos,
  };
}
