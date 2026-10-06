import type { CalendarioAulasLinha } from '../types';

export const toMonthReference = (mesReferencia: string): string | null => {
  const [yearText, monthText] = mesReferencia.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

export const shiftMonthReference = (mesReferencia: string, delta: number) => {
  const base = toMonthReference(mesReferencia);
  if (!base) return mesReferencia;

  const [yearText, monthText] = base.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${firstDay.getUTCFullYear()}-${String(firstDay.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const parseDataExibicaoDate = (dataExibicao: string): Date | null => {
  const [dayText, monthText, yearText] = dataExibicao.trim().split('/');
  const day = Number(dayText);
  const month = Number(monthText);
  let year = Number(yearText);

  if (
    !Number.isInteger(day)
    || !Number.isInteger(month)
    || !Number.isInteger(year)
    || day < 1
    || day > 31
    || month < 1
    || month > 12
  ) {
    return null;
  }

  if (yearText && year < 100) {
    year += 2000;
  }

  if (year < 1 || year > 9999) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
};

const lineDateMillis = (dataExibicao: string) => {
  const date = parseDataExibicaoDate(dataExibicao);
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
};

export const lineMonthReference = (dataExibicao: string) => {
  const date = parseDataExibicaoDate(dataExibicao);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const mergeAndSortLinhas = (linhas: CalendarioAulasLinha[]) => {
  const merged = dedupeLinhas(linhas);
  return merged.sort((left, right) => {
    const leftDate = lineDateMillis(left.dataExibicao);
    const rightDate = lineDateMillis(right.dataExibicao);
    if (leftDate !== rightDate) return leftDate - rightDate;

    const componenteDiff = left.componenteCurricular.localeCompare(
      right.componenteCurricular,
      'pt-BR',
    );
    if (componenteDiff !== 0) return componenteDiff;

    return left.horarioExibicao.localeCompare(right.horarioExibicao);
  });
};

export const dedupeLinhas = (linhas: CalendarioAulasLinha[]) => {
  const unique = new Map<string, CalendarioAulasLinha>();
  for (const linha of linhas) {
    const key = [
      linha.componenteCurricular,
      linha.dataExibicao,
      linha.horarioExibicao,
      linha.professoresObservacao,
    ].join('|');
    if (!unique.has(key)) unique.set(key, linha);
  }

  return [...unique.values()];
};

