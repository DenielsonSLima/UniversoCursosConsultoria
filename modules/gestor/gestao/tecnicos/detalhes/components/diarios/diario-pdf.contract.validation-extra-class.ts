import type { DiarioExtraClassCredit } from './diario-extra-classe.types.ts';
import {
  asRecord, assertExactKeys, assertIsoDate, assertNumber, assertText,
  assertUuid, fail, sameKeys,
} from './diario-pdf.contract.validation-core.ts';

/** Valida evidência canônica; nunca deduz participação de título ou de resposta. */
export const assertExtraClassCredit = (
  input: unknown,
  studentIds?: readonly string[],
  generatedAt?: string,
) => {
  const root = 'extraClassCredit';
  const credit = asRecord(input, root);
  assertExactKeys(credit,
    ['schemaVersion', 'activities', 'eligibleActivityIdsByStudent'], ['contentOrder'], root);
  if (credit.schemaVersion !== 1) fail(`${root}.schemaVersion`, 'versão desconhecida');
  if (!Array.isArray(credit.activities) || credit.activities.length > 1000) {
    fail(`${root}.activities`, 'lista de até 1000 atividades obrigatória');
  }
  const hoursByActivity = new Map<string, number>();
  const activityOrder = new Map<string, number>();
  const snapshotDate = generatedAt ? new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Maceio', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(generatedAt)) : null;
  let previousDate = '';
  let previousId = '';
  (credit.activities as unknown[]).forEach((candidate, index) => {
    const path = `${root}.activities[${index}]`;
    const activity = asRecord(candidate, path);
    assertExactKeys(activity, ['id', 'titulo', 'cargaHoraria', 'dataSource'], ['aulaOrigemId'], path);
    assertUuid(activity.id, `${path}.id`);
    if (activity.aulaOrigemId !== undefined && activity.aulaOrigemId !== null) {
      assertUuid(activity.aulaOrigemId, `${path}.aulaOrigemId`);
    }
    assertText(activity.titulo, `${path}.titulo`, { max: 2000 });
    assertNumber(activity.cargaHoraria, `${path}.cargaHoraria`, 0.01, 1000);
    assertIsoDate(activity.dataSource, `${path}.dataSource`);
    const id = activity.id as string;
    const date = activity.dataSource as string;
    if (hoursByActivity.has(id)) fail(`${path}.id`, 'atividade duplicada');
    if (date < previousDate || (date === previousDate && id <= previousId)) {
      fail(`${root}.activities`, 'atividades fora da ordem canônica por data e ID');
    }
    if (snapshotDate && date > snapshotDate) {
      fail(`${path}.dataSource`, 'atividade futura no snapshot fechado');
    }
    previousDate = date;
    previousId = id;
    hoursByActivity.set(id, activity.cargaHoraria as number);
    activityOrder.set(id, index);
  });
  if (credit.contentOrder !== undefined) {
    if (!Array.isArray(credit.contentOrder) || credit.contentOrder.length > 6000) {
      fail(`${root}.contentOrder`, 'lista de cronologia inválida');
    }
    const seen = new Set<string>();
    const extraIds = new Set<string>();
    (credit.contentOrder as unknown[]).forEach((candidate, index) => {
      const path = `${root}.contentOrder[${index}]`;
      const entry = asRecord(candidate, path);
      assertExactKeys(entry, ['tipo', 'id'], [], path);
      assertUuid(entry.id, `${path}.id`);
      if (entry.tipo !== 'AULA' && entry.tipo !== 'EXTRA_CLASSE') fail(path, 'tipo desconhecido');
      const key = `${entry.tipo}:${entry.id}`;
      if (seen.has(key)) fail(path, 'conteúdo duplicado');
      seen.add(key);
      if (entry.tipo === 'EXTRA_CLASSE') {
        if (!hoursByActivity.has(entry.id as string)) fail(path, 'atividade desconhecida');
        extraIds.add(entry.id as string);
      }
    });
    if (extraIds.size !== hoursByActivity.size) fail(`${root}.contentOrder`, 'atividade ausente');
  }
  const eligibleMap = asRecord(credit.eligibleActivityIdsByStudent,
    `${root}.eligibleActivityIdsByStudent`);
  if (Object.keys(eligibleMap).length > 2000) {
    fail(`${root}.eligibleActivityIdsByStudent`, 'limite de 2000 alunos excedido');
  }
  if (studentIds) sameKeys(eligibleMap, [...studentIds], `${root}.eligibleActivityIdsByStudent`);
  const eligibleHoursByStudent = new Map<string, number>();
  Object.entries(eligibleMap).forEach(([studentId, candidate]) => {
    const path = `${root}.eligibleActivityIdsByStudent.${studentId}`;
    assertUuid(studentId, path);
    if (!Array.isArray(candidate) || candidate.length > hoursByActivity.size) {
      fail(path, 'lista de atividades elegíveis fora do contrato');
    }
    let total = 0;
    let previousOrder = -1;
    (candidate as unknown[]).forEach((id) => {
      assertUuid(id, path);
      const hours = hoursByActivity.get(id as string);
      const order = activityOrder.get(id as string);
      if (hours === undefined || order === undefined) fail(path, 'atividade desconhecida');
      if (order <= previousOrder) fail(path, 'atividade duplicada ou fora da ordem canônica');
      previousOrder = order;
      total += hours;
    });
    eligibleHoursByStudent.set(studentId, total);
  });
  return {
    credit: credit as unknown as DiarioExtraClassCredit,
    totalHours: [...hoursByActivity.values()].reduce((sum, hours) => sum + hours, 0),
    eligibleHoursByStudent,
  };
};
