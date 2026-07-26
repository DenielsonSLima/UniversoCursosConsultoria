import { supabase } from '../../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../../lib/academicUtils';
import { diariosService } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';

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
  if (a.data_aula && b.data_aula) return a.data_aula.localeCompare(b.data_aula);
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
      .select('id, titulo, carga_horaria, data_aula, created_at')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;

    return sortAulas(data || []).map((aula: any, idx: number) => ({
      id: aula.id,
      titulo: aula.titulo,
      cargaHoraria: parseFloat(aula.carga_horaria),
      dataAula: aula.data_aula,
      dataLabel: aula.data_aula
        ? new Date(`${aula.data_aula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : aula.created_at
          ? new Date(aula.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : `Aula ${idx + 1}`,
    }));
  },

  async addAula(turmaId: string, disciplinaId: string, input: DiarioAulaInput): Promise<DiarioAula> {
    const { data, error } = await supabase
      .from('aulas_turma')
      .insert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        titulo: input.titulo,
        carga_horaria: input.cargaHoraria,
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
      dataLabel: data.data_aula
        ? new Date(`${data.data_aula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : 'Aula',
    };
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

  async toggleAttendance(
    turmaId: string,
    disciplinaId: string,
    aulaId: string,
    alunoId: string,
    nextStatus: 'P' | 'F',
  ) {
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
    const { error } = await supabase
      .from('diario_praticas')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        aula_id: aulaId,
        pratica_pedagogica: text,
      }, { onConflict: 'aula_id' });

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
