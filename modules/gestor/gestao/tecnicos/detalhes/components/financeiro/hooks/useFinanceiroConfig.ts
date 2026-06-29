import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../../academic-lifecycle.keys';
import { gestaoService } from '../../../../../gestao.service';
import {
  FinanceiroConfigData,
  financeiroConfigService,
} from '../financeiro-config.service';

export const financeiroConfigKeys = {
  turma: (turmaId: string) => ['turma_financeiro_config', turmaId] as const,
  calculo: (config: Pick<FinanceiroConfigData, 'valorParcela' | 'descontoPontualidade' | 'jurosAtraso' | 'multaAtraso'>) => [
    'calculo_regras_turma',
    config.valorParcela,
    config.descontoPontualidade,
    config.jurosAtraso,
    config.multaAtraso,
  ] as const,
  calculoForm: (config: Pick<FinanceiroConfigData, 'valorParcela' | 'descontoPontualidade' | 'jurosAtraso' | 'multaAtraso'>) => [
    'calculo_regras_turma_form',
    config.valorParcela,
    config.descontoPontualidade,
    config.jurosAtraso,
    config.multaAtraso,
  ] as const,
};

export const useFinanceiroConfig = (turmaId: string) => useQuery({
  queryKey: financeiroConfigKeys.turma(turmaId),
  queryFn: () => financeiroConfigService.getConfig(turmaId),
});

export const useFinanceiroRulesCalculation = (
  config: Pick<FinanceiroConfigData, 'valorParcela' | 'descontoPontualidade' | 'jurosAtraso' | 'multaAtraso'>,
  form = false,
) => useQuery({
  queryKey: form ? financeiroConfigKeys.calculoForm(config) : financeiroConfigKeys.calculo(config),
  queryFn: () => financeiroConfigService.calculateRules(config),
  staleTime: Infinity,
});

export const useSaveFinanceiroConfigMutation = (
  turmaId: string,
  onSuccess?: () => void,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newConfig: FinanceiroConfigData) => financeiroConfigService.saveConfig(turmaId, newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeiroConfigKeys.turma(turmaId) });
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.financeiroMatriculaConfig(turmaId) });
      onSuccess?.();
    },
    onError,
  });
};

export const useTurmaFinanceiroConfigMutation = (
  turmaId: string,
  onSuccess?: () => void,
  onError?: (error: any) => void,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      origemFinanceira: 'NORMAL' | 'LEGADO';
      financeiroHerdado: boolean;
      gerarCobrancasFuturas: boolean;
      sincronizarAsaasFuturo: boolean;
      obsFinanceiraOrigem?: string;
    }) => gestaoService.updateTurmaFinanceiroFlags(turmaId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeiroConfigKeys.turma(turmaId) });
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turmaId) });
      onSuccess?.();
    },
    onError,
  });
};
