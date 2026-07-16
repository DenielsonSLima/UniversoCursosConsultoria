import { supabase } from '../../../../../lib/supabase';
import { cadastrosService } from '../../../cadastros/cadastros.service';
import { Curso } from '../../../cadastros/cadastros.types';
import { academicLifecycleService } from './academic-lifecycle.service';
import {
  TurmaAtividadeExtraClasse,
  TurmaAtividadeExtraClasseInput,
  TurmaAulaInput,
  TurmaAulaPlanejada,
  TurmaDisciplinaConfig,
  TurmaGradeData,
  TurmaProfessorOption,
} from './turma-grade.types';

const sortAulas = (aulas: any[]) => [...aulas].sort((a, b) => {
  if (a.data_aula && b.data_aula) return a.data_aula.localeCompare(b.data_aula);
  if (a.data_aula) return -1;
  if (b.data_aula) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
});

const mapAulasByDisciplina = (aulas: any[]): Record<string, TurmaAulaPlanejada[]> => {
  const result: Record<string, TurmaAulaPlanejada[]> = {};

  sortAulas(aulas || []).forEach((aula) => {
    if (!result[aula.disciplina_id]) result[aula.disciplina_id] = [];
    result[aula.disciplina_id].push({
      id: aula.id,
      titulo: aula.titulo,
      cargaHoraria: parseFloat(aula.carga_horaria),
      dataAula: aula.data_aula,
    });
  });

  return result;
};

const mapAtividadesByDisciplina = (atividades: any[]): Record<string, TurmaAtividadeExtraClasse[]> => {
  const result: Record<string, TurmaAtividadeExtraClasse[]> = {};

  (atividades || []).forEach((atividade) => {
    if (!result[atividade.disciplina_id]) result[atividade.disciplina_id] = [];
    result[atividade.disciplina_id].push({
      id: atividade.id,
      titulo: atividade.titulo,
      tema: atividade.tema,
      cargaHoraria: parseFloat(atividade.carga_horaria_compensacao || 0),
      prazoEntrega: atividade.prazo_entrega,
      status: atividade.status || 'PUBLICADA',
    });
  });

  Object.values(result).forEach((items) => {
    items.sort((a, b) => {
      if (a.prazoEntrega && b.prazoEntrega) return a.prazoEntrega.localeCompare(b.prazoEntrega);
      if (a.prazoEntrega) return -1;
      if (b.prazoEntrega) return 1;
      return a.titulo.localeCompare(b.titulo, 'pt-BR');
    });
  });

  return result;
};

const buildDefaultConfigs = (curso: Curso): Record<string, TurmaDisciplinaConfig> => {
  const configs: Record<string, TurmaDisciplinaConfig> = {};

  (curso.modulos || []).forEach((modulo) => {
    modulo.disciplinas.forEach((disciplina) => {
      configs[disciplina.id] = { professor: null, concluida: false };
    });
  });

  return configs;
};

export const turmaGradeService = {
  async getGradeData(turmaId: string, cursoId: string): Promise<TurmaGradeData> {
    const [
      cursoEncontrado,
      modulos,
      { data: configsData, error: configError },
      { data: aulasData, error: aulasError },
      { data: atividadesData, error: atividadesError },
      { data: profsData, error: profsError },
      metricasGrade,
    ] = await Promise.all([
      cadastrosService.getCursoById(cursoId),
      cadastrosService.getGrade(cursoId),
      supabase
        .from('turmas_disciplinas')
        .select('*')
        .eq('turma_id', turmaId),
      supabase
        .from('aulas_turma')
        .select('*')
        .eq('turma_id', turmaId),
      supabase
        .from('atividades_extra_classe')
        .select('*')
        .eq('turma_id', turmaId)
        .neq('status', 'ARQUIVADA'),
      supabase
        .from('parceiros')
        .select('id, nome')
        .eq('tipo', 'Professor')
        .eq('status', 'ATIVO')
        .order('nome', { ascending: true }),
      academicLifecycleService.getDiarios(turmaId),
    ]);

    if (configError) throw configError;
    if (aulasError) throw aulasError;
    if (atividadesError) throw atividadesError;
    if (profsError) throw profsError;

    const cursoBase: Curso = {
      ...cursoEncontrado,
      modulos,
    };

    const dbConfigs: Record<string, TurmaDisciplinaConfig> = {};
    (configsData || []).forEach((config: any) => {
      dbConfigs[config.disciplina_id] = {
        professor: config.professor_nome,
        professorId: config.professor_id,
        concluida: config.concluida,
      };
    });

    return {
      cursoBase,
      disciplinasConfig: {
        ...buildDefaultConfigs(cursoBase),
        ...dbConfigs,
      },
      aulas: mapAulasByDisciplina(aulasData || []),
      atividadesExtraClasse: mapAtividadesByDisciplina(atividadesData || []),
      professores: (profsData || []).map((professor: any) => ({
        id: professor.id,
        nome: professor.nome,
      })),
      metricasGrade,
    };
  },

  async assignProfessor(
    turmaId: string,
    disciplinaId: string,
    professor: TurmaProfessorOption | null,
    currentConfig: TurmaDisciplinaConfig,
  ) {
    const { error } = await supabase
      .from('turmas_disciplinas')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        professor_nome: professor?.nome || null,
        professor_id: professor?.id || null,
        concluida: currentConfig.concluida,
      }, { onConflict: 'turma_id,disciplina_id' });

    if (error) throw error;
  },

  async assignProfessorToDisciplines(
    turmaId: string,
    disciplineIds: string[],
    professor: TurmaProfessorOption | null,
    configs: Record<string, TurmaDisciplinaConfig>,
  ) {
    if (disciplineIds.length === 0) return;

    const rows = disciplineIds.map((disciplinaId) => ({
      turma_id: turmaId,
      disciplina_id: disciplinaId,
      professor_nome: professor?.nome || null,
      professor_id: professor?.id || null,
      concluida: configs[disciplinaId]?.concluida || false,
    }));

    const { error } = await supabase
      .from('turmas_disciplinas')
      .upsert(rows, { onConflict: 'turma_id,disciplina_id' });

    if (error) throw error;
  },

  async toggleConcluida(
    turmaId: string,
    disciplinaId: string,
    currentConfig: TurmaDisciplinaConfig,
  ) {
    const nextConcluida = !currentConfig.concluida;
    const { error } = await supabase
      .from('turmas_disciplinas')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        professor_nome: currentConfig.professor,
        professor_id: currentConfig.professorId || null,
        concluida: nextConcluida,
      }, { onConflict: 'turma_id,disciplina_id' });

    if (error) throw error;
  },

  async addAula(turmaId: string, input: TurmaAulaInput): Promise<TurmaAulaPlanejada> {
    const { data, error } = await supabase
      .from('aulas_turma')
      .insert({
        turma_id: turmaId,
        disciplina_id: input.disciplinaId,
        titulo: input.titulo,
        carga_horaria: input.horas,
        data_aula: input.dataAula,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      titulo: data.titulo,
      cargaHoraria: parseFloat(data.carga_horaria),
      dataAula: data.data_aula,
    };
  },

  async addAtividadeExtraClasse(
    turmaId: string,
    input: TurmaAtividadeExtraClasseInput,
  ): Promise<TurmaAtividadeExtraClasse> {
    const perguntas = Array.isArray(input.perguntas)
      ? input.perguntas.filter((item) => item.pergunta?.trim())
      : [];

    const { data, error } = await supabase
      .from('atividades_extra_classe')
      .insert({
        turma_id: turmaId,
        disciplina_id: input.disciplinaId,
        titulo: input.titulo,
        tema: input.titulo,
        tipo_resposta: perguntas.length > 0 ? 'MISTO' : 'TEXTO',
        texto: input.texto || 'Atividade extra-classe criada a partir da grade da turma.',
        video_url: input.videoUrl || null,
        perguntas,
        carga_horaria_compensacao: input.horas,
        prazo_entrega: input.prazoEntrega || null,
        status: input.status || 'PUBLICADA',
        criado_por_tipo: input.criadoPorTipo || 'GESTOR',
        criado_por_id: input.criadoPorId || null,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      titulo: data.titulo,
      tema: data.tema,
      cargaHoraria: parseFloat(data.carga_horaria_compensacao || 0),
      prazoEntrega: data.prazo_entrega,
      status: data.status || 'PUBLICADA',
    };
  },

  async removeAula(aulaId: string) {
    const { data, error } = await supabase.rpc('remove_turma_aula_planejada', {
      p_aula_id: aulaId,
    });

    if (error) throw error;
    if (data !== true) {
      throw new Error('A aula não foi encontrada ou já havia sido removida.');
    }
  },
};
