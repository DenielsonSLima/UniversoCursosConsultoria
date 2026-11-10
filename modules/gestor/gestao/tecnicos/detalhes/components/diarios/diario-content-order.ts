import type { DiarioExtraClassCredit, DiarioExtraClasseActivity } from './diario-extra-classe.types.ts';

interface ContentLesson {
  id: string;
  sessoes?: Array<{ id: string }>;
  dataSource?: string;
  dataAula?: string | null;
}

export type DiaryContentEntry<T> =
  | { tipo: 'AULA'; aula: T }
  | { tipo: 'EXTRA_CLASSE'; activity: DiarioExtraClasseActivity };

export const findOriginLesson = <T extends ContentLesson>(aulas: T[], originId?: string | null) => (
  originId ? aulas.find((aula) => aula.id === originId || aula.sessoes?.some((session) => session.id === originId)) : undefined
);

export const extraClassOriginLabel = <T extends ContentLesson>(activity: DiarioExtraClasseActivity, aulas: T[]) => {
  const origin = findOriginLesson(aulas, activity.aulaOrigemId);
  if (!origin) return 'Extra-classe — origem não vinculada';
  const date = origin.dataSource || origin.dataAula || '';
  const label = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : '';
  return `Extra-classe — complemento da aula ${aulas.indexOf(origin) + 1}${label ? ` (${label})` : ''}`;
};

/** Reproduz a ordem do backend; snapshots antigos conservam sua composição. */
export const orderedDiaryContent = <T extends ContentLesson>(
  aulas: T[], credit?: DiarioExtraClassCredit,
): DiaryContentEntry<T>[] => {
  if (!credit?.contentOrder) return [
    ...aulas.map((aula): DiaryContentEntry<T> => ({ tipo: 'AULA', aula })),
    ...(credit?.activities ?? []).map((activity): DiaryContentEntry<T> => ({ tipo: 'EXTRA_CLASSE', activity })),
  ];
  const activities = new Map(credit.activities.map((activity) => [activity.id, activity]));
  const seen = new Set<string>();
  let previousDate = '';
  const entries = credit.contentOrder.map((entry): DiaryContentEntry<T> => {
    const aula = entry.tipo === 'AULA' ? findOriginLesson(aulas, entry.id) : undefined;
    const activity = entry.tipo === 'EXTRA_CLASSE' ? activities.get(entry.id) : undefined;
    if (!aula && !activity) throw new Error('A cronologia do diário contém conteúdo desconhecido.');
    const key = aula ? `AULA:${aula.id}` : `EXTRA_CLASSE:${activity!.id}`;
    if (seen.has(key)) throw new Error('A cronologia do diário contém conteúdo duplicado.');
    seen.add(key);
    const date = aula ? aula.dataSource || aula.dataAula || '9999-12-31' : activity!.dataSource;
    if (date < previousDate) throw new Error('A cronologia do diário está fora da ordem de data.');
    previousDate = date;
    return aula ? { tipo: 'AULA', aula } : { tipo: 'EXTRA_CLASSE', activity: activity! };
  });
  if (seen.size !== aulas.length + credit.activities.length) {
    throw new Error('A cronologia do diário está incompleta.');
  }
  return entries;
};
