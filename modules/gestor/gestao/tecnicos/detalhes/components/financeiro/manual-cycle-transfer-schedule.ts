import { isTransferEntrySnapshot } from '../../../../../../../supabase/functions/_shared/technical-transfer-schedule';
import type { CicloFinanceiroTecnicoManualPreview, CicloManualPlanoEntrada } from './matricula-tecnica-ciclo-manual.types';

/** The preview may revise terms, but must still identify this cycle's saved charges. */
export const requireTransferSchedulePreview = (
  entry: CicloManualPlanoEntrada | null | undefined,
  preview: CicloFinanceiroTecnicoManualPreview,
) => {
  const schedule = isTransferEntrySnapshot(entry) ? entry : null;
  if (!schedule) {
    if (preview.cronogramaEntradaVersao !== undefined) throw new Error('Prévia sem cronograma de entrada comprovado.');
    return;
  }
  const expected = schedule.itens.filter((item) => item.cicloNumero === preview.cicloNumero
    && !(item.tipo === 'MATRICULA' && preview.modoMatricula === 'OMITIR'))
    .sort((a, b) => Number(a.tipo === 'PARCELA') - Number(b.tipo === 'PARCELA') || a.ordem - b.ordem);
  if (preview.cronogramaEntradaVersao !== 3
    || preview.cronogramaEntradaFingerprint !== schedule.cronogramaFingerprint
    || expected.length !== preview.itens.length
    || expected.some((item, index) => item.itemId !== preview.itens[index].itemId
      || item.tipo !== preview.itens[index].tipo)) {
    throw new Error('A prévia diverge das cobranças planejadas para este ciclo na transferência.');
  }
};
