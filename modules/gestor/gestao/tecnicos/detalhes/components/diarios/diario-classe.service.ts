import { supabase } from '../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../lib/academicUtils';
import { diariosService } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { AttendanceStatus, DiarioClosureState, DiarioLockScope } from './diario-classe.types';

export interface DiarioStudent {
  id: string;
  nome: string;
  matricula: string;
  status: string;
}

export interface DiarioAula {
  id: string;
  titulo: string;
  cargaHoraria: number;
  dataLabel: string;
  dataAula?: string | null;
  sessoes: DiarioSessao[];
}

export type DiarioSessaoPeriodo = 'M' | 'T' | 'N' | 'U';

export interface DiarioSessao {
  id: string;
  periodo: DiarioSessaoPeriodo;
  cargaHoraria: number;
}

export interface DiarioGradeFields {
  p?: number | null;
  ti?: number | null;
  tg?: number | null;
  s?: number | null;
  cq?: number | null;
  o?: number | null;
  rec?: number | null;
}

export interface DiarioAulaInput {
  titulo: string;
  cargaHoraria: number;
  dataAula: string;
}

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

export const diarioClasseService = {
  getTemplate(cursoId: string) {
    return diariosService.getTemplate(cursoId);
  },

  async getStudents(
    turmaId: string,
    disciplinaId: string,
    _accessMode: 'GESTOR' | 'PROFESSOR',
  ): Promise<DiarioStudent[]> {
    // Gestor e professor precisam consumir a mesma relação temporal por disciplina.
    // A autorização continua sendo decidida pela RPC no banco.
    const { data, error } = await supabase.rpc('get_diario_alunos', {
      p_turma_id: turmaId,
      p_disciplina_id: disciplinaId,
    });

    if (error) throw error;

    return (data || [])
      .filter((matricula: any) => matricula.aluno_id)
      .map((matricula: any) => ({
        id: matricula.aluno_id,
        nome: matricula.nome,
        matricula: formatMatricula(matricula.matricula_id, matricula.data_matricula),
        status: matricula.status,
      }));
  },

  async getAulas(turmaId: string, disciplinaId: string): Promise<DiarioAula[]> {
    const { data, error } = await supabase
      .from('aulas_turma')
      .select('id, titulo, carga_horaria, data_aula, sessao, created_at')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;

    const encontros: DiarioAula[] = [];
    sortAulas(data || []).forEach((aula: any, idx: number) => {
      const sessao: DiarioSessao = {
        id: aula.id,
        periodo: (aula.sessao || 'U') as DiarioSessaoPeriodo,
        cargaHoraria: parseFloat(aula.carga_horaria),
      };
      const existente = encontros.find((item) => item.dataAula === aula.data_aula);
      if (existente) {
        existente.sessoes.push(sessao);
        existente.cargaHoraria += sessao.cargaHoraria;
        return;
      }
      encontros.push({
        id: aula.id,
        titulo: aula.titulo,
        cargaHoraria: sessao.cargaHoraria,
        dataAula: aula.data_aula,
        dataLabel: aula.data_aula
          ? new Date(`${aula.data_aula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : aula.created_at
            ? new Date(aula.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : `Aula ${idx + 1}`,
        sessoes: [sessao],
      });
    });
    return encontros;
  },

  async addAula(turmaId: string, disciplinaId: string, input: DiarioAulaInput): Promise<DiarioAula> {
    const { data, error } = await supabase
      .rpc('salvar_encontro_turma', {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
        p_titulo: input.titulo,
        p_carga_horaria: input.cargaHoraria,
        p_data_aula: input.dataAula,
        p_aula_id: null,
      });

    if (error) throw error;
    const sessoes = sortAulas(data || []);
    const primeira = sessoes[0];
    if (!primeira) throw new Error('O banco não retornou o encontro criado.');
    return {
      id: primeira.id,
      titulo: primeira.titulo,
      cargaHoraria: sessoes.reduce((total, sessao) => total + parseFloat(sessao.carga_horaria), 0),
      dataAula: primeira.data_aula,
      dataLabel: primeira.data_aula
        ? new Date(`${primeira.data_aula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : 'Aula',
      sessoes: sessoes.map((sessao) => ({
        id: sessao.id,
        periodo: (sessao.sessao || 'U') as DiarioSessaoPeriodo,
        cargaHoraria: parseFloat(sessao.carga_horaria),
      })),
    };
  },

  async saveAulaTitulo(aulaId: string, titulo: string) {
    const { data, error } = await supabase.rpc('atualizar_titulo_encontro_professor', {
      p_aula_id: aulaId,
      p_titulo: titulo,
    });

    if (error) throw error;
    return data;
  },

  async getAttendance(turmaId: string, disciplinaId: string) {
    const { data, error } = await supabase
      .from('diario_frequencia')
      .select('*')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;
    return data || [];
  },

  async getGrades(turmaId: string, disciplinaId: string) {
    const { data, error } = await supabase.rpc('get_diario_resultados', {
      p_turma_id: turmaId,
      p_disciplina_id: disciplinaId,
    });

    if (error) throw error;
    return data || [];
  },

  async getPraticas(turmaId: string, disciplinaId: string) {
    const { data, error } = await supabase
      .from('diario_praticas')
      .select('*')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;
    return data || [];
  },

  async getObservacoes(turmaId: string, disciplinaId: string) {
    const { data, error } = await supabase
      .from('diario_observacoes')
      .select('observacoes')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId)
      .maybeSingle();

    if (error) throw error;
    return data?.observacoes || '';
  },

  async getClosureState(turmaId: string, disciplinaId: string): Promise<DiarioClosureState> {
    const [closureResult, pendingResult] = await Promise.all([
      supabase.rpc('get_diario_fechamento', {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
      }),
      supabase.rpc('get_pendencias_fechamento_diario', {
        p_turma_id: turmaId,
        p_disciplina_id: disciplinaId,
      }),
    ]);
    if (closureResult.error) throw closureResult.error;
    if (pendingResult.error) throw pendingResult.error;
    const row = closureResult.data?.[0];
    if (!row) throw new Error('O banco não retornou o estado de fechamento do diário.');
    const pending = pendingResult.data || {};
    return {
      ...row,
      horas_realizadas: Number(row.horas_realizadas),
      carga_horaria: Number(row.carga_horaria),
      progresso_percent: Number(row.progresso_percent),
      alunos_ativos: Number(pending.alunosAtivos || 0),
      aulas_realizadas: Number(pending.aulasRealizadas || 0),
      frequencias_pendentes: Number(pending.frequenciasPendentes || 0),
      notas_pendentes: Number(pending.notasPendentes || 0),
      pode_fechar: Boolean(pending.podeFechar),
    } as DiarioClosureState;
  },

  async setClosureLock(
    turmaId: string,
    disciplinaId: string,
    bloqueio: DiarioLockScope,
    motivo?: string,
    confirmarPendencias = false,
  ) {
    const { data, error } = await supabase.rpc('set_diario_bloqueio_confirmado', {
      p_turma_id: turmaId,
      p_disciplina_id: disciplinaId,
      p_bloqueio: bloqueio,
      p_motivo: motivo || null,
      p_confirmar_pendencias: confirmarPendencias,
    });
    if (error) throw error;
    return data;
  },

  async toggleAttendance(
    turmaId: string,
    disciplinaId: string,
    aulaId: string,
    alunoId: string,
    nextStatus: AttendanceStatus,
  ) {
    if (nextStatus === null) {
      const { error } = await supabase
        .from('diario_frequencia')
        .delete()
        .eq('turma_id', turmaId)
        .eq('disciplina_id', disciplinaId)
        .eq('aula_id', aulaId)
        .eq('aluno_id', alunoId);

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('diario_frequencia')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        aula_id: aulaId,
        aluno_id: alunoId,
        status: nextStatus,
      }, { onConflict: 'aula_id,aluno_id' });

    if (error) throw error;
  },

  async saveStudentGrades(
    turmaId: string,
    disciplinaId: string,
    alunoId: string,
    fields: DiarioGradeFields,
  ) {
    const patch: Record<string, number | null> = {};
    const columnByField: Record<keyof DiarioGradeFields, string> = {
      p: 'nota_p',
      ti: 'nota_ti',
      tg: 'nota_tg',
      s: 'nota_s',
      cq: 'nota_cq',
      o: 'nota_o',
      rec: 'nota_rec',
    };
    (Object.keys(columnByField) as (keyof DiarioGradeFields)[]).forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(fields, field)) {
        patch[columnByField[field]] = fields[field] ?? null;
      }
    });

    if (Object.keys(patch).length === 0) return;

    const updateExisting = () => supabase
      .from('diario_notas')
      .update(patch)
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId)
      .eq('aluno_id', alunoId)
      .select('aluno_id')
      .maybeSingle();

    const { data: updated, error: updateError } = await updateExisting();
    if (updateError) throw updateError;
    if (updated) return;

    const { error: insertError } = await supabase
      .from('diario_notas')
      .insert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        aluno_id: alunoId,
        ...patch,
      });

    if (!insertError) return;
    if (insertError.code !== '23505') throw insertError;

    const { error: retryError } = await updateExisting();
    if (retryError) throw retryError;
  },

  async savePratica(turmaId: string, disciplinaId: string, aulaId: string, text: string) {
    const { data: anchor, error: anchorError } = await supabase
      .from('aulas_turma')
      .select('data_aula')
      .eq('id', aulaId)
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId)
      .single();
    if (anchorError) throw anchorError;

    const { data: sessoes, error: sessionsError } = await supabase
      .from('aulas_turma')
      .select('id')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId)
      .eq('data_aula', anchor.data_aula);
    if (sessionsError) throw sessionsError;

    const { error } = await supabase
      .from('diario_praticas')
      .upsert((sessoes || []).map((sessao) => ({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        aula_id: sessao.id,
        pratica_pedagogica: text,
      })), { onConflict: 'aula_id' });

    if (error) throw error;
  },

  async saveObservacoes(turmaId: string, disciplinaId: string, text: string) {
    const { error } = await supabase
      .from('diario_observacoes')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        observacoes: text,
      }, { onConflict: 'turma_id,disciplina_id' });

    if (error) throw error;
  },
};
