import type {
  ExternalTransferFinancialPlan, ExternalTransferPreview, ExternalTransferScheduleAdjustment,
} from './external-transfer.contract';

type CycleAdjustment = Extract<ExternalTransferScheduleAdjustment, { acao: 'CONFIGURAR_CICLO' }>;
export const applyExternalTransferConfigurationAdjustments = async (input: {
  plan: ExternalTransferFinancialPlan;
  adjustments: CycleAdjustment[];
  preview: (plan: ExternalTransferFinancialPlan, adjustment: CycleAdjustment) => Promise<ExternalTransferPreview>;
  onApplied: (data: ExternalTransferPreview, cycle: 1 | 2) => void;
}): Promise<ExternalTransferPreview | null> => {
  let plan = input.plan;
  let last: ExternalTransferPreview | null = null;
  for (const adjustment of input.adjustments) {
    const data = await input.preview(plan, adjustment);
    input.onApplied(data, adjustment.cicloNumero);
    plan = data.financeiro;
    last = data;
  }
  return last;
};
