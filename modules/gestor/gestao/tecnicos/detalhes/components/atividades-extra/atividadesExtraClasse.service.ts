import { supabase } from '../../../../../../../lib/supabase';
import {
  AtividadeExtraClasseFormState,
  AtividadeModo,
  DisciplinaOption,
} from './atividadesExtraClasse.types';
import { parsePerguntas } from './atividadesExtraClasse.utils';

export const atividadesExtraClasseKeys = {
  root: ['atividades-extra-classe'] as const,
  turma: (turmaId: string) => [...atividadesExtraClasseKeys.root, turmaId] as const,
  disciplinas: (turmaId: string, cursoId?: string | null, disciplinaId?: string | null) =>
    [...atividadesExtraClasseKeys.turma(turmaId), 'disciplinas', cursoId || 'sem-curso', disciplinaId || 'todas'] as const,
  list: (turmaId: string, disciplinaId?: string | null) =>
    [...atividadesExtraClasseKeys.turma(turmaId), 'list', disciplinaId || 'todas'] as const,
};

export const atividadesExtraClasseService = {
  async getTurmaCurso(turmaId: string) {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, curso_id')
      .eq('id', turmaId)
      .single();

    if (error) throw error;
    return data;
  },

  async getDisciplinas(input: {
    cursoId?: string | null;
    disciplinaIdRestrita?: string | null;
  }): Promise<DisciplinaOption[]> {
    if (input.disciplinaIdRestrita) {
      const { data, error } = await supabase
        .from('disciplinas')
        .select('id, nome, carga_horaria')
        .eq('id', input.disciplinaIdRestrita)
        .single();

      if (error) throw error;
      return [{
        id: data.id,
        nome: data.nome || 'Disciplina não identificada',
        cargaHoraria: Number(data.carga_horaria || 0),
      }];
    }

    const { data, error } = await supabase
      .from('disciplinas')
      .select('id, nome, carga_horaria, modulos!inner(curso_id)')
      .eq('modulos.curso_id', input.cursoId)
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map((disciplina: any) => ({
      id: disciplina.id,
      nome: disciplina.nome || 'Disciplina não identificada',
      cargaHoraria: Number(disciplina.carga_horaria || 0),
    }));
  },

  async getAtividades(turmaId: string, disciplinaIdRestrita?: string | null) {
    let query = supabase
      .from('atividades_extra_classe')
      .select(`
        *,
        disciplina:disciplinas(id, nome, carga_horaria),
        respostas:atividade_extra_classe_respostas(
          *,
          aluno:parceiros(id, nome)
        )
      `)
      .eq('turma_id', turmaId)
      .neq('status', 'ARQUIVADA')
      .order('created_at', { ascending: false });

    if (disciplinaIdRestrita) query = query.eq('disciplina_id', disciplinaIdRestrita);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createAtividade(input: {
    turmaId: string;
    form: AtividadeExtraClasseFormState;
    modo: AtividadeModo;
    professorId?: string | null;
  }) {
    const titulo = input.form.titulo.trim();
    const horas = Number(input.form.horas.replace(',', '.'));
    const perguntas = parsePerguntas(input.form.perguntas);

    if (!input.form.disciplinaId) throw new Error('Selecione a disciplina da atividade.');
    if (!titulo) throw new Error('Informe o título da atividade.');
    if (!Number.isFinite(horas) || horas <= 0) throw new Error('Informe uma carga horária maior que zero.');

    const { error } = await supabase
      .from('atividades_extra_classe')
      .insert({
        turma_id: input.turmaId,
        disciplina_id: input.form.disciplinaId,
        titulo,
        tema: input.form.tema.trim() || titulo,
        tipo_resposta: perguntas.length > 0 ? 'MISTO' : 'TEXTO',
        texto: input.form.texto.trim() || null,
        video_url: input.form.videoUrl.trim() || null,
        perguntas,
        carga_horaria_compensacao: horas,
        prazo_entrega: input.form.prazoEntrega || null,
        status: 'PUBLICADA',
        criado_por_tipo: input.modo,
        criado_por_id: input.modo === 'PROFESSOR' ? input.professorId || null : null,
      });

    if (error) throw error;
  },

  async archiveAtividade(atividadeId: string) {
    const { error } = await supabase
      .from('atividades_extra_classe')
      .update({ status: 'ARQUIVADA' })
      .eq('id', atividadeId);

    if (error) throw error;
  },

  async corrigirResposta(input: {
    respostaId: string;
    nota: number | null;
    feedback: string | null;
  }) {
    const { error } = await supabase
      .from('atividade_extra_classe_respostas')
      .update({
        nota: input.nota,
        feedback: input.feedback,
        status: 'CORRIGIDA',
      })
      .eq('id', input.respostaId);

    if (error) throw error;
  },
};
