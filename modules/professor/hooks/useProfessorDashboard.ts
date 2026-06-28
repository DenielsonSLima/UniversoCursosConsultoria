import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';

export interface ProfessorDashboardLesson {
  id: string;
  titulo: string;
  dataAula: string | null;
  cargaHoraria: number | null;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string | null;
  disciplinaId: string;
  disciplinaNome: string | null;
  cursoNome: string | null;
  poloNome: string | null;
  poloCidade: string | null;
  poloUf: string | null;
}

export interface ProfessorDashboardTurma {
  id: string;
  codigo: string | null;
  nome: string;
  status: string | null;
  dataInicio: string | null;
  cursoNome: string | null;
  poloNome: string | null;
  poloCidade: string | null;
  poloUf: string | null;
  disciplinasCount: number;
  proximaAula: string | null;
}

export interface ProfessorDashboardStats {
  disciplinasCount: number;
  turmasCount: number;
  chatsCount: number;
  meusCursosCount: number;
  proximasAulas: ProfessorDashboardLesson[];
  turmas: ProfessorDashboardTurma[];
}

export const professorDashboardKeys = {
  all: ['professor-dashboard'] as const,
  professor: (professorId: string, poloId?: string | null) => [...professorDashboardKeys.all, professorId, poloId || 'todos'] as const,
};

const emptyDashboard: ProfessorDashboardStats = {
  disciplinasCount: 0,
  turmasCount: 0,
  chatsCount: 0,
  meusCursosCount: 0,
  proximasAulas: [],
  turmas: [],
};

const normalizeDashboard = (payload: any): ProfessorDashboardStats => ({
  disciplinasCount: Number(payload?.disciplinasCount || 0),
  turmasCount: Number(payload?.turmasCount || 0),
  chatsCount: Number(payload?.chatsCount || 0),
  meusCursosCount: Number(payload?.meusCursosCount || 0),
  proximasAulas: Array.isArray(payload?.proximasAulas) ? payload.proximasAulas : [],
  turmas: Array.isArray(payload?.turmas) ? payload.turmas : [],
});

export const useProfessorDashboardStats = (professorId: string, poloId?: string | null) => {
  const dashboard = useQuery<ProfessorDashboardStats>({
    queryKey: professorDashboardKeys.professor(professorId, poloId),
    enabled: Boolean(professorId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_professor_dashboard', {
        p_polo_id: poloId || null,
      });

      if (error) throw error;
      return normalizeDashboard(data);
    },
    staleTime: 30_000,
  });

  return {
    ...(dashboard.data || emptyDashboard),
    isLoading: dashboard.isLoading,
    isError: dashboard.isError,
  };
};
