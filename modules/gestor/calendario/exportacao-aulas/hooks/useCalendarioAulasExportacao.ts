import { useMutation, useQuery } from '@tanstack/react-query';

import { calendarioAulasExportacaoQueryKeys } from '../calendarioAulasExportacao.queryKeys';
import { calendarioAulasExportacaoService } from '../services/calendarioAulasExportacao.service';
import type {
  CalendarioAulasModalidade,
  PrepararCalendarioAulasExportacaoInput,
} from '../types';

export function useCalendarioAulasTurmasQuery(
  poloId?: string | null,
  modalidade?: CalendarioAulasModalidade | null,
) {
  const scopedPoloId = poloId?.trim() || '';

  return useQuery({
    queryKey: calendarioAulasExportacaoQueryKeys.turmas(scopedPoloId, modalidade),
    queryFn: () => {
      if (!scopedPoloId || !modalidade) return [];
      return calendarioAulasExportacaoService.listarTurmas(scopedPoloId, modalidade);
    },
    enabled: Boolean(scopedPoloId && modalidade),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

/**
 * O payload de documento é deliberadamente uma mutation: ele só é preparado
 * quando o gestor pede a exportação e não é retido no cache de navegação.
 */
export function usePrepararCalendarioAulasExportacaoMutation() {
  return useMutation({
    mutationFn: (input: PrepararCalendarioAulasExportacaoInput) => (
      calendarioAulasExportacaoService.preparar(input)
    ),
    retry: false,
  });
}
