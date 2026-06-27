import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export const professorDashboardKeys = {
  all: ['professor-dashboard'] as const,
  professor: (professorId: string) => [...professorDashboardKeys.all, professorId] as const,
  disciplinasCount: (professorId: string) => [...professorDashboardKeys.professor(professorId), 'disciplinas-count'] as const,
  chatsCount: (professorId: string) => [...professorDashboardKeys.professor(professorId), 'chats-count'] as const,
  meusCursosCount: (professorId: string) => [...professorDashboardKeys.professor(professorId), 'meus-cursos-count'] as const,
};

export const useProfessorDashboardStats = (professorId: string) => {
  const disciplinas = useQuery<number>({
    queryKey: professorDashboardKeys.disciplinasCount(professorId),
    enabled: Boolean(professorId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('turmas_disciplinas')
        .select('*', { count: 'exact', head: true })
        .eq('professor_id', professorId);

      if (error) throw error;
      return count || 0;
    },
    staleTime: 30_000,
  });

  const chats = useQuery<number>({
    queryKey: professorDashboardKeys.chatsCount(professorId),
    enabled: Boolean(professorId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comunicacao_chats')
        .select('*', { count: 'exact', head: true })
        .eq('remetente_id', professorId)
        .eq('status', 'pendente');

      if (error) throw error;
      return count || 0;
    },
    staleTime: 20_000,
  });

  const meusCursos = useQuery<number>({
    queryKey: professorDashboardKeys.meusCursosCount(professorId),
    enabled: Boolean(professorId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('matriculas')
        .select('*', { count: 'exact', head: true })
        .eq('aluno_id', professorId)
        .in('status', ['ATIVO', 'CONCLUIDO']);

      if (error) throw error;
      return count || 0;
    },
    staleTime: 30_000,
  });

  return {
    disciplinasCount: disciplinas.data || 0,
    chatsCount: chats.data || 0,
    meusCursosCount: meusCursos.data || 0,
    isLoading: disciplinas.isLoading || chats.isLoading || meusCursos.isLoading,
    isError: disciplinas.isError || chats.isError || meusCursos.isError,
  };
};
