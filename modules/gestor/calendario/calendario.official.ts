import { CalendarEvent, EventType } from './calendario.types';

export const OFFICIAL_EVENT_TYPES: EventType[] = [
  { id: 'fer', label: 'Feriado nacional', color: '#dc2626', isSystem: true },
  { id: 'fac', label: 'Ponto facultativo', color: '#ea580c', isSystem: true },
  { id: 'com', label: 'Data comemorativa', color: '#ca8a04', isSystem: true },
];

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const fixedDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Algoritmo gregoriano de Meeus/Jones/Butcher.
const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

const nthWeekday = (year: number, monthIndex: number, weekday: number, nth: number) => {
  const first = new Date(year, monthIndex, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, monthIndex, 1 + offset + (nth - 1) * 7);
};

const officialEvent = (
  year: number,
  key: string,
  title: string,
  date: string,
  typeId: 'fer' | 'fac' | 'com',
  description: string,
): CalendarEvent => ({
  id: `official-${year}-${key}`,
  title,
  date,
  typeId,
  description,
});

export const getBrazilianOfficialEvents = (year: number): CalendarEvent[] => {
  const easter = getEasterSunday(year);
  const annualFederalOverrides: Record<number, CalendarEvent[]> = {
    2026: [
      officialEvent(year, 'ponte-tiradentes', 'Ponto facultativo federal', fixedDate(year, 4, 20), 'fac', 'Ponto facultativo federal estabelecido para 2026.'),
      officialEvent(year, 'ponte-corpus-christi', 'Ponto facultativo federal', fixedDate(year, 6, 5), 'fac', 'Ponto facultativo federal estabelecido para 2026.'),
    ],
  };

  const events: CalendarEvent[] = [
    officialEvent(year, 'confraternizacao', 'Confraternização Universal', fixedDate(year, 1, 1), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'carnaval-segunda', 'Carnaval', toDateKey(addDays(easter, -48)), 'fac', 'Ponto facultativo nacional.'),
    officialEvent(year, 'carnaval-terca', 'Carnaval', toDateKey(addDays(easter, -47)), 'fac', 'Ponto facultativo nacional.'),
    officialEvent(year, 'cinzas', 'Quarta-feira de Cinzas', toDateKey(addDays(easter, -46)), 'fac', 'Ponto facultativo até as 14h.'),
    officialEvent(year, 'mulher', 'Dia Internacional da Mulher', fixedDate(year, 3, 8), 'com', 'Data comemorativa.'),
    officialEvent(year, 'escola', 'Dia da Escola', fixedDate(year, 3, 15), 'com', 'Data comemorativa do calendário educacional.'),
    officialEvent(year, 'paixao', 'Paixão de Cristo', toDateKey(addDays(easter, -2)), 'fer', 'Data religiosa observada nacionalmente conforme legislação local.'),
    officialEvent(year, 'pascoa', 'Domingo de Páscoa', toDateKey(easter), 'com', 'Data comemorativa móvel.'),
    officialEvent(year, 'tiradentes', 'Tiradentes', fixedDate(year, 4, 21), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'trabalho', 'Dia Mundial do Trabalho', fixedDate(year, 5, 1), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'maes', 'Dia das Mães', toDateKey(nthWeekday(year, 4, 0, 2)), 'com', 'Segundo domingo de maio.'),
    officialEvent(year, 'ambiente', 'Dia Mundial do Meio Ambiente', fixedDate(year, 6, 5), 'com', 'Data comemorativa.'),
    officialEvent(year, 'corpus-christi', 'Corpus Christi', toDateKey(addDays(easter, 60)), 'fac', 'Ponto facultativo nacional.'),
    officialEvent(year, 'sao-joao', 'Dia de São João', fixedDate(year, 6, 24), 'com', 'Data comemorativa de forte tradição no Nordeste.'),
    officialEvent(year, 'estudante', 'Dia do Estudante', fixedDate(year, 8, 11), 'com', 'Data comemorativa do calendário educacional.'),
    officialEvent(year, 'pais', 'Dia dos Pais', toDateKey(nthWeekday(year, 7, 0, 2)), 'com', 'Segundo domingo de agosto.'),
    officialEvent(year, 'independencia', 'Independência do Brasil', fixedDate(year, 9, 7), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'arvore', 'Dia da Árvore', fixedDate(year, 9, 21), 'com', 'Data comemorativa.'),
    officialEvent(year, 'aparecida', 'Nossa Senhora Aparecida', fixedDate(year, 10, 12), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'professor', 'Dia do Professor', fixedDate(year, 10, 15), 'com', 'Data comemorativa do calendário educacional.'),
    officialEvent(year, 'servidor', 'Dia do Servidor Público', fixedDate(year, 10, 28), 'fac', 'Ponto facultativo na administração pública federal.'),
    officialEvent(year, 'finados', 'Finados', fixedDate(year, 11, 2), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'republica', 'Proclamação da República', fixedDate(year, 11, 15), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'bandeira', 'Dia da Bandeira', fixedDate(year, 11, 19), 'com', 'Data comemorativa cívica.'),
    officialEvent(year, 'consciencia-negra', 'Dia Nacional de Zumbi e da Consciência Negra', fixedDate(year, 11, 20), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'vespera-natal', 'Véspera de Natal', fixedDate(year, 12, 24), 'fac', 'Ponto facultativo após as 13h na administração pública federal.'),
    officialEvent(year, 'natal', 'Natal', fixedDate(year, 12, 25), 'fer', 'Feriado nacional no Brasil.'),
    officialEvent(year, 'reveillon', 'Véspera de Ano-Novo', fixedDate(year, 12, 31), 'fac', 'Ponto facultativo após as 13h na administração pública federal.'),
    ...(annualFederalOverrides[year] || []),
  ];

  return events.sort((a, b) => a.date.localeCompare(b.date));
};
