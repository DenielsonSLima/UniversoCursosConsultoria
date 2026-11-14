import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  dirtyPlanoCursoEditorSession,
  emptyPlanoCursoEditorSession,
  hydratedPlanoCursoEditorSession,
  reconcilePlanoCursoEditorSession,
} from './plano-curso-editor-session';
import {
  expandPlanoCursoConteudosByDay,
  groupPlanoCursoAulasByDay,
} from './plano-curso-day-editor';
import {
  useConcludeProfessorPlanoCurso,
  useProfessorPlanoCursoWorkspace,
  useSaveProfessorPlanoCurso,
} from '../../shared/plano-curso/plano-curso.hooks';
import type {
  PlanoCursoSaveInput,
  PlanoCursoWorkspace,
} from '../../shared/plano-curso/plano-curso.types';

export interface PlanoCursoAssignment {
  turmaId: string;
  disciplinaId: string;
}
interface Options {
  professorId: string;
  poloId: string;
  selected: PlanoCursoAssignment | null;
  toast: {
    error: (title: string, message?: string) => void;
    success: (title: string, message?: string) => void;
  };
}
import { linesToPlanoItems as linesToItems } from './plano-curso.presentation';
const resolveErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Não foi possível concluir a operação.';
};

export const usePlanoCursoEditor = ({ professorId, poloId, selected, toast }: Options) => {
  const [objetivosText, setObjetivosText] = useState('');
  const [criteriosText, setCriteriosText] = useState('');
  const [insumosText, setInsumosText] = useState('');
  const [conteudosPorDia, setConteudosPorDia] = useState<Record<string, string>>({});
  const [diasConteudoEditados, setDiasConteudoEditados] = useState<Set<string>>(() => new Set());
  const [editorBaseRevision, setEditorBaseRevision] = useState<number | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [hasRemoteConflict, setHasRemoteConflict] = useState(false);
  const editorSessionRef = useRef(emptyPlanoCursoEditorSession());

  const workspaceQuery = useProfessorPlanoCursoWorkspace(
    professorId,
    poloId,
    selected?.turmaId || '',
    selected?.disciplinaId || '',
  );

  const saveMutation = useSaveProfessorPlanoCurso({
    professorId,
    poloId,
    onError: (error) => toast.error('Plano não salvo', resolveErrorMessage(error)),
  });
  const concludeMutation = useConcludeProfessorPlanoCurso({
    professorId,
    poloId,
    onError: (error) => toast.error('Plano não concluído', resolveErrorMessage(error)),
  });

  const workspace = workspaceQuery.data || null;
  const [pendingAction, setPendingAction] = useState<'save' | 'conclude' | null>(null);
  const submitting = useRef(false);
  const isMutating = saveMutation.isPending || concludeMutation.isPending || pendingAction !== null;
  const diasEditor = useMemo(
    () => groupPlanoCursoAulasByDay(workspace?.aulas || []),
    [workspace?.aulas],
  );
  const markEditorDirty = useCallback(() => {
    editorSessionRef.current = dirtyPlanoCursoEditorSession(editorSessionRef.current);
    setIsEditorDirty(true);
  }, []);

  const handleDayContentChange = useCallback((dataAula: string, value: string) => {
    setConteudosPorDia((current) => ({ ...current, [dataAula]: value }));
    setDiasConteudoEditados((current) => {
      const next = new Set(current);
      next.add(dataAula);
      return next;
    });
    markEditorDirty();
  }, [markEditorDirty]);

  const hydrateEditor = useCallback((current: PlanoCursoWorkspace) => {
    editorSessionRef.current = hydratedPlanoCursoEditorSession(
      `${current.turmaId}:${current.disciplinaId}`,
      current.revisao,
    );
    setEditorBaseRevision(current.revisao);
    setIsEditorDirty(false);
    setHasRemoteConflict(false);
    setObjetivosText(current.objetivos.join('\n'));
    setCriteriosText(current.criteriosAvaliacao.join('\n'));
    setInsumosText(current.insumosRecursos.join('\n'));
    setConteudosPorDia(Object.fromEntries(
      groupPlanoCursoAulasByDay(current.aulas).map((dia) => [dia.dataAula, dia.conteudo]),
    ));
    setDiasConteudoEditados(new Set());
  }, []);

  useEffect(() => {
    if (!workspace) return;
    const identity = `${workspace.turmaId}:${workspace.disciplinaId}`;
    const reconciliation = reconcilePlanoCursoEditorSession(
      editorSessionRef.current,
      identity,
      workspace.revisao,
    );
    if (reconciliation.action === 'HYDRATE') {
      hydrateEditor(workspace);
      return;
    }
    if (reconciliation.action === 'PRESERVE') {
      // Outra sessão avançou a revisão. O rascunho local permanece intacto e
      // não pode ser salvo com a revisão nova do cache.
      editorSessionRef.current = reconciliation.session;
      setHasRemoteConflict(true);
    }
  }, [hydrateEditor, workspace]);

  const buildSaveInput = (
    current: PlanoCursoWorkspace,
    expectedRevision: number,
  ): PlanoCursoSaveInput => ({
    turmaId: current.turmaId,
    disciplinaId: current.disciplinaId,
    expectedRevision,
    objetivos: linesToItems(objetivosText),
    criteriosAvaliacao: linesToItems(criteriosText),
    insumosRecursos: linesToItems(insumosText),
    conteudosAulas: expandPlanoCursoConteudosByDay(
      current.aulas,
      conteudosPorDia,
      diasConteudoEditados,
    ),
  });

  const reconcileMutationFailure = async () => {
    const result = await workspaceQuery.refetch();
    const session = editorSessionRef.current;
    if (
      result.data &&
      session.baseRevision !== null &&
      result.data.revisao !== session.baseRevision &&
      session.dirty
    ) {
      editorSessionRef.current = { ...session, conflict: true };
      setHasRemoteConflict(true);
    }
  };

  const discardLocalChanges = () => {
    if (!isMutating && workspace) hydrateEditor(workspace);
  };

  const validateConteudosPorDia = () => {
    const oversizedDay = diasEditor.find((dia) => (
      diasConteudoEditados.has(dia.dataAula) &&
      (conteudosPorDia[dia.dataAula]?.trim().length || 0) > 8_000
    ));
    if (!oversizedDay) return true;
    toast.error(
      'Conteúdo muito extenso',
      `O conteúdo de ${oversizedDay.dataExibicao} deve ter no máximo 8.000 caracteres.`,
    );
    return false;
  };

  const handleSave = async () => {
    const baseRevision = editorSessionRef.current.baseRevision;
    if (
      !workspace ||
      !workspace.canEdit ||
      isMutating ||
      submitting.current ||
      hasRemoteConflict ||
      baseRevision === null
    ) return;
    if (!validateConteudosPorDia()) return;
    submitting.current = true;
    setPendingAction('save');
    try {
      const saved = await saveMutation.mutateAsync(buildSaveInput(workspace, baseRevision));
      hydrateEditor(saved);
      toast.success(
        'Rascunho salvo',
        'As alterações do Plano de Curso foram salvas.',
      );
    } catch {
      // O callback da mutation apresenta o erro canônico e mantém o formulário aberto.
      void reconcileMutationFailure();
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  };

  const handleConclude = async () => {
    const baseRevision = editorSessionRef.current.baseRevision;
    if (
      !workspace ||
      !workspace.canEdit ||
      isMutating ||
      submitting.current ||
      hasRemoteConflict ||
      baseRevision === null
    ) return;
    if (!validateConteudosPorDia()) return;
    submitting.current = true;
    setPendingAction('conclude');
    try {
      const saved = await saveMutation.mutateAsync(buildSaveInput(workspace, baseRevision));
      hydrateEditor(saved);
      const concluded = await concludeMutation.mutateAsync({
        planoId: saved.planoId,
        turmaId: saved.turmaId,
        disciplinaId: saved.disciplinaId,
        expectedRevision: saved.revisao,
      });
      hydrateEditor(concluded);
      toast.success(
        'Plano concluído',
        'O Plano de Curso foi concluído e está disponível para consulta.',
      );
    } catch {
      // As mutations exibem o erro canônico e mantêm o formulário aberto.
      void reconcileMutationFailure();
    } finally {
      submitting.current = false;
      setPendingAction(null);
    }
  };

  const changeText = (field: 'objetivos' | 'criterios' | 'insumos', value: string) => {
    ({ objetivos: setObjetivosText, criterios: setCriteriosText, insumos: setInsumosText })[field](
      value,
    );
    markEditorDirty();
  };
  return {
    workspace,
    workspaceQuery,
    diasEditor,
    conteudosPorDia,
    diasConteudoEditados,
    objetivosText,
    criteriosText,
    insumosText,
    editorBaseRevision,
    isEditorDirty,
    hasRemoteConflict,
    isMutating,
    pendingAction,
    changeText,
    handleDayContentChange,
    handleSave,
    handleConclude,
    discardLocalChanges,
  };
};
export type PlanoCursoEditor = ReturnType<typeof usePlanoCursoEditor>;
