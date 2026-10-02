import type { TurmaAtividadeExtraClasse } from '../../turma-grade.types';
import { isAtividadeContextoOperacional, isAtividadeTurmaPreparacao } from '../atividades-extra/atividadesExtraClasse.utils';

export interface TurmaAtividadeEditDraft {
  titulo: string;
  prazoEntrega: string;
  horas: string;
}

export const getTurmaAtividadeCapabilities = (atividade: TurmaAtividadeExtraClasse) => {
  const contexto = atividade.contexto;
  const estadoOriginal = atividade.status === 'ARQUIVADA'
    ? atividade.statusAnterior || null
    : atividade.status;
  const canManage = Boolean(contexto && estadoOriginal && (
    contexto.modalidade !== 'TECNICO'
    || isAtividadeContextoOperacional(contexto.turmaStatus, contexto.periodoStatus)
    || (estadoOriginal === 'RASCUNHO' && isAtividadeTurmaPreparacao(contexto.turmaStatus))
  ));
  return {
    canManage,
    canEdit: canManage && atividade.status !== 'ARQUIVADA' && !atividade.respostasCount,
    estadoOriginal,
  };
};

export const validateTurmaAtividadeDraft = (draft: TurmaAtividadeEditDraft) => {
  const titulo = draft.titulo.trim();
  const horas = Number(draft.horas.replace(',', '.'));
  if (!titulo || titulo.length > 1000) return 'Informe um título de até 1000 caracteres.';
  if (!Number.isFinite(horas) || horas <= 0) return 'Informe uma carga horária maior que zero.';
  if (draft.prazoEntrega) {
    const date = new Date(`${draft.prazoEntrega}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.prazoEntrega)
      || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.prazoEntrega) {
      return 'Informe uma data de entrega válida.';
    }
  }
  return null;
};
