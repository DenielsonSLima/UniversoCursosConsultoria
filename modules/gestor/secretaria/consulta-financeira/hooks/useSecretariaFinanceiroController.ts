import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../../parceiros/components/shared/ToastNotification';
import { secretariaDocumentosKeys } from '../../shared/secretaria-documentos.keys';
import { getSecretariaContext } from '../../shared/secretaria-documentos.service';
import type { SecretariaFinanceiraAluno } from '../secretariaFinanceira.service';
import { secretariaFinanceiraService } from '../secretariaFinanceira.service';
import type { FinanceMode } from '../secretaria-financeira.types';
import {
  buildCustomStudents,
  courseKeyFor,
  groupReceivables,
  normalizeFinanceSearch,
} from '../secretaria-financeira.utils';
import { useSecretariaFinanceRealtime } from './useSecretariaFinanceRealtime';
import { useSecretariaSettlement } from './useSecretariaSettlement';

export const useSecretariaFinanceiroController = () => {
  const activeUserId = sessionStorage.getItem('logged_user_id');
  const activePoloId = sessionStorage.getItem('current_polo_id')
    || sessionStorage.getItem('active_polo_id');
  const context = useMemo(() => getSecretariaContext(), [activePoloId, activeUserId]);
  const financeKey = useMemo(
    () => [...secretariaDocumentosKeys.context(context), 'secretaria-financeiro-v2'] as const,
    [context],
  );
  const toastState = useToast();
  const [mode, setMode] = useState<FinanceMode>('individual');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<SecretariaFinanceiraAluno | null>(null);
  const [selectedCourseKey, setSelectedCourseKey] = useState('todos');
  const [customSearch, setCustomSearch] = useState('');
  const [customAlunoIds, setCustomAlunoIds] = useState<string[]>([]);
  const normalizedTerm = searchTerm.trim();

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearchTerm(normalizedTerm),
      350,
    );
    return () => window.clearTimeout(timeoutId);
  }, [normalizedTerm]);

  const alunosQuery = useQuery({
    queryKey: [...financeKey, 'alunos', debouncedSearchTerm],
    queryFn: () => secretariaFinanceiraService.searchAlunos(
      context.poloId,
      debouncedSearchTerm,
    ),
    enabled: mode === 'individual' && debouncedSearchTerm.length >= 2,
    staleTime: 60_000,
  });

  const individualReceivablesQuery = useQuery({
    queryKey: [...financeKey, 'abertos', 'aluno', selectedAluno?.id],
    queryFn: () => secretariaFinanceiraService.getRecebiveisByAluno(
      selectedAluno!.id,
      context.poloId,
    ),
    enabled: mode === 'individual' && Boolean(selectedAluno?.id),
    staleTime: 15_000,
  });

  const allReceivablesQuery = useQuery({
    queryKey: [...financeKey, 'abertos', 'todos'],
    queryFn: () => secretariaFinanceiraService.searchRecebiveis(context.poloId, ''),
    enabled: mode !== 'individual',
    staleTime: 30_000,
  });

  const allRows = useMemo(
    () => allReceivablesQuery.data || [],
    [allReceivablesQuery.data],
  );
  const courseOptions = useMemo(() => groupReceivables(allRows), [allRows]);
  const batchRows = useMemo(
    () => (
      selectedCourseKey === 'todos'
        ? allRows
        : allRows.filter((item) => courseKeyFor(item) === selectedCourseKey)
    ),
    [allRows, selectedCourseKey],
  );
  const customStudents = useMemo(() => buildCustomStudents(allRows), [allRows]);
  const customSearchNormalized = normalizeFinanceSearch(customSearch);
  const customCandidates = useMemo(
    () => (
      customSearchNormalized.length >= 2
        ? customStudents.filter((student) => [
            student.nome,
            student.cpf,
            ...student.courses,
          ].some((value) => normalizeFinanceSearch(value).includes(customSearchNormalized)))
        : []
    ),
    [customSearchNormalized, customStudents],
  );
  const customSelectedSet = useMemo(() => new Set(customAlunoIds), [customAlunoIds]);
  const customRows = useMemo(
    () => allRows.filter((item) => item.alunoId && customSelectedSet.has(item.alunoId)),
    [allRows, customSelectedSet],
  );
  const selectedCustomStudents = useMemo(
    () => customStudents.filter((student) => customSelectedSet.has(student.id)),
    [customSelectedSet, customStudents],
  );

  useEffect(() => {
    if (selectedCourseKey === 'todos') return;
    if (!courseOptions.some((course) => course.key === selectedCourseKey)) {
      setSelectedCourseKey('todos');
    }
  }, [courseOptions, selectedCourseKey]);

  useSecretariaFinanceRealtime(context, financeKey);
  const settlement = useSecretariaSettlement({
    poloId: context.poloId,
    financeKey,
    toast: toastState.toast,
  });

  const changeMode = (nextMode: FinanceMode) => {
    setMode(nextMode);
    settlement.close();
  };

  const changeSearchTerm = (value: string) => {
    setSearchTerm(value);
    setSelectedAluno(null);
  };

  const addCustomStudent = (studentId: string) => {
    setCustomAlunoIds((current) => (
      current.includes(studentId) ? current : [...current, studentId]
    ));
    setCustomSearch('');
  };

  const removeCustomStudent = (studentId: string) => {
    setCustomAlunoIds((current) => current.filter((id) => id !== studentId));
  };

  return {
    mode,
    changeMode,
    searchTerm,
    normalizedTerm,
    changeSearchTerm,
    selectedAluno,
    setSelectedAluno,
    alunos: alunosQuery.data || [],
    alunosFetching: alunosQuery.isFetching,
    individualRows: individualReceivablesQuery.data || [],
    individualRowsLoading: individualReceivablesQuery.isLoading,
    individualRowsError: individualReceivablesQuery.error instanceof Error
      ? individualReceivablesQuery.error.message
      : null,
    selectedCourseKey,
    setSelectedCourseKey,
    courseOptions,
    batchRows,
    allRowsLoading: allReceivablesQuery.isLoading,
    allRowsError: allReceivablesQuery.error instanceof Error
      ? allReceivablesQuery.error.message
      : null,
    customSearch,
    setCustomSearch,
    customSearchNormalized,
    customCandidates,
    customSelectedSet,
    selectedCustomStudents,
    customRows,
    addCustomStudent,
    removeCustomStudent,
    clearCustomStudents: () => setCustomAlunoIds([]),
    settlement,
    toasts: toastState.toasts,
    removeToast: toastState.removeToast,
  };
};

export type SecretariaFinanceiroController = ReturnType<
  typeof useSecretariaFinanceiroController
>;
