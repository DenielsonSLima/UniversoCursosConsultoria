import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { gestaoQueryKeys } from '../../../gestao.query-keys';
import { planoCursoKeys } from '../../../../../shared/plano-curso/plano-curso.keys';

interface LocalProfessorAssignment {
  token: number;
  disciplinaIds: Set<string>;
  professorId: string | null;
  expiresAt: number;
}

const LOCAL_ASSIGNMENT_TTL_MS = 30_000;
const SETTLED_LOCAL_ASSIGNMENT_TTL_MS = 5_000;
const localProfessorAssignments = new Map<string, LocalProfessorAssignment[]>();
let localAssignmentToken = 0;

const pruneLocalProfessorAssignments = (turmaId: string, now = Date.now()) => {
  const active = (localProfessorAssignments.get(turmaId) || [])
    .filter((assignment) => assignment.expiresAt > now && assignment.disciplinaIds.size > 0);
  if (active.length > 0) localProfessorAssignments.set(turmaId, active);
  else localProfessorAssignments.delete(turmaId);
  return active;
};

export const beginLocalProfessorAssignment = (
  turmaId: string,
  disciplinaIds: string[],
  professorId: string | null,
) => {
  const assignments = pruneLocalProfessorAssignments(turmaId);
  const token = ++localAssignmentToken;
  assignments.push({
    token,
    disciplinaIds: new Set(disciplinaIds),
    professorId,
    expiresAt: Date.now() + LOCAL_ASSIGNMENT_TTL_MS,
  });
  localProfessorAssignments.set(turmaId, assignments);
  return token;
};

export const cancelLocalProfessorAssignment = (turmaId: string, token: number) => {
  const assignments = pruneLocalProfessorAssignments(turmaId)
    .filter((assignment) => assignment.token !== token);
  if (assignments.length > 0) localProfessorAssignments.set(turmaId, assignments);
  else localProfessorAssignments.delete(turmaId);
};

export const settleLocalProfessorAssignment = (
  turmaId: string,
  token: number,
  changedDisciplinaIds: string[],
) => {
  const assignments = pruneLocalProfessorAssignments(turmaId);
  const assignment = assignments.find((candidate) => candidate.token === token);
  if (!assignment) return;

  const changedIds = new Set(changedDisciplinaIds);
  assignment.disciplinaIds = new Set(
    [...assignment.disciplinaIds].filter((disciplinaId) => changedIds.has(disciplinaId)),
  );
  assignment.expiresAt = Date.now() + SETTLED_LOCAL_ASSIGNMENT_TTL_MS;
  pruneLocalProfessorAssignments(turmaId);
};

export const consumeLocalProfessorAssignmentEvent = (
  turmaId: string,
  disciplinaId: string | null,
  professorId: string | null,
) => {
  if (!disciplinaId) return false;
  const assignments = pruneLocalProfessorAssignments(turmaId);
  const assignment = assignments.find((candidate) => (
    candidate.professorId === professorId
    && candidate.disciplinaIds.has(disciplinaId)
  ));
  if (!assignment) return false;

  assignment.disciplinaIds.delete(disciplinaId);
  pruneLocalProfessorAssignments(turmaId);
  return true;
};

export const useTurmaTecnicoRealtime = (turmaId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!turmaId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let disciplinaRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshFinanceiro = false;
    let subscribedOnce = false;
    const turmaKeys = [
      academicLifecycleKeys.turma(turmaId),
      academicLifecycleKeys.grade(turmaId),
      academicLifecycleKeys.diarios(turmaId),
      ['turma_financeiro_config', turmaId] as const,
      ['turma-financeiro', turmaId] as const,
      ['financeiro-alunos', turmaId] as const,
      ['diario-alunos', turmaId] as const,
      ['diario-notas-resultados', turmaId] as const,
    ];

    const scheduleRefresh = (financeiro = false) => {
      refreshFinanceiro ||= financeiro;
      turmaKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
      });
      if (financeiro) {
        void queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'], refetchType: 'none' });
        void queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'], refetchType: 'none' });
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        turmaKeys.forEach((queryKey) => {
          void queryClient.refetchQueries({ queryKey, type: 'active', stale: true });
        });
        if (refreshFinanceiro) {
          void queryClient.refetchQueries({ queryKey: ['financeiro-tecnico-recebiveis'], type: 'active', stale: true });
          void queryClient.refetchQueries({ queryKey: ['financeiro-aluno-receivables'], type: 'active', stale: true });
        }
        refreshFinanceiro = false;
      }, 300);
    };

    const scheduleGradeRefresh = () => {
      void queryClient.invalidateQueries({
        queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
        refetchType: 'none',
      });
      scheduleRefresh();
    };

    const scheduleDisciplinaRefresh = (payload: any) => {
      const row = payload?.new && Object.keys(payload.new).length > 0
        ? payload.new
        : payload?.old;
      const disciplinaId = typeof row?.disciplina_id === 'string' ? row.disciplina_id : null;
      const professorId = typeof row?.professor_id === 'string' ? row.professor_id : null;

      if (consumeLocalProfessorAssignmentEvent(turmaId, disciplinaId, professorId)) {
        return;
      }

      const disciplinaKeys = [
        academicLifecycleKeys.grade(turmaId),
        academicLifecycleKeys.diarios(turmaId),
        planoCursoKeys.gestaoStatusList(turmaId),
      ];
      disciplinaKeys.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
      });
      void queryClient.invalidateQueries({
        queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
        refetchType: 'none',
      });

      if (disciplinaRefreshTimer) clearTimeout(disciplinaRefreshTimer);
      disciplinaRefreshTimer = setTimeout(() => {
        disciplinaKeys.forEach((queryKey) => {
          void queryClient.refetchQueries({ queryKey, exact: true, type: 'active', stale: true });
        });
        void queryClient.refetchQueries({
          queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
          type: 'active',
          stale: true,
        });
      }, 300);
    };

    const scheduleGestaoRealtimeRefresh = (payload: any) => {
      const row = payload?.new && Object.keys(payload.new).length > 0
        ? payload.new
        : payload?.old;

      // turmas_disciplinas já possui assinatura filtrada logo acima. O trigger
      // legado também espelha a mesma transação na outbox; ignorar somente esse
      // espelho evita um segundo refetch sem esconder alterações externas.
      if (row?.source_table === 'turmas_disciplinas') return;
      scheduleRefresh();
    };

    const channel = supabase
      .channel(`turma-tecnico-${turmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turmas_disciplinas', filter: `turma_id=eq.${turmaId}` },
        scheduleDisciplinaRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aulas_turma', filter: `turma_id=eq.${turmaId}` },
        scheduleGradeRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_frequencia', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'diario_notas', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'atividades_extra_classe', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gestao_realtime_events', filter: `turma_id=eq.${turmaId}` },
        scheduleGestaoRealtimeRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contas_receber', filter: `turma_id=eq.${turmaId}` },
        () => scheduleRefresh(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_origem_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matricula_movimentacoes', filter: `turma_destino_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_origem_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencias_academicas', filter: `turma_destino_id=eq.${turmaId}` },
        () => scheduleRefresh(),
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (subscribedOnce) scheduleRefresh(true);
        subscribedOnce = true;
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (disciplinaRefreshTimer) clearTimeout(disciplinaRefreshTimer);
      supabase.removeChannel(channel);
    };
  }, [queryClient, turmaId]);
};
