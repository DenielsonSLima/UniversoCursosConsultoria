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

  async getStudents(turmaId: string): Promise<DiarioStudent[]> {
    const { data, error } = await supabase
      .from('matriculas')
      .select('id, status, data_matricula, parceiros(*)')
      .eq('turma_id', turmaId);

    if (error) throw error;

    return (data || [])
      .filter((matricula: any) => matricula.parceiros)
      .map((matricula: any) => ({
        id: matricula.parceiros.id,
        nome: matricula.parceiros.nome,
        matricula: formatMatricula(matricula.id, matricula.data_matricula, matricula.parceiros.polo_id),
        status: matricula.status,
      }));
  },

  async getAulas(turmaId: string, disciplinaId: string): Promise<DiarioAula[]> {
    const { data, error } = await supabase
      .from('aulas_turma')
      .select('*')
      .eq('turma_id', turmaId)
      .eq('disciplina_id', disciplinaId);

    if (error) throw error;

    return sortAulas(data || []).map((aula: any, idx: number) => ({
      id: aula.id,
      titulo: aula.titulo,
      cargaHoraria: parseFloat(aula.carga_horaria),
      dataLabel: aula.data_aula
        ? new Date(`${aula.data_aula}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        : aula.created_at
          ? new Date(aula.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
          : `Aula ${idx + 1}`,
    }));
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
    const { error } = await supabase
      .from('diario_notas')
      .upsert({
        turma_id: turmaId,
        disciplina_id: disciplinaId,
        aluno_id: alunoId,
        nota_p: fields.p,
        nota_ti: fields.ti,
        nota_tg: fields.tg,
        nota_s: fields.s,
        nota_cq: fields.cq,
        nota_o: fields.o,
        nota_rec: fields.rec,
      }, { onConflict: 'turma_id,disciplina_id,aluno_id' });

    if (error) throw error;
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
