import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { getGestorAccessScope } from '../../login/portal-session';
import type { DashboardWidgetId } from '../access-control';
import type { GestorPoloOption } from './useGestorPolos';
import {
  dashboardActivityQueryOptions, dashboardChartQueryOptions, dashboardKpisQueryOptions,
} from '../dashboard/dashboard.queries';
import { gestorCalendarQueryOptions } from '../calendario/calendario.queries';
import { POLO_CADASTROS_ALLOWED } from '../gestor-navigation';
import PoloTransitionOverlay, { type PoloTransitionStatus } from '../../shared/components/PoloTransitionOverlay';
import { waitForActivePoloQueries } from '../../shared/utils/poloTransitionQueries';

interface PoloTransitionState {
  fromPoloId: string;
  fromPoloName: string;
  fromPoloCity?: string | null;
  fromPoloState?: string | null;
  fromPoloIsMatriz?: boolean;
  toPoloId: string;
  toPoloName: string;
  toPoloCity?: string | null;
  toPoloState?: string | null;
  toPoloIsMatriz?: boolean;
  previousModule: string;
  status: PoloTransitionStatus;
  errorMessage?: string;
}

interface UseGestorPoloTransitionOptions {
  gestorScope: ReturnType<typeof getGestorAccessScope>;
  visiblePolos: GestorPoloOption[];
  currentPolo?: GestorPoloOption;
  effectivePoloId: string | null;
  activeModule: string;
  dashboardWidgets: DashboardWidgetId[];
  dashboardAccessKey: string;
  hasUnsavedAutomationDraft: boolean;
  setIsPoloSelectorOpen: (open: boolean) => void;
  setCurrentPoloId: (id: string | null) => void;
  setActiveModule: (moduleId: string) => void;
  setHasUnsavedAutomationDraft: (dirty: boolean) => void;
}

const POLO_TRANSITION_MINIMUM_MS = 550;
const POLO_TRANSITION_SUCCESS_MS = 450;

export const useGestorPoloTransition = ({
  gestorScope, visiblePolos, currentPolo, effectivePoloId, activeModule,
  dashboardWidgets, dashboardAccessKey, hasUnsavedAutomationDraft,
  setIsPoloSelectorOpen, setCurrentPoloId, setActiveModule, setHasUnsavedAutomationDraft,
}: UseGestorPoloTransitionOptions) => {
  const queryClient = useQueryClient();
  const [poloTransition, setPoloTransition] = useState<PoloTransitionState | null>(null);
  const poloTransitionRunRef = useRef(0);
  useEffect(() => () => { poloTransitionRunRef.current += 1; }, []);

  const prepareCriticalPoloData = useCallback(async (poloId: string) => {
    if (activeModule === 'inicio') {
      const hasKpis = dashboardWidgets.some((widgetId) => [
        'alunos-ativos',
        'receita-mes',
        'inadimplencia',
        'matriculas-mes',
      ].includes(widgetId));
      const dashboardPromises: Array<Promise<unknown>> = [];

      if (hasKpis) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardKpisQueryOptions(poloId, dashboardAccessKey)),
        );
      }
      if (dashboardWidgets.includes('fluxo-caixa')) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardChartQueryOptions(poloId, dashboardAccessKey)),
        );
      }
      if (dashboardWidgets.includes('atividade-recente')) {
        dashboardPromises.push(
          queryClient.ensureQueryData(dashboardActivityQueryOptions(poloId, dashboardAccessKey)),
        );
      }

      await Promise.all(dashboardPromises);
      return;
    }

    if (activeModule === 'calendario') {
      await queryClient.ensureQueryData(gestorCalendarQueryOptions(poloId));
    }
  }, [activeModule, dashboardAccessKey, dashboardWidgets, queryClient]);

  const executePoloChange = async (poloId: string) => {
    if (!gestorScope.isGlobal && !gestorScope.allowedPoloIds?.includes(poloId)) {
      return;
    }

    const nextPolo = visiblePolos.find(polo => polo.id === poloId);
    if (!nextPolo || !currentPolo || poloId === effectivePoloId) {
      setIsPoloSelectorOpen(false);
      return;
    }
    if (poloTransition?.status === 'loading' || poloTransition?.status === 'success') {
      return;
    }
    if (hasUnsavedAutomationDraft && !window.confirm('Descartar as alterações não salvas deste rascunho antes de trocar de polo?')) {
      setIsPoloSelectorOpen(false);
      return;
    }

    // O Caixa gerencia sua competência e seus estados de consulta. Confirmar o
    // polo inicia os resumos juntos, sem preparar outro período em uma etapa anterior.
    if (activeModule === 'caixa') {
      poloTransitionRunRef.current += 1;
      setIsPoloSelectorOpen(false);
      setCurrentPoloId(poloId);
      try {
        sessionStorage.setItem('current_polo_id', poloId);
      } catch (error) {
        console.error('Não foi possível salvar a preferência de polo nesta sessão:', error);
      }
      setHasUnsavedAutomationDraft(false);
      setPoloTransition(null);
      return;
    }

    const runId = ++poloTransitionRunRef.current;
    const startedAt = Date.now();
    const previousPoloId = effectivePoloId || currentPolo.id;
    const previousPoloName = currentPolo.nome || 'Polo atual';
    const nextPoloName = nextPolo.nome || 'Novo polo';
    const previousModule = activeModule;
    let hasCommitted = false;

    setIsPoloSelectorOpen(false);
    setPoloTransition({
      fromPoloId: previousPoloId,
      fromPoloName: previousPoloName,
      fromPoloCity: currentPolo.cidade,
      fromPoloState: currentPolo.estado,
      fromPoloIsMatriz: currentPolo.is_matriz,
      toPoloId: poloId,
      toPoloName: nextPoloName,
      toPoloCity: nextPolo.cidade,
      toPoloState: nextPolo.estado,
      toPoloIsMatriz: nextPolo.is_matriz,
      previousModule,
      status: 'loading',
    });

    try {
      await prepareCriticalPoloData(poloId);
      if (poloTransitionRunRef.current !== runId) return;

      setCurrentPoloId(poloId);
      sessionStorage.setItem('current_polo_id', poloId);
      hasCommitted = true;

      if (!nextPolo.is_matriz && activeModule.startsWith('cadastros-') && !POLO_CADASTROS_ALLOWED.has(activeModule)) {
        setActiveModule('cadastros');
      }
      if (!nextPolo.is_matriz && activeModule === 'configuracoes') {
        setActiveModule('inicio');
      }

      await waitForActivePoloQueries(queryClient, poloId, startedAt);
      const remainingMinimum = POLO_TRANSITION_MINIMUM_MS - (Date.now() - startedAt);
      if (remainingMinimum > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingMinimum));
      }
      if (poloTransitionRunRef.current !== runId) return;

      setHasUnsavedAutomationDraft(false);
      setPoloTransition((current) => current?.toPoloId === poloId
        ? { ...current, status: 'success' }
        : current);
      await new Promise((resolve) => window.setTimeout(resolve, POLO_TRANSITION_SUCCESS_MS));
      if (poloTransitionRunRef.current === runId) {
        setPoloTransition(null);
      }
    } catch (error) {
      if (poloTransitionRunRef.current !== runId) return;
      console.error('Não foi possível concluir a troca de polo no portal do gestor:', error);

      if (hasCommitted) {
        setCurrentPoloId(previousPoloId);
        sessionStorage.setItem('current_polo_id', previousPoloId);
        setActiveModule(previousModule);
      }

      setPoloTransition((current) => current?.toPoloId === poloId
        ? {
            ...current,
            status: 'error',
            errorMessage: 'Não foi possível carregar os dados do polo selecionado. Verifique sua conexão e tente novamente.',
          }
        : current);
    }
  };

  const handlePoloChange = (poloId: string) => {
    void executePoloChange(poloId);
  };

  const cancelPoloTransition = () => {
    poloTransitionRunRef.current += 1;
    setPoloTransition(null);
  };

  const transitionOverlay = (
    <>
      {poloTransition ? (
        poloTransition.status === 'error' ? (
          <PoloTransitionOverlay
            isOpen
            fromPoloName={poloTransition.fromPoloName}
            fromPoloCity={poloTransition.fromPoloCity}
            fromPoloState={poloTransition.fromPoloState}
            fromPoloIsMatriz={poloTransition.fromPoloIsMatriz}
            toPoloName={poloTransition.toPoloName}
            toPoloCity={poloTransition.toPoloCity}
            toPoloState={poloTransition.toPoloState}
            toPoloIsMatriz={poloTransition.toPoloIsMatriz}
            status="error"
            errorMessage={poloTransition.errorMessage}
            onRetry={() => { void executePoloChange(poloTransition.toPoloId); }}
            onCancel={cancelPoloTransition}
          />
        ) : (
          <PoloTransitionOverlay
            isOpen
            fromPoloName={poloTransition.fromPoloName}
            fromPoloCity={poloTransition.fromPoloCity}
            fromPoloState={poloTransition.fromPoloState}
            fromPoloIsMatriz={poloTransition.fromPoloIsMatriz}
            toPoloName={poloTransition.toPoloName}
            toPoloCity={poloTransition.toPoloCity}
            toPoloState={poloTransition.toPoloState}
            toPoloIsMatriz={poloTransition.toPoloIsMatriz}
            status={poloTransition.status}
          />
        )
      ) : null}
    </>
  );
  return { handlePoloChange, transitionOverlay };
};
