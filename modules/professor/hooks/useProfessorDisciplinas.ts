import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export interface ProfessorDisciplinaAssignment {
  id: string;
  turmaId: string;
  disciplinaId: string;
  turmaNome: string;
  turmaCodigo: string;
  cursoNome: string;
  cursoId: string;
  modalidade: string;
  turno: string;
  status: string;
  disciplinaNome: string;
  cargaHoraria: number;
  totalAulas: number;
  horasLancadas: number;
  progressoPercent: number;
  proximaAulaLabel: string;
  proximaAulaTitulo: string;
  isEstagio: boolean;
  raw: any;
  turmaForDiario: any;
  disciplinaForDiario: any;
}

export const professorDisciplinasKeys = {
  all: ['professor-disciplinas'] as const,
  list: (professorId: string) => [...professorDisciplinasKeys.all, professorId, 'list'] as const,
};

const toArrayItem = (value: any) => Array.isArray(value) ? value[0] : value;

const formatDate = (value?: string | null) => {
  if (!value) return 'A definir';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const useProfessorDisciplinas = (professorId: string) => useQuery<ProfessorDisciplinaAssignment[]>({
  queryKey: professorDisciplinasKeys.list(professorId),
  enabled: Boolean(professorId),
  staleTime: 15_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from('turmas_disciplinas')
      .select('*, turmas(*, cursos(*)), disciplinas(*)')
      .eq('professor_id', professorId);

    if (error) throw error;

    const rows = data || [];
    const turmaIds = Array.from(new Set(rows.map((row: any) => row.turma_id).filter(Boolean)));
    const disciplinaIds = Array.from(new Set(rows.map((row: any) => row.disciplina_id).filter(Boolean)));
    const assignmentPairs = new Set(rows.map((row: any) => `${row.turma_id}:${row.disciplina_id}`));
    const today = new Date().toISOString().slice(0, 10);

    let aulas: any[] = [];
    if (turmaIds.length > 0 && disciplinaIds.length > 0) {
      const { data: aulasData, error: aulasError } = await supabase
        .from('aulas_turma')
        .select('id, turma_id, disciplina_id, titulo, carga_horaria, data_aula, created_at')
        .in('turma_id', turmaIds)
        .in('disciplina_id', disciplinaIds)
        .order('data_aula', { ascending: true });

      if (aulasError) throw aulasError;
      aulas = (aulasData || []).filter((aula: any) => assignmentPairs.has(`${aula.turma_id}:${aula.disciplina_id}`));
    }

    return rows.map((row: any) => {
      const turma = toArrayItem(row.turmas) || {};
      const curso = toArrayItem(turma.cursos) || {};
      const disciplina = toArrayItem(row.disciplinas) || {};
      const aulasDaDisciplina = aulas.filter(
        (aula) => aula.turma_id === row.turma_id && aula.disciplina_id === row.disciplina_id,
      );
      const proximaAula = aulasDaDisciplina.find((aula) => !aula.data_aula || aula.data_aula >= today);
      const cargaHoraria = toNumber(row.carga_horaria ?? disciplina.carga_horaria, 0);
      const horasLancadas = aulasDaDisciplina.reduce(
        (total, aula) => total + toNumber(aula.carga_horaria, 0),
        0,
      );
      const progressoPercent = cargaHoraria > 0
        ? Math.min(100, Math.round((horasLancadas / cargaHoraria) * 100))
        : 0;
      const disciplinaNome = disciplina.nome || row.disciplina_nome || 'Disciplina';
      const turmaNome = turma.nome || 'Turma sem nome';
      const cursoNome = curso.nome || 'Curso nao informado';
      const turmaCodigo = turma.codigo || 'Sem codigo';
      const modalidade = String(curso.modalidade || turma.modalidade || 'TECNICO').toUpperCase();
      const isEstagio = normalizeText(disciplinaNome).includes('estagio');

      const turmaForDiario = {
        id: row.turma_id,
        codigo: turmaCodigo,
        nome: turmaNome,
        cursoId: curso.id || turma.curso_id || '',
        cursoNome,
        modalidade,
        poloId: turma.polo_id || '',
        poloNome: turma.polo_nome || '',
        dataInicio: turma.data_inicio || '',
        dataPrevisaoTermino: turma.data_previsao_termino || '',
        turno: turma.turno || 'EAD',
        status: turma.status || 'EM_ANDAMENTO',
        alunosMatriculados: toNumber(turma.alunos_matriculados, 0),
        vagasTotais: toNumber(turma.vagas_totais, 0),
        valorMatricula: toNumber(turma.valor_matricula, 0),
        valorRematricula: toNumber(turma.valor_rematricula, 0),
        qtdParcelas: toNumber(turma.qtd_parcelas, 0),
        valorParcela: toNumber(turma.valor_parcela, 0),
        descontoPontualidade: toNumber(turma.desconto_pontualidade, 0),
        jurosAtraso: toNumber(turma.juros_atraso, 0),
        multaAtraso: toNumber(turma.multa_atraso, 0),
      };

      const disciplinaForDiario = {
        id: row.disciplina_id,
        nome: disciplinaNome,
        professor: row.professor_nome || 'Professor',
        horasRealizadas: horasLancadas,
        cargaHoraria,
        progressoPercent,
        periodoStatus: row.periodo_status || 'ABERTO',
        concluida: Boolean(row.concluida),
      };

      return {
        id: `${row.turma_id}-${row.disciplina_id}`,
        turmaId: row.turma_id,
        disciplinaId: row.disciplina_id,
        turmaNome,
        turmaCodigo,
        cursoNome,
        cursoId: curso.id || turma.curso_id || '',
        modalidade,
        turno: turma.turno || 'Geral',
        status: turma.status || 'EM_ANDAMENTO',
        disciplinaNome,
        cargaHoraria,
        totalAulas: aulasDaDisciplina.length,
        horasLancadas,
        progressoPercent,
        proximaAulaLabel: formatDate(proximaAula?.data_aula),
        proximaAulaTitulo: proximaAula?.titulo || 'Proxima aula a definir pela secretaria',
        isEstagio,
        raw: row,
        turmaForDiario,
        disciplinaForDiario,
      };
    }).sort((a, b) => a.disciplinaNome.localeCompare(b.disciplinaNome, 'pt-BR'));
  },
});

export const useProfessorDisciplinasRealtime = (professorId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!professorId) return undefined;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: professorDisciplinasKeys.list(professorId) });
    };

    const channel = supabase
      .channel(`professor_disciplinas_realtime_${professorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas_disciplinas', filter: `professor_id=eq.${professorId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aulas_turma' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_notas' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_frequencia' },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [professorId, queryClient]);
};
