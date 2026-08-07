import { supabase } from '../../../../../../../lib/supabase';
import {
  AtividadeExtraClasseFormState,
  AtividadeExtraClasseRecord,
  AtividadeExtraClasseResposta,
  AtividadeModo,
  DisciplinaOption,
} from './atividadesExtraClasse.types';
import {
  isAtividadePrazoEncerrado,
  normalizeAtividadeHttpUrl,
  parsePerguntas,
} from './atividadesExtraClasse.utils';

type SupabaseAtividadeRecord = Omit<AtividadeExtraClasseRecord, 'disciplina' | 'respostas'> & {
  disciplina?: AtividadeExtraClasseRecord['disciplina'] | AtividadeExtraClasseRecord['disciplina'][];
  respostas?: Array<Omit<AtividadeExtraClasseResposta, 'aluno'> & {
    aluno?: AtividadeExtraClasseResposta['aluno'] | AtividadeExtraClasseResposta['aluno'][];
  }>;
};

const normalizeAtividadeRecord = (row: SupabaseAtividadeRecord): AtividadeExtraClasseRecord => ({
  ...row,
  tipo_resposta: row.tipo_resposta || 'TEXTO',
  disciplina: Array.isArray(row.disciplina) ? row.disciplina[0] || null : row.disciplina || null,
  perguntas: Array.isArray(row.perguntas) ? row.perguntas : [],
  respostas: Array.isArray(row.respostas)
    ? row.respostas.map((resposta) => ({
      ...resposta,
      aluno: Array.isArray(resposta.aluno) ? resposta.aluno[0] || null : resposta.aluno || null,
      respostas: Array.isArray(resposta.respostas) ? resposta.respostas : [],
    }))
    : [],
});

export const atividadesExtraClasseKeys = {
  root: ['atividades-extra-classe'] as const,
  turma: (turmaId: string) => [...atividadesExtraClasseKeys.root, turmaId] as const,
  availability: (turmaId: string) =>
    [...atividadesExtraClasseKeys.turma(turmaId), 'availability'] as const,
  disciplinas: (turmaId: string, cursoId?: string | null, disciplinaId?: string | null) =>
    [...atividadesExtraClasseKeys.turma(turmaId), 'disciplinas', cursoId || 'sem-curso', disciplinaId || 'todas'] as const,
  list: (turmaId: string, disciplinaId?: string | null) =>
    [...atividadesExtraClasseKeys.turma(turmaId), 'list', disciplinaId || 'todas'] as const,
};

export const atividadesExtraClasseService = {
  async hasAtividades(turmaId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('atividades_extra_classe')
      .select('id', { count: 'exact', head: true })
      .eq('turma_id', turmaId)
      .neq('status', 'ARQUIVADA');

    if (error) throw error;
    return (count || 0) > 0;
  },

  async getTurmaCurso(turmaId: string) {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, curso_id, status, curso:cursos(modalidade)')
      .eq('id', turmaId)
      .single();

    if (error) throw error;
    return data;
  },

  async getDisciplinas(input: {
    turmaId: string;
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
      const { data: vinculoData, error: vinculoError } = await supabase
        .from('turmas_disciplinas')
        .select('professor_id, professor_nome, periodo:periodos_letivos(status)')
        .eq('turma_id', input.turmaId)
        .eq('disciplina_id', input.disciplinaIdRestrita)
        .maybeSingle();

      if (vinculoError) throw vinculoError;
      const periodo = Array.isArray(vinculoData?.periodo) ? vinculoData.periodo[0] : vinculoData?.periodo;
      return [{
        id: data.id,
        nome: data.nome || 'Disciplina não identificada',
        cargaHoraria: Number(data.carga_horaria || 0),
        periodoStatus: periodo?.status || null,
        professorId: vinculoData?.professor_id || null,
        professorNome: vinculoData?.professor_nome || null,
      }];
    }

    if (!input.cursoId) throw new Error('Não foi possível identificar o curso desta turma.');

    const { data, error } = await supabase
      .from('disciplinas')
      .select('id, nome, carga_horaria, modulos!inner(curso_id)')
      .eq('modulos.curso_id', input.cursoId)
      .order('nome', { ascending: true });

    if (error) throw error;
    const { data: vinculosData, error: vinculosError } = await supabase
      .from('turmas_disciplinas')
      .select('disciplina_id, professor_id, professor_nome, periodo:periodos_letivos(status)')
      .eq('turma_id', input.turmaId);

    if (vinculosError) throw vinculosError;
    const vinculoByDisciplina = new Map<string, {
      periodoStatus: string | null;
      professorId: string | null;
      professorNome: string | null;
    }>();
    (vinculosData || []).forEach((vinculo) => {
      const periodo = Array.isArray(vinculo.periodo) ? vinculo.periodo[0] : vinculo.periodo;
      vinculoByDisciplina.set(vinculo.disciplina_id, {
        periodoStatus: periodo?.status || null,
        professorId: vinculo.professor_id || null,
        professorNome: vinculo.professor_nome || null,
      });
    });
    return (data || []).map((disciplina) => {
      const vinculo = vinculoByDisciplina.get(disciplina.id);
      return {
        id: disciplina.id,
        nome: disciplina.nome || 'Disciplina não identificada',
        cargaHoraria: Number(disciplina.carga_horaria || 0),
        periodoStatus: vinculo?.periodoStatus || null,
        professorId: vinculo?.professorId || null,
        professorNome: vinculo?.professorNome || null,
      };
    });
  },

  async getAtividades(
    turmaId: string,
    disciplinaIdRestrita?: string | null,
  ): Promise<AtividadeExtraClasseRecord[]> {
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

    let professoresQuery = supabase
      .from('turmas_disciplinas')
      .select('disciplina_id, professor_id, professor_nome')
      .eq('turma_id', turmaId);

    if (disciplinaIdRestrita) {
      professoresQuery = professoresQuery.eq('disciplina_id', disciplinaIdRestrita);
    }

    const [
      { data, error },
      { data: professoresData, error: professoresError },
    ] = await Promise.all([query, professoresQuery]);

    if (error) throw error;
    if (professoresError) throw professoresError;

    const professorByDisciplina = new Map(
      (professoresData || []).map((item) => [
        item.disciplina_id,
        { id: item.professor_id || null, nome: item.professor_nome || null },
      ]),
    );

    return ((data || []) as unknown as SupabaseAtividadeRecord[])
      .map(normalizeAtividadeRecord)
      .map((atividade) => ({
        ...atividade,
        professor: professorByDisciplina.get(atividade.disciplina_id) || null,
      }));
  },

  async createAtividade(input: {
    turmaId: string;
    form: AtividadeExtraClasseFormState;
    modo: AtividadeModo;
    status: 'RASCUNHO' | 'PUBLICADA';
  }) {
    const titulo = input.form.titulo.trim();
    const horas = Number(input.form.horas.replace(',', '.'));
    const perguntas = ['PERGUNTAS', 'MISTO'].includes(input.form.tipoResposta)
      ? parsePerguntas(input.form.perguntas)
      : [];

    if (!input.form.disciplinaId) throw new Error('Selecione a disciplina da atividade.');
    if (!titulo) throw new Error('Informe o título da atividade.');
    if (!Number.isFinite(horas) || horas <= 0) throw new Error('Informe uma carga horária maior que zero.');
    if (isAtividadePrazoEncerrado(input.form.prazoEntrega)) {
      throw new Error('Informe um prazo de entrega igual ou posterior à data de hoje.');
    }

    const videoUrl = normalizeAtividadeHttpUrl(input.form.videoUrl, 'O link do vídeo');
    if (['PERGUNTAS', 'MISTO'].includes(input.form.tipoResposta) && perguntas.length === 0) {
      throw new Error('Informe ao menos uma pergunta para esse tipo de resposta.');
    }

    const { error } = await supabase
      .from('atividades_extra_classe')
      .insert({
        turma_id: input.turmaId,
        disciplina_id: input.form.disciplinaId,
        titulo,
        tema: input.form.tema.trim() || titulo,
        tipo_resposta: input.form.tipoResposta,
        texto: input.form.texto.trim() || null,
        video_url: videoUrl,
        perguntas,
        carga_horaria_compensacao: horas,
        prazo_entrega: input.form.prazoEntrega || null,
        status: input.status,
        criado_por_tipo: input.modo,
      })
      .select('id')
      .single();

    if (error) throw error;
  },

  async archiveAtividade(atividadeId: string) {
    const { error } = await supabase
      .from('atividades_extra_classe')
      .update({ status: 'ARQUIVADA' })
      .eq('id', atividadeId)
      .eq('status', 'PUBLICADA')
      .select('id')
      .single();

    if (error) throw error;
  },

  async publishAtividade(atividadeId: string) {
    const { error } = await supabase
      .from('atividades_extra_classe')
      .update({ status: 'PUBLICADA' })
      .eq('id', atividadeId)
      .eq('status', 'RASCUNHO')
      .select('id')
      .single();

    if (error) throw error;
  },

  async deleteDraft(atividadeId: string) {
    const { error } = await supabase
      .from('atividades_extra_classe')
      .delete()
      .eq('id', atividadeId)
      .eq('status', 'RASCUNHO')
      .select('id')
      .single();

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
      .eq('id', input.respostaId)
      .select('id')
      .single();

    if (error) throw error;
  },
};
