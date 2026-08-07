import { supabase } from '../../../../../lib/supabase';
import { cadastrosService } from '../../../cadastros/cadastros.service';
import { Curso } from '../../../cadastros/cadastros.types';
import { academicLifecycleService } from './academic-lifecycle.service';
import {
  TurmaAtividadeExtraClasse,
  TurmaAtividadeExtraClasseInput,
  TurmaAulaInput,
  TurmaAulaPeriodo,
  TurmaAulaPlanejada,
  TurmaAulaUpdateInput,
  TurmaDisciplinaConfig,
  TurmaGradeData,
  TurmaProfessorOption,
} from './turma-grade.types';

const sortAulas = (aulas: any[]) => [...aulas].sort((a, b) => {
  if (a.data_aula && b.data_aula) {
    const dateOrder = a.data_aula.localeCompare(b.data_aula);
    if (dateOrder !== 0) return dateOrder;
    const sessionOrder: Record<string, number> = { M: 1, T: 2, N: 3, U: 4 };
    return (sessionOrder[a.sessao] || 9) - (sessionOrder[b.sessao] || 9);
  }
  if (a.data_aula) return -1;
  if (b.data_aula) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
});

const mapHoraOficial = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  // O Postgres devolve TIME como HH:mm:ss. O campo nativo time aceita HH:mm.
  return value.slice(0, 5);
};

const mapAulasByDisciplina = (aulas: any[]): Record<string, TurmaAulaPlanejada[]> => {
  const result: Record<string, TurmaAulaPlanejada[]> = {};

  sortAulas(aulas || []).forEach((aula) => {
    if (!result[aula.disciplina_id]) result[aula.disciplina_id] = [];
    const encontros = result[aula.disciplina_id];
    const existente = encontros.find((item) => item.dataAula === aula.data_aula);
    const sessao = {
      id: aula.id,
      periodo: (aula.sessao || 'U') as TurmaAulaPeriodo,
      cargaHoraria: parseFloat(aula.carga_horaria),
    };
    const horaInicio = mapHoraOficial(aula.hora_inicio);
    const horaFim = mapHoraOficial(aula.hora_fim);
    if (existente) {
      existente.sessoes.push(sessao);
      existente.cargaHoraria += sessao.cargaHoraria;
      // Sessões do mesmo encontro recebem o mesmo horário pela RPC. Para
      // dados legados, preservamos o primeiro horário canônico disponível.
      existente.horaInicio ||= horaInicio;
      existente.horaFim ||= horaFim;
      return;
    }
    encontros.push({
      id: aula.id,
      titulo: aula.titulo,
      cargaHoraria: sessao.cargaHoraria,
      dataAula: aula.data_aula,
      horaInicio,
      horaFim,
      sessoes: [sessao],
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
        .select('disciplina_id, professor_nome, professor_id, concluida')
        .eq('turma_id', turmaId),
      supabase
        .from('aulas_turma')
        .select('id, disciplina_id, titulo, carga_horaria, data_aula, hora_inicio, hora_fim, sessao, created_at')
        .eq('turma_id', turmaId),
      supabase
        .from('atividades_extra_classe')
        .select('id, disciplina_id, titulo, tema, carga_horaria_compensacao, prazo_entrega, status')
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
      .rpc('salvar_encontro_turma_com_horario', {
        p_turma_id: turmaId,
        p_disciplina_id: input.disciplinaId,
        p_titulo: input.titulo,
        p_carga_horaria: input.horas,
        p_data_aula: input.dataAula,
        p_hora_inicio: input.horaInicio || null,
        p_hora_fim: input.horaFim || null,
        p_aula_id: null,
      });

    if (error) throw error;
    const encontro = mapAulasByDisciplina(data || [])[input.disciplinaId]?.[0];
    if (!encontro) throw new Error('O banco não retornou o encontro criado.');
    return encontro;
  },

  async updateAula(turmaId: string, input: TurmaAulaUpdateInput): Promise<TurmaAulaPlanejada> {
    const { data, error } = await supabase
      .rpc('salvar_encontro_turma_com_horario', {
        p_turma_id: turmaId,
        p_disciplina_id: input.disciplinaId,
        p_titulo: input.titulo || null,
        p_carga_horaria: input.horas,
        p_data_aula: input.dataAula,
        p_hora_inicio: input.horaInicio || null,
        p_hora_fim: input.horaFim || null,
        p_aula_id: input.aulaId,
      });

    if (error) throw error;
    const encontros = mapAulasByDisciplina(data || [])[input.disciplinaId] || [];
    const encontro = encontros.find((item) => item.id === input.aulaId) || encontros[0];
    if (!encontro) throw new Error('O banco não retornou o encontro atualizado.');
    return encontro;
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
    const { data, error } = await supabase.rpc('remover_encontro_turma', {
      p_aula_id: aulaId,
    });

    if (error) throw error;
    if (data !== true) {
      throw new Error('A aula não foi encontrada ou já havia sido removida.');
    }
  },
};
