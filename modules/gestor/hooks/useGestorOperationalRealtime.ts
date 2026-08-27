import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { gestaoQueryKeys } from '../gestao/gestao.query-keys';
import { dashboardQueryKeys } from '../dashboard/dashboard.queries';
import { parceirosQueryKeys } from '../parceiros/parceiros.query-keys';
import { secretariaCarteirinhasKeys } from '../secretaria/carteirinhas/secretaria-carteirinhas.service';

interface OperationalRealtimeScope {
  enabled: boolean;
  poloId?: string | null;
  includeGlobalPartners?: boolean;
}

export const useGestorOperationalRealtime = ({
  enabled,
  poloId,
  includeGlobalPartners = false,
}: OperationalRealtimeScope) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    // Ao trocar de polo, o novo escopo pode ter mudado enquanto não estava sendo observado.
    // Apenas o marca como pendente; a leitura acontece somente se a tela correspondente abrir.
    if (poloId) {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (key[0] !== 'gestao') return false;
          if (key[1] === 'resumos') return key[2] === poloId;
          if (key[1] !== 'turmas') return false;
          const filters = key[3];
          return Boolean(filters && typeof filters === 'object' && 'poloId' in filters && filters.poloId === poloId);
        },
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: parceirosQueryKeys.list(poloId, includeGlobalPartners),
        exact: true,
        refetchType: 'none',
      });
      void queryClient.invalidateQueries({
        queryKey: parceirosQueryKeys.turmasDisponiveis(poloId),
        exact: true,
        refetchType: 'none',
      });
    }

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let hasSubscribed = false;
    let refreshGestao = false;
    let refreshParceiros = false;
    let refreshPartnerClasses = false;
    let refreshSecretaria = false;
    let refreshDashboardKpis = false;
    let disposed = false;
    let scopeTurmasReady = !poloId;
    const scopedTurmaIds = new Set<string>();
    const changedPartnerIds = new Set<string>();

    if (poloId) {
      void supabase
        .from('turmas')
        .select('id')
        .eq('polo_id', poloId)
        .then(({ data, error }) => {
          if (disposed) return;
          if (error) {
            console.error('Não foi possível preparar o escopo Realtime das turmas:', error);
            return;
          }
          scopedTurmaIds.clear();
          (data || []).forEach((turma) => scopedTurmaIds.add(turma.id));
          scopeTurmasReady = true;
        });
    }

    const markGestaoChanged = (includeCourses = false) => {
      refreshGestao = true;
      void queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries(), refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classes(), refetchType: 'none' });
      if (includeCourses) {
        void queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.courses(), refetchType: 'none' });
      }
      scheduleActiveRefresh();
    };

    const markTechnicalProgressChanged = () => {
      refreshGestao = true;
      void queryClient.invalidateQueries({
        queryKey: gestaoQueryKeys.classesByModality('TECNICO'),
        refetchType: 'none',
      });
      scheduleActiveRefresh();
    };

    const markParceirosChanged = (changedId?: string) => {
      refreshParceiros = true;
      refreshSecretaria = true;
      refreshDashboardKpis = true;
      void queryClient.invalidateQueries({ queryKey: parceirosQueryKeys.all, refetchType: 'none' });
      void queryClient.invalidateQueries({
        predicate: (query) => (
          query.queryKey[0] === dashboardQueryKeys.all[0]
          && query.queryKey[2] === 'kpis'
          && (!poloId || query.queryKey[1] === poloId)
        ),
        refetchType: 'none',
      });
      if (poloId) {
        void queryClient.invalidateQueries({
          queryKey: secretariaCarteirinhasKeys.workspace(poloId),
          exact: true,
          refetchType: 'none',
        });
      }
      if (changedId) {
        changedPartnerIds.add(changedId);
        void queryClient.invalidateQueries({
          queryKey: parceirosQueryKeys.detail(changedId),
          exact: true,
          refetchType: 'none',
        });
      }
      scheduleActiveRefresh();
    };

    const markPartnerClassesChanged = () => {
      refreshPartnerClasses = true;
      refreshSecretaria = true;
      void queryClient.invalidateQueries({
        queryKey: parceirosQueryKeys.availableClasses,
        refetchType: 'none',
      });
      if (poloId) {
        void queryClient.invalidateQueries({
          queryKey: secretariaCarteirinhasKeys.workspace(poloId),
          exact: true,
          refetchType: 'none',
        });
      }
      scheduleActiveRefresh();
    };

    function scheduleActiveRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (refreshGestao) {
          void queryClient.refetchQueries({ queryKey: gestaoQueryKeys.all, type: 'active', stale: true });
        }
        if (refreshParceiros) {
          void queryClient.refetchQueries({ queryKey: parceirosQueryKeys.all, type: 'active', stale: true });
          changedPartnerIds.forEach((id) => {
            void queryClient.refetchQueries({
              queryKey: parceirosQueryKeys.detail(id),
              exact: true,
              type: 'active',
              stale: true,
            });
          });
        }
        if (refreshPartnerClasses) {
          void queryClient.refetchQueries({
            queryKey: parceirosQueryKeys.availableClasses,
            type: 'active',
            stale: true,
          });
        }
        if (refreshSecretaria && poloId) {
          void queryClient.refetchQueries({
            queryKey: secretariaCarteirinhasKeys.workspace(poloId),
            exact: true,
            type: 'active',
            stale: true,
          });
        }
        if (refreshDashboardKpis) {
          void queryClient.refetchQueries({
            predicate: (query) => (
              query.queryKey[0] === dashboardQueryKeys.all[0]
              && query.queryKey[2] === 'kpis'
              && (!poloId || query.queryKey[1] === poloId)
            ),
            type: 'active',
            stale: true,
          });
        }
        refreshGestao = false;
        refreshParceiros = false;
        refreshPartnerClasses = false;
        refreshSecretaria = false;
        refreshDashboardKpis = false;
        changedPartnerIds.clear();
      }, 400);
    }

    const partnerChanged = (payload: any) => {
      const nextRow = Object.keys(payload.new || {}).length > 0 ? payload.new : null;
      const previousRow = Object.keys(payload.old || {}).length > 0 ? payload.old : null;
      const belongsToScope = (row: any) => {
        if (!row) return false;
        if (!poloId) return true;
        const poloIds = Array.isArray(row.polo_ids) ? row.polo_ids : [];
        const isGlobal = !row.polo_id && poloIds.length === 0;
        return row.polo_id === poloId
          || poloIds.includes(poloId)
          || (includeGlobalPartners && isGlobal);
      };

      const changedId = nextRow?.id || previousRow?.id;
      const cachedPartners = queryClient.getQueryData<any[]>(
        parceirosQueryKeys.list(poloId, includeGlobalPartners),
      );
      const isAlreadyInCachedScope = Boolean(
        changedId && cachedPartners?.some((partner) => partner.id === changedId),
      );

      if (belongsToScope(nextRow) || belongsToScope(previousRow) || isAlreadyInCachedScope) {
        markParceirosChanged(changedId);
      }
    };

    const eventMatchesCurrentTurmaScope = (payload: any) => {
      if (!poloId) return true;
      const next = Object.keys(payload.new || {}).length > 0 ? payload.new : null;
      const previous = Object.keys(payload.old || {}).length > 0 ? payload.old : null;
      const turmaId = next?.turma_id || previous?.turma_id;
      if (turmaId) return scopedTurmaIds.has(turmaId) || !scopeTurmasReady;
      return payload.eventType === 'DELETE' || !scopeTurmasReady;
    };

    const enrollmentChanged = (payload: any) => {
      if (!eventMatchesCurrentTurmaScope(payload)) {
        const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
        const cachedPartners = queryClient.getQueryData<any[]>(
          parceirosQueryKeys.list(poloId, includeGlobalPartners),
        );
        if (row?.aluno_id && cachedPartners?.some((partner) => partner.id === row.aluno_id)) {
          markParceirosChanged();
        }
        return;
      }
      markGestaoChanged();
      markParceirosChanged();
    };

    const onlineEnrollmentChanged = (payload: any) => {
      if (eventMatchesCurrentTurmaScope(payload)) markGestaoChanged();
    };

    const academicMovementChanged = (payload: any) => {
      const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
      const turmaIds = [row?.turma_id, row?.turma_origem_id, row?.turma_destino_id].filter(Boolean);
      if (!poloId || !scopeTurmasReady || turmaIds.some((id) => scopedTurmaIds.has(id))) {
        markGestaoChanged();
        markParceirosChanged();
      }
    };

    const technicalProgressChanged = (payload: any) => {
      const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
      if (
        !poloId
        || !scopeTurmasReady
        || payload.eventType === 'DELETE'
        || (row?.turma_id && scopedTurmaIds.has(row.turma_id))
      ) {
        markTechnicalProgressChanged();
      }
    };

    let channel = supabase
      .channel(`gestor-operacional-${poloId || 'todos'}-${includeGlobalPartners ? 'global' : 'local'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parceiros' }, partnerChanged)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'turmas',
          ...(poloId ? { filter: `polo_id=eq.${poloId}` } : {}),
        },
        (payload: any) => {
          const row = Object.keys(payload.new || {}).length > 0 ? payload.new : payload.old;
          if (payload.eventType === 'DELETE') scopedTurmaIds.delete(row?.id);
          else if (row?.id) scopedTurmaIds.add(row.id);
          markGestaoChanged();
          markPartnerClassesChanged();
          const next = payload.new as any;
          const previous = payload.old as any;
          if (next?.curso_id && previous?.curso_id && next.curso_id !== previous.curso_id) {
            markParceirosChanged();
          }
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matriculas' }, enrollmentChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inscricoes_online' }, onlineEnrollmentChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matricula_movimentacoes' }, academicMovementChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_academicas' }, academicMovementChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turmas_disciplinas' }, technicalProgressChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cursos' }, () => {
        markGestaoChanged(true);
        markParceirosChanged();
        markPartnerClassesChanged();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos_templates' }, () => {
        refreshSecretaria = true;
        if (poloId) {
          void queryClient.invalidateQueries({
            queryKey: secretariaCarteirinhasKeys.workspace(poloId),
            exact: true,
            refetchType: 'none',
          });
        }
        scheduleActiveRefresh();
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'polos',
          ...(poloId ? { filter: `id=eq.${poloId}` } : {}),
        },
        () => {
          markGestaoChanged();
          markParceirosChanged();
          markPartnerClassesChanged();
        },
      );

    channel = channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (hasSubscribed) {
        // Uma reconexão pode ter perdido eventos; faz uma única conferência das consultas ativas.
        markGestaoChanged(true);
        markParceirosChanged();
        markPartnerClassesChanged();
      }
      hasSubscribed = true;
    });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, includeGlobalPartners, poloId, queryClient]);
};
