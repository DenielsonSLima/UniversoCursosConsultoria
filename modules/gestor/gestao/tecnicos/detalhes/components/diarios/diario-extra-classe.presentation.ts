import type { DiarioExtraClassCredit } from './diario-extra-classe.types.ts';
import { formatDiarioPdfAcademicDate } from './diario-pdf.contract.ts';
import { extraClassOriginLabel } from './diario-content-order.ts';
import type { DiarioPdfLessonSnapshot } from './diario-pdf.contract.ts';

/** A ordem das atividades vem do backend; não cria aula, sessão ou prática. */
export const extraClassContentRows = (credit?: DiarioExtraClassCredit, aulas?: DiarioPdfLessonSnapshot[]): string[][] => (
  credit?.activities.map((activity) => [
    formatDiarioPdfAcademicDate(activity.dataSource).slice(0, 5),
    aulas ? `[${extraClassOriginLabel(activity, aulas)}] ${activity.titulo}` : `[Atividade extra-classe] ${activity.titulo}`,
    '',
    `${activity.cargaHoraria}h`,
  ]) ?? []
);
