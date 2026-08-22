import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { planoFinanceiroUnicoService } from '../../../presencial-financeiro-unico/presencial-financeiro-unico.service';
import type { TurmaPlanoUnicoFormData } from './turma-plano-unico-form.types';

const useDebouncedValue = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
};

export const useTurmaPlanoUnicoPreview = (formData: TurmaPlanoUnicoFormData) => {
  const rawInput = useMemo(() => ({
    cursoId: formData.cursoId,
    poloId: formData.poloId,
    plano: {
      valorTotal: formData.valorTotal,
      qtdParcelas: formData.qtdParcelas,
      primeiroVencimento: formData.primeiroVencimento,
      descontoPontualidade: formData.descontoPontualidade,
      jurosAtrasoPercentual: formData.jurosAtrasoPercentual,
      multaAtraso: formData.multaAtraso,
    },
  }), [
    formData.cursoId,
    formData.descontoPontualidade,
    formData.jurosAtrasoPercentual,
    formData.multaAtraso,
    formData.poloId,
    formData.primeiroVencimento,
    formData.qtdParcelas,
    formData.valorTotal,
  ]);
  const input = useDebouncedValue(rawInput);
  const enabled = Boolean(
    input.cursoId
    && input.poloId
    && input.plano.valorTotal > 0
    && input.plano.qtdParcelas >= 1
    && input.plano.qtdParcelas <= 60
    && input.plano.primeiroVencimento,
  );

  const query = useQuery({
    queryKey: ['preview-plano-financeiro-unico-turma', input],
    queryFn: () => planoFinanceiroUnicoService.previewTurmaPlan(input),
    enabled,
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  return {
    ...query,
    isSettling: input !== rawInput,
  };
};
