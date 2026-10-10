import { isTransferEntrySnapshot } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import type { CicloManualPlanoEntrada } from './matricula-tecnica-ciclo-manual.types';

export const cicloManualTransferSetup = (
  plan: CicloManualPlanoEntrada | null | undefined,
  cycle: number | null,
) => {
  if (isTransferEntrySnapshot(plan)) {
    const items = plan.itens.filter((item) => item.cicloNumero === cycle);
    return {
      explicitSchedule: true,
      enrollmentAvailable: cycle === 1 && items.some((item) => item.tipo === 'MATRICULA'),
      installments: items.filter((item) => item.tipo === 'PARCELA').length,
      fingerprint: plan.cronogramaFingerprint,
    };
  }
  return {
    explicitSchedule: false,
    enrollmentAvailable: true,
    installments: plan?.quantidadeParcelas ?? null,
    fingerprint: null,
  };
};
