import type { ContasReceber } from '../../../financeiro.service';
import { formatMatricula } from '../../../../../../lib/academicUtils';

export const formatEnrollment = (item: ContasReceber) =>
  item.matriculaId ? formatMatricula(item.matriculaId, item.createdAt, item.poloId) : 'Sem matrícula';
