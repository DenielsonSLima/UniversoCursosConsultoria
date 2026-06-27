import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

interface CourseEnrollmentTurma {
  id: string;
  nome: string;
  alunosMatriculados: number;
  vagasTotais: number;
  qtdVagasMinima: number;
  bloquearMatriculasAposCompletarVagas: boolean;
  dataInicioInscricao: string | null;
  dataFimInscricao: string | null;
}

export interface CourseEnrollmentAvailability {
  isAvailable: boolean;
  turma: CourseEnrollmentTurma | null;
  reason: string | null;
}

const BLOCKING_ENROLLMENT_STATUSES = new Set([
  'ATIVO',
  'CONCLUIDO',
  'PENDENTE',
  'AGUARDANDO_PAGAMENTO',
  'AGUARDANDO_CONFIRMACAO',
]);

const todayDate = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string | null | undefined) => {
  if (!value) return '';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
};

const getUnavailabilityReason = (turma: any, today: string) => {
  const alunosMatriculados = getBlockingMatriculasTotal(turma);
  const vagasTotais = Number(turma.vagas_totais || 0);
  const qtdVagasMinima = Number(turma.qtd_vagas_minima || 0);
  const bloquearMatriculasAposCompletarVagas = turma.bloquear_matriculas_apos_completar_vagas !== false;

  if (turma.data_inicio_inscricao && today < turma.data_inicio_inscricao) {
    return `Abertura das inscrições para esta turma em ${formatDate(turma.data_inicio_inscricao)}.`;
  }

  if (turma.data_fim_inscricao && today > turma.data_fim_inscricao) {
    return `As inscrições desta turma foram encerradas em ${formatDate(turma.data_fim_inscricao)}. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.`;
  }

  if (bloquearMatriculasAposCompletarVagas) {
    if (qtdVagasMinima > 0 && alunosMatriculados >= qtdVagasMinima) {
      return `Esta turma atingiu o limite configurado de ${qtdVagasMinima} alunos. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.`;
    }

    if (vagasTotais > 0 && alunosMatriculados >= vagasTotais) {
      return 'Turma lotada. Novas inscrições só estarão disponíveis quando uma nova turma for aberta.';
    }
  }

  return null;
};

const getBlockingMatriculasTotal = (turma: any) => {
  const matriculas = turma?.matriculas;
  if (!Array.isArray(matriculas)) return 0;
  return matriculas.filter((matricula: any) =>
    BLOCKING_ENROLLMENT_STATUSES.has(String(matricula?.status || '').toUpperCase())
  ).length;
};

const hydrateTurma = (turma: any): CourseEnrollmentTurma => {
  return {
    id: turma.id,
    nome: turma.nome,
    alunosMatriculados: getBlockingMatriculasTotal(turma),
    vagasTotais: Number(turma.vagas_totais || 0),
    qtdVagasMinima: Number(turma.qtd_vagas_minima || 0),
    bloquearMatriculasAposCompletarVagas: turma.bloquear_matriculas_apos_completar_vagas !== false,
    dataInicioInscricao: turma.data_inicio_inscricao || null,
    dataFimInscricao: turma.data_fim_inscricao || null,
  };
};

export const useCourseEnrollmentAvailability = (courseId?: string) => {
  return useQuery({
    queryKey: ['courseEnrollmentAvailability', courseId],
    queryFn: async (): Promise<CourseEnrollmentAvailability> => {
      if (!courseId) {
        return {
          isAvailable: false,
          turma: null,
          reason: 'Curso não informado.',
        };
      }

      const { data: turmas, error } = await supabase
        .from('turmas')
        .select('id, nome, vagas_totais, qtd_vagas_minima, bloquear_matriculas_apos_completar_vagas, data_inicio_inscricao, data_fim_inscricao, matriculas(status)')
        .eq('curso_id', courseId)
        .eq('status', 'EM_ANDAMENTO')
        .order('data_inicio', { ascending: true });

      if (error) {
        throw error;
      }

      if (!turmas || turmas.length === 0) {
        return {
          isAvailable: false,
          turma: null,
          reason: 'Não há turma aberta para este curso no momento.',
        };
      }

      const now = todayDate();
      const analyzed = turmas.map((turma: any) => {
        return {
          turma: hydrateTurma(turma),
          reason: getUnavailabilityReason(turma, now),
        };
      });

      const available = analyzed.find((item) => !item.reason);
      if (available) {
        return {
          isAvailable: true,
          turma: available.turma,
          reason: null,
        };
      }

      return {
        isAvailable: false,
        turma: analyzed[0]?.turma || null,
        reason: analyzed[0]?.reason || 'Turma indisponível no momento.',
      };
    },
    enabled: Boolean(courseId),
    staleTime: 30_000,
  });
};
