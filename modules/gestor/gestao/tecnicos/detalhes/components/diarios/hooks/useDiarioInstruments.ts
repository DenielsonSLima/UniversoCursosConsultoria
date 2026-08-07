import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActiveInstruments } from '../diario-classe.types';
import { diarioClasseKeys } from '../diario-classe.keys';
import { diarioInstrumentsService } from '../diario-instruments.service';
import {
  DEFAULT_ACTIVE_INSTRUMENTS,
  DIARIO_INSTRUMENT_KEYS,
} from '../diario-instruments';

interface UseDiarioInstrumentsOptions {
  turmaId: string;
  disciplinaId: string;
  canEdit: boolean;
  onError?: (error: any) => void;
}

export const useDiarioInstruments = ({
  turmaId,
  disciplinaId,
  canEdit,
  onError,
}: UseDiarioInstrumentsOptions) => {
  const queryClient = useQueryClient();
  const [activeInstruments, setActiveInstruments] = useState<ActiveInstruments>(
    { ...DEFAULT_ACTIVE_INSTRUMENTS },
  );

  const query = useQuery({
    queryKey: diarioClasseKeys.instruments(turmaId, disciplinaId),
    queryFn: () => diarioInstrumentsService.get(turmaId, disciplinaId),
    enabled: Boolean(turmaId && disciplinaId),
  });

  const mutation = useMutation({
    mutationFn: (value: ActiveInstruments) =>
      diarioInstrumentsService.save(turmaId, disciplinaId, value),
    scope: { id: `diario-instruments-${turmaId}-${disciplinaId}` },
    onSuccess: async (saved) => {
      setActiveInstruments(saved);
      queryClient.setQueryData(
        diarioClasseKeys.instruments(turmaId, disciplinaId),
        saved,
      );
      await queryClient.invalidateQueries({
        queryKey: diarioClasseKeys.resultados(turmaId, disciplinaId),
      });
    },
    onError,
  });

  useEffect(() => {
    if (!query.isSuccess) return;
    setActiveInstruments(query.data ?? { ...DEFAULT_ACTIVE_INSTRUMENTS });
  }, [query.data, query.isSuccess]);

  const toggleInstrument = useCallback((key: keyof ActiveInstruments) => {
    if (!canEdit) return;
    setActiveInstruments((previous) => {
      const activeCount = DIARIO_INSTRUMENT_KEYS
        .filter((instrument) => previous[instrument]).length;
      if (previous[key] && activeCount === 1) {
        onError?.(new Error('Mantenha pelo menos um instrumento avaliativo ativo.'));
        return previous;
      }

      const next = { ...previous, [key]: !previous[key] };
      mutation.mutate(next, {
        onError: () => {
          setActiveInstruments(previous);
        },
      });
      return next;
    });
  }, [canEdit, mutation, onError]);

  return {
    activeInstruments,
    toggleInstrument,
    query,
    saving: mutation.isPending,
  };
};
