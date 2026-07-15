import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  PUBLIC_ENROLLMENT_TURMA_STATUSES,
  getCurrentDateInMaceio,
  isEligiblePublicTurmaStatus,
} from '../courseAvailability';

interface CourseEnrollmentTurma {
  id: string;
  nome: string;
  alunosMatriculados: number;
  vagasTotais: number;
  permitirInscricoesOnline: boolean;
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

const getUnavailabilityReason = (turma: any) => {
  const alunosMatriculados = getBlockingMatriculasTotal(turma);
  const vagasTotais = Number(turma.vagas_totais || 0);
  const permitirInscricoesOnline = turma.permitir_inscricoes_online === true;
  const qtdVagasMinima = Number(turma.qtd_vagas_minima || 0);
  const bloquearMatriculasAposCompletarVagas = turma.bloquear_matriculas_apos_completar_vagas !== false;

  if (!permitirInscricoesOnline) {
    return 'Inscrições online não liberadas para esta turma.';
  }

  const today = getCurrentDateInMaceio();
  const enrollmentStart = turma.data_inicio_inscricao
    ? String(turma.data_inicio_inscricao).slice(0, 10)
    : null;
  const enrollmentEnd = turma.data_fim_inscricao
    ? String(turma.data_fim_inscricao).slice(0, 10)
    : null;

  if (enrollmentStart && today < enrollmentStart) {
    return `Inscrições abrem em ${new Date(`${enrollmentStart}T12:00:00`).toLocaleDateString('pt-BR')}.`;
  }

  if (enrollmentEnd && today > enrollmentEnd) {
    return `Inscrições encerradas em ${new Date(`${enrollmentEnd}T12:00:00`).toLocaleDateString('pt-BR')}.`;
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
    permitirInscricoesOnline: turma.permitir_inscricoes_online === true,
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
        .select(`
          id,
          nome,
          vagas_totais,
          permitir_inscricoes_online,
          qtd_vagas_minima,
          bloquear_matriculas_apos_completar_vagas,
          data_inicio_inscricao,
          data_fim_inscricao,
          status,
          cursos!inner(modalidade),
          matriculas(status)
        `)
        .eq('curso_id', courseId)
        .in('status', [...PUBLIC_ENROLLMENT_TURMA_STATUSES])
        .eq('permitir_inscricoes_online', true)
        .order('data_inicio', { ascending: true });

      if (error) {
        throw error;
      }

      const eligibleTurmas = (turmas || []).filter((turma: any) => {
        const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
        return isEligiblePublicTurmaStatus(turma?.status, curso?.modalidade);
      });

      if (eligibleTurmas.length === 0) {
        return {
          isAvailable: false,
          turma: null,
          reason: 'Não há turma aberta para este curso no momento.',
        };
      }

      const analyzed = eligibleTurmas.map((turma: any) => {
        return {
          turma: hydrateTurma(turma),
          reason: getUnavailabilityReason(turma),
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
