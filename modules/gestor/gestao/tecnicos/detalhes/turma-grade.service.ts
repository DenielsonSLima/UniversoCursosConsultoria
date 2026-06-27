import { supabase } from '../../../../../lib/supabase';
import { cadastrosService } from '../../../cadastros/cadastros.service';
import { Curso } from '../../../cadastros/cadastros.types';
import { academicLifecycleService } from './academic-lifecycle.service';
import {
  TurmaAulaInput,
  TurmaAulaPlanejada,
  TurmaDisciplinaConfig,
  TurmaGradeData,
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
        .from('parceiros')
        .select('nome')
        .eq('tipo', 'Professor')
        .eq('status', 'ATIVO')
        .order('nome', { ascending: true }),
      academicLifecycleService.getDiarios(turmaId),
    ]);

    if (configError) throw configError;
    if (aulasError) throw aulasError;
    if (profsError) throw profsError;

    const cursoBase: Curso = {
      ...cursoEncontrado,
      modulos,
    };

    const dbConfigs: Record<string, TurmaDisciplinaConfig> = {};
    (configsData || []).forEach((config: any) => {
      dbConfigs[config.disciplina_id] = {
        professor: config.professor_nome,
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
      professores: (profsData || []).map((professor: any) => professor.nome),
      metricasGrade,
    };
  },

  async assignProfessor(
    turmaId: string,
    disciplinaId: string,
    professorName: string | null,
    currentConfig: TurmaDisciplinaConfig,
  ) {
    const { error } = await supabase
      .from('turmas_disciplinas')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        professor_nome: professorName,
        concluida: currentConfig.concluida,
      }, { onConflict: 'turma_id,disciplina_id' });

    if (error) throw error;
  },

  async assignProfessorToDisciplines(
    turmaId: string,
    disciplineIds: string[],
    professorName: string | null,
    configs: Record<string, TurmaDisciplinaConfig>,
  ) {
    if (disciplineIds.length === 0) return;

    const rows = disciplineIds.map((disciplinaId) => ({
      turma_id: turmaId,
      disciplina_id: disciplinaId,
      professor_nome: professorName,
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

  async removeAula(aulaId: string) {
    const { error } = await supabase
      .from('aulas_turma')
      .delete()
      .eq('id', aulaId);

    if (error) throw error;
  },
};
