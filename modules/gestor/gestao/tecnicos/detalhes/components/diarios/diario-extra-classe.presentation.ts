import type { DiarioExtraClassCredit } from './diario-extra-classe.types.ts';
import { formatDiarioPdfAcademicDate } from './diario-pdf.contract.ts';

/** A ordem das atividades vem do backend; não cria aula, sessão ou prática. */
export const extraClassContentRows = (credit?: DiarioExtraClassCredit): string[][] => (
  credit?.activities.map((activity) => [
    formatDiarioPdfAcademicDate(activity.dataSource).slice(0, 5),
    `[Atividade extra-classe] ${activity.titulo}`,
    '',
    `${activity.cargaHoraria}h`,
  ]) ?? []
);
