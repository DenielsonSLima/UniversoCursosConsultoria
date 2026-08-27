import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '../../../parceiros/components/shared/ToastNotification';
import { carnesAlunosService } from '../carnes-alunos.service';
import {
  addDocumentGroupsAtomically,
  assertDocumentGenerationLimits,
  countDocumentRequests,
  DOCUMENT_GROUPS_PAGE_SIZE,
  removeDocumentGroups,
  resetsSelectionWhenCriteriaChange,
  toggleDocumentGroup,
} from '../carnes-alunos.selection';
import type {
  BaneseDocumentGroup,
  CarnesAlunosMode,
  PreparedBaneseDocument,
} from '../carnes-alunos.types';

const normalizedOptional = (value: string) => value.trim() || undefined;
const createAbortController = () => new globalThis.AbortController();

interface DocumentGenerationInput {
  groups: BaneseDocumentGroup[];
  requestId: number;
  signal: AbortSignal;
}

const isAbortFailure = (failure: unknown, signal: AbortSignal) => (
  signal.aborted || (failure instanceof Error && failure.name === 'AbortError')
);

export const useCarnesAlunosController = (poloId?: string | null) => {
  const toastState = useToast();
  const [mode, setMode] = useState<CarnesAlunosMode>('individual');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseId, setCourseId] = useState('');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedGroups, setSelectedGroups] = useState<BaneseDocumentGroup[]>([]);
  const [preparedDocument, setPreparedDocument] = useState<PreparedBaneseDocument | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const generationAbortRef = useRef<ReturnType<typeof createAbortController> | null>(null);
  const generationIdRef = useRef(0);

  const cancelActiveGeneration = useCallback(() => {
    generationIdRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [mode, debouncedSearch, courseId, classId]);

  useEffect(() => {
    cancelActiveGeneration();
    setSearch('');
    setDebouncedSearch('');
    setCourseId('');
    setClassId('');
    setPage(1);
    setSelectedGroups([]);
    setPreparedDocument(null);
    setProgress({ current: 0, total: 0 });
    return cancelActiveGeneration;
  }, [cancelActiveGeneration, poloId]);

  const requiresSearch = mode !== 'batch';
  const canQuery = Boolean(
    poloId && (!requiresSearch || debouncedSearch.length >= 2),
  );
  const groupsQuery = useQuery({
    queryKey: [
      'secretaria-banese-document-groups',
      poloId,
      mode,
      debouncedSearch,
      mode === 'batch' ? courseId : '',
      mode === 'batch' ? classId : '',
      page,
    ],
    queryFn: ({ signal }) => carnesAlunosService.listGroups({
      poloId: poloId!,
      search: normalizedOptional(debouncedSearch),
      courseId: mode === 'batch' ? normalizedOptional(courseId) : undefined,
      classId: mode === 'batch' ? normalizedOptional(classId) : undefined,
      page,
      pageSize: DOCUMENT_GROUPS_PAGE_SIZE,
    }, signal),
    enabled: canQuery,
    staleTime: 30_000,
  });

  const visibleGroups = groupsQuery.data?.groups || [];
  const courseOptions = useMemo(() => {
    const options = new Map<string, string>(
      (groupsQuery.data?.filters.courses || []).map((option) => [option.id, option.name] as const),
    );
    selectedGroups.forEach((group) => options.set(group.courseId, group.courseName));
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [groupsQuery.data?.filters.courses, selectedGroups]);
  const classOptions = useMemo(() => {
    const options = new Map<string, string>();
    (groupsQuery.data?.filters.classes || [])
      .filter((option) => !courseId || option.courseId === courseId)
      .forEach((option) => options.set(option.id, option.name));
    selectedGroups
      .filter((group) => !courseId || group.courseId === courseId)
      .forEach((group) => options.set(group.classId, group.className));
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
  }, [courseId, groupsQuery.data?.filters.classes, selectedGroups]);
  const selectedIds = useMemo(
    () => new Set(selectedGroups.map((group) => group.id)),
    [selectedGroups],
  );
  const requestCounts = useMemo(
    () => countDocumentRequests(selectedGroups),
    [selectedGroups],
  );
  const totalPages = Math.max(
    1,
    Math.ceil((groupsQuery.data?.total || 0) / (groupsQuery.data?.pageSize || DOCUMENT_GROUPS_PAGE_SIZE)),
  );

  const generation = useMutation({
    mutationFn: ({ groups, requestId, signal }: DocumentGenerationInput) => (
      carnesAlunosService.prepareDocument(
        groups,
        (nextProgress) => {
          if (requestId === generationIdRef.current && !signal.aborted) {
            setProgress(nextProgress);
          }
        },
        signal,
      )
    ),
    onSuccess: (document, { requestId, signal }) => {
      if (requestId !== generationIdRef.current || signal.aborted) return;
      setPreparedDocument(document);
      toastState.toast.success(
        'Documento preparado',
        'A prévia, o download e a impressão usarão exatamente o mesmo PDF Banese.',
      );
    },
    onError: (failure, { requestId, signal }) => {
      if (requestId !== generationIdRef.current || isAbortFailure(failure, signal)) return;
      toastState.toast.error(
        'Não foi possível preparar o documento',
        failure instanceof Error ? failure.message : 'Tente novamente em instantes.',
      );
    },
    onSettled: (_document, _failure, { requestId, signal }) => {
      if (requestId !== generationIdRef.current) return;
      if (generationAbortRef.current?.signal === signal) generationAbortRef.current = null;
      setProgress({ current: 0, total: 0 });
    },
  });

  const changeMode = (nextMode: CarnesAlunosMode) => {
    if (nextMode === mode) return;
    cancelActiveGeneration();
    setMode(nextMode);
    setSearch('');
    setDebouncedSearch('');
    setCourseId('');
    setClassId('');
    setSelectedGroups([]);
    setPreparedDocument(null);
    setProgress({ current: 0, total: 0 });
  };

  const clearPreparedSelection = () => {
    setSelectedGroups([]);
    setPreparedDocument(null);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    if (resetsSelectionWhenCriteriaChange(mode)) clearPreparedSelection();
  };

  const changeCourse = (nextCourseId: string) => {
    setCourseId(nextCourseId);
    setClassId('');
    clearPreparedSelection();
  };

  const changeClass = (nextClassId: string) => {
    setClassId(nextClassId);
    clearPreparedSelection();
  };

  const toggleGroup = (group: BaneseDocumentGroup) => {
    const single = mode === 'individual';
    const next = toggleDocumentGroup(selectedGroups, group, single);
    if (next.length < selectedGroups.length || single) {
      setSelectedGroups(next);
      setPreparedDocument(null);
      return;
    }
    try {
      assertDocumentGenerationLimits(next);
      setSelectedGroups(next);
      setPreparedDocument(null);
    } catch (failure) {
      toastState.toast.info(
        'Limite desta geração atingido',
        failure instanceof Error ? failure.message : 'Divida a seleção em lotes menores.',
      );
    }
  };

  const selectVisibleGroups = () => {
    try {
      const next = addDocumentGroupsAtomically(selectedGroups, visibleGroups);
      setSelectedGroups(next);
      setPreparedDocument(null);
    } catch (failure) {
      toastState.toast.info(
        'Esta página ultrapassa o limite',
        failure instanceof Error ? failure.message : 'Divida o resultado filtrado em lotes menores.',
      );
    }
  };

  const removeVisibleGroupsFromSelection = () => {
    setSelectedGroups(removeDocumentGroups(selectedGroups, visibleGroups));
    setPreparedDocument(null);
  };

  const prepareSelectedDocument = async () => {
    try {
      assertDocumentGenerationLimits(selectedGroups);
    } catch (failure) {
      toastState.toast.info(
        'Revise a seleção',
        failure instanceof Error ? failure.message : 'Divida a seleção em lotes menores.',
      );
      return;
    }
    cancelActiveGeneration();
    const controller = createAbortController();
    generationAbortRef.current = controller;
    const requestId = generationIdRef.current;
    try {
      await generation.mutateAsync({
        groups: [...selectedGroups],
        requestId,
        signal: controller.signal,
      });
    } catch {
      // Abortos são silenciosos; demais falhas são apresentadas por onError.
    }
  };

  return {
    mode,
    changeMode,
    search,
    changeSearch,
    debouncedSearch,
    courseId,
    changeCourse,
    classId,
    changeClass,
    courseOptions,
    classOptions,
    page,
    setPage,
    totalPages,
    totalGroups: groupsQuery.data?.total || 0,
    visibleGroups,
    hasPolo: Boolean(poloId),
    canQuery,
    requiresSearch,
    loading: groupsQuery.isLoading || groupsQuery.isFetching,
    error: groupsQuery.error instanceof Error ? groupsQuery.error.message : null,
    retry: groupsQuery.refetch,
    selectedGroups,
    selectedIds,
    allVisibleSelected: visibleGroups.length > 0
      && visibleGroups.every((group) => selectedIds.has(group.id)),
    someVisibleSelected: visibleGroups.some((group) => selectedIds.has(group.id)),
    requestCounts,
    toggleGroup,
    selectVisibleGroups,
    removeVisibleGroupsFromSelection,
    clearSelection: clearPreparedSelection,
    prepareSelectedDocument,
    generating: generation.isPending,
    progress,
    preparedDocument,
    closePreview: () => setPreparedDocument(null),
    toasts: toastState.toasts,
    removeToast: toastState.removeToast,
  };
};

export type CarnesAlunosController = ReturnType<typeof useCarnesAlunosController>;
