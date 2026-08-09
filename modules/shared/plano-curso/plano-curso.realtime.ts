import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../../lib/supabase';
import { planoCursoKeys } from './plano-curso.keys';

interface PlanoCursoRealtimeRow {
  id?: unknown;
  turma_id?: unknown;
  disciplina_id?: unknown;
  professor_id?: unknown;
  revisao?: unknown;
}

interface LocalPlanoCursoMutation {
  token: number;
  turmaId: string;
  disciplinaId: string;
  planoId: string | null;
  revision: number | null;
  expiresAt: number;
  consumed: boolean;
}

const LOCAL_MUTATION_TTL_MS = 30_000;
const SETTLED_MUTATION_TTL_MS = 5_000;
const localMutations = new Map<number, LocalPlanoCursoMutation>();
let nextLocalMutationToken = 0;

const pruneLocalMutations = (now = Date.now()) => {
  localMutations.forEach((mutation, token) => {
    if (mutation.expiresAt <= now) localMutations.delete(token);
  });
};

export const beginLocalPlanoCursoMutation = (
  turmaId: string,
  disciplinaId: string,
) => {
  pruneLocalMutations();
  const token = ++nextLocalMutationToken;
  localMutations.set(token, {
    token,
    turmaId,
    disciplinaId,
    planoId: null,
    revision: null,
    expiresAt: Date.now() + LOCAL_MUTATION_TTL_MS,
    consumed: false,
  });
  return token;
};

export const settleLocalPlanoCursoMutation = (
  token: number,
  planoId: string,
  revision: number,
) => {
  const mutation = localMutations.get(token);
  if (!mutation) return;
  if (mutation.consumed) {
    localMutations.delete(token);
    return;
  }
  mutation.planoId = planoId;
  mutation.revision = revision;
  mutation.expiresAt = Date.now() + SETTLED_MUTATION_TTL_MS;
};

export const cancelLocalPlanoCursoMutation = (token: number) => {
  localMutations.delete(token);
};

const consumeLocalPlanoCursoEvent = (row: PlanoCursoRealtimeRow) => {
  pruneLocalMutations();
  const turmaId = typeof row.turma_id === 'string' ? row.turma_id : null;
  const disciplinaId = typeof row.disciplina_id === 'string' ? row.disciplina_id : null;
  const planoId = typeof row.id === 'string' ? row.id : null;
  const revision = typeof row.revisao === 'number' ? row.revisao : Number(row.revisao);
  if (!turmaId || !disciplinaId || !Number.isFinite(revision)) return false;

  const mutation = [...localMutations.values()].find((candidate) => {
    if (candidate.turmaId !== turmaId || candidate.disciplinaId !== disciplinaId) return false;
    // Antes do retorno da RPC não existe correlação segura: um evento remoto
    // concorrente da mesma disciplina não pode ser confundido com o eco local.
    return candidate.planoId !== null
      && candidate.revision !== null
      && candidate.planoId === planoId
      && candidate.revision === revision;
  });
  if (!mutation) return false;

  mutation.consumed = true;
  if (mutation.planoId) localMutations.delete(mutation.token);
  return true;
};

interface UsePlanoCursoRealtimeOptions {
  professorId?: string;
  poloId?: string;
  turmaId?: string;
}

export const usePlanoCursoRealtime = ({
  professorId = '',
  poloId = '',
  turmaId = '',
}: UsePlanoCursoRealtimeOptions) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const filter = turmaId
      ? `turma_id=eq.${turmaId}`
      : professorId
        ? `professor_id=eq.${professorId}`
        : '';
    if (!filter) return undefined;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let eligibilityTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingRows = new Map<string, PlanoCursoRealtimeRow>();

    const reconcile = () => {
      const rows = [...pendingRows.values()];
      pendingRows.clear();

      rows.forEach((row) => {
        if (consumeLocalPlanoCursoEvent(row)) return;
        const rowTurmaId = typeof row.turma_id === 'string' ? row.turma_id : '';
        const disciplinaId = typeof row.disciplina_id === 'string' ? row.disciplina_id : '';
        const planoId = typeof row.id === 'string' ? row.id : '';

        if (professorId && poloId) {
          void queryClient.invalidateQueries({
            queryKey: planoCursoKeys.professorList(professorId, poloId),
            exact: true,
          });
          if (rowTurmaId && disciplinaId) {
            void queryClient.invalidateQueries({
              queryKey: planoCursoKeys.professorWorkspace(
                professorId,
                poloId,
                rowTurmaId,
                disciplinaId,
              ),
              exact: true,
            });
          }
        }

        if (turmaId) {
          void queryClient.invalidateQueries({
            queryKey: planoCursoKeys.gestaoStatusList(turmaId),
            exact: true,
          });
          if (disciplinaId) {
            void queryClient.invalidateQueries({
              queryKey: [...planoCursoKeys.gestaoRoot(turmaId), 'detail', disciplinaId],
            });
          }
        }

        if (planoId) {
          void queryClient.invalidateQueries({
            queryKey: [...planoCursoKeys.all, 'document', planoId],
          });
        }
      });
    };

    const onChange = (payload: { new?: PlanoCursoRealtimeRow; old?: PlanoCursoRealtimeRow }) => {
      const row = payload.new && Object.keys(payload.new).length > 0
        ? payload.new
        : payload.old || {};
      const rowKey = [row.id, row.turma_id, row.disciplina_id].map(String).join(':');
      pendingRows.set(rowKey, row);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(reconcile, 300);
    };

    const channel = supabase
      .channel(`plano-curso-${turmaId || professorId}-${poloId || 'gestao'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planos_curso', filter },
        onChange,
      )
      .subscribe();

    const eligibilityChannel = professorId && poloId
      ? supabase
          .channel(
            `plano-curso:professor:${professorId}:polo:${poloId}`,
            { config: { private: true } },
          )
          .on(
            'broadcast',
            { event: 'eligibility-changed' },
            ({ payload }) => {
              const change = payload as {
                changed?: unknown;
                turmaId?: unknown;
                disciplinaId?: unknown;
              };
              if (
                change.changed !== true
                || typeof change.turmaId !== 'string'
                || typeof change.disciplinaId !== 'string'
              ) return;
              if (eligibilityTimer) clearTimeout(eligibilityTimer);
              eligibilityTimer = setTimeout(() => {
                void queryClient.invalidateQueries({
                  queryKey: planoCursoKeys.professorList(professorId, poloId),
                  exact: true,
                });
              }, 200);
            },
          )
          .subscribe()
      : null;

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (eligibilityTimer) clearTimeout(eligibilityTimer);
      pendingRows.clear();
      supabase.removeChannel(channel);
      if (eligibilityChannel) supabase.removeChannel(eligibilityChannel);
    };
  }, [poloId, professorId, queryClient, turmaId]);
};
