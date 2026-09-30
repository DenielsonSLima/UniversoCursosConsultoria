import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualPreviewItem,
  CicloFinanceiroTecnicoManualRevisao,
  CicloFinanceiroTecnicoManualRevisaoItem,
  CicloManualModoMatricula,
} from './matricula-tecnica-ciclo-manual.types';

export type CicloManualScheduleItem = Pick<
  CicloFinanceiroTecnicoManualPreviewItem,
  'chave' | 'tipo' | 'numero'
>;

type RevisionField = keyof Omit<CicloFinanceiroTecnicoManualRevisaoItem, 'chave'>;

const parseIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day) return null;
  return { year, month, day };
};

// Mirrors public.data_vencimento_mensal: advance calendar months and clamp the
// selected day to the target month's last day. It is not a fixed 30-day shift.
export const addCicloManualCalendarMonths = (value: string, offset: number) => {
  const source = parseIsoDate(value);
  if (!source || !Number.isInteger(offset) || offset < 0) return null;
  const monthIndex = source.year * 12 + source.month - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const monthIndexInYear = monthIndex - year * 12;
  const month = monthIndexInYear + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(source.day, lastDay);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
};

export const cicloManualScheduleFromPreview = (
  preview: CicloFinanceiroTecnicoManualPreview,
): CicloManualScheduleItem[] => [
  ...preview.itens,
  ...(preview.matriculaSemBoleto ? [preview.matriculaSemBoleto] : []),
].map(({ chave, tipo, numero }) => ({ chave, tipo, numero }));

export const changeCicloManualRevisionItem = (
  revision: CicloFinanceiroTecnicoManualRevisao,
  schedule: readonly CicloManualScheduleItem[],
  key: string,
  field: RevisionField,
  value: string,
): CicloFinanceiroTecnicoManualRevisao => {
  const changed = schedule.find((item) => item.chave === key);
  const baseDate = field === 'vencimento' && changed?.tipo === 'PARCELA' && changed.numero === 1
    ? addCicloManualCalendarMonths(value, 0)
    : null;
  const scheduleByKey = new Map(schedule.map((item) => [item.chave, item]));

  return {
    ...revision,
    itens: revision.itens.map((item) => {
      if (baseDate) {
        const identity = scheduleByKey.get(item.chave);
        if (identity?.tipo === 'PARCELA' && identity.numero >= 1) {
          return {
            ...item,
            vencimento: addCicloManualCalendarMonths(baseDate, identity.numero - 1)
              ?? item.vencimento,
          };
        }
      }
      return item.chave === key ? { ...item, [field]: value } : item;
    }),
  };
};

export const changeCicloManualEnrollmentMode = (
  revision: CicloFinanceiroTecnicoManualRevisao,
  schedule: readonly CicloManualScheduleItem[],
  mode: CicloManualModoMatricula,
  originDate: string | null,
): CicloFinanceiroTecnicoManualRevisao => {
  const previousMode = revision.modoMatricula
    ?? (revision.emitirMatricula ? 'BOLETO' : 'OMITIR');
  const changed = {
    ...revision,
    modoMatricula: mode,
    emitirMatricula: mode === 'BOLETO',
  };
  if (!schedule.some((item) => item.tipo === 'MATRICULA')) {
    return changed;
  }
  const firstInstallment = schedule.find(
    (item) => item.tipo === 'PARCELA' && item.numero === 1,
  );
  const monthOffset = mode === 'OMITIR' ? 0 : previousMode === 'OMITIR' ? 1 : null;
  const baseDate = originDate && monthOffset !== null
    ? addCicloManualCalendarMonths(originDate, monthOffset)
    : null;
  return firstInstallment && baseDate
    ? changeCicloManualRevisionItem(
      changed, schedule, firstInstallment.chave, 'vencimento', baseDate,
    )
    : changed;
};
