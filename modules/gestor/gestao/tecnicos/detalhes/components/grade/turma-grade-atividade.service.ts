import { supabase } from '../../../../../../../lib/supabase';
import type { TurmaAtividadeExtraClasse } from '../../turma-grade.types';
import { validateTurmaAtividadeDraft, type TurmaAtividadeEditDraft } from './turma-grade-atividade.utils';

export interface TurmaAtividadeManagementInput {
  atividade: TurmaAtividadeExtraClasse;
  acao: 'EDITAR' | 'ARQUIVAR' | 'RESTAURAR';
  draft?: TurmaAtividadeEditDraft;
}

export const manageTurmaAtividade = async ({ atividade, acao, draft }: TurmaAtividadeManagementInput) => {
  if (acao === 'EDITAR') {
    if (!draft) throw new Error('Informe os dados da atividade.');
    const error = validateTurmaAtividadeDraft(draft);
    if (error) throw new Error(error);
  }
  const { data, error } = await supabase.rpc('gerenciar_atividade_extra_classe', {
    p_atividade_id: atividade.id,
    p_acao: acao,
    p_titulo: draft?.titulo.trim() || null,
    p_prazo_entrega: draft?.prazoEntrega || null,
    p_carga_horaria: draft ? Number(draft.horas.replace(',', '.')) : null,
    p_updated_at_esperado: atividade.updatedAt || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id !== atividade.id) {
    throw new Error('O servidor não confirmou a alteração da atividade. Atualize a grade.');
  }
  return row;
};
