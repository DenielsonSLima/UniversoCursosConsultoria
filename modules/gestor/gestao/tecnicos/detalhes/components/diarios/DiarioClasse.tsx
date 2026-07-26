// File: modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { diariosService } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import DiarioClasseHeader from './DiarioClasseHeader';
import DiarioClasseFooter from './DiarioClasseFooter';
import DiarioConteudoTab from './DiarioConteudoTab';
import DiarioFrequenciaTab from './DiarioFrequenciaTab';
import DiarioObservacoesTab from './DiarioObservacoesTab';
import DiarioResultadoTab from './DiarioResultadoTab';
import DiarioExportModal from './export/DiarioExportModal';
import TechnicalDataError from '../TechnicalDataError';
import {
  useDiarioAttendance,
  useDiarioAulas,
  useDiarioGrades,
  useDiarioObservacoes,
  useDiarioPraticas,
  useDiarioStudents,
  useDiarioTemplate,
  useSaveDiarioGradesMutation,
  useSaveDiarioObservacoesMutation,
  useSaveDiarioPraticaMutation,
  useToggleDiarioAttendanceMutation,
} from './hooks/useDiarioClasse';
import { useDiarioPdfDownload } from './hooks/useDiarioPdfDownload';
import { useDiarioRealtime } from './hooks/useDiarioRealtime';
import {
  DiarioClasseProps,
  DiarioActiveTab,
  DiarioGradeResult,
  GradesMap,
  AttendanceMap,
} from './diario-classe.types';
import { DiarioExportMode } from './turma-diarios.types';
import {
  buildAttendanceMap,
  buildGradesMap,
  buildPraticasMap,
  getStudentStats,
} from './diario-classe.utils';
import { useDiarioInstruments } from './hooks/useDiarioInstruments';
import {
  getAcademicReadOnlyContent,
  isAcademicContextEditable,
} from '../../academic-access.utils';

const EMPTY_DIARIO_GRADE: DiarioGradeResult = {
  p: null,
  ti: null,
  tg: null,
  s: null,
  cq: null,
  o: null,
  rec: null,
  total_aulas: 0,
  total_faltas: 0,
  frequencia_percent: null,
  media_parcial: null,
  media_final: null,
  resultado_final: 'SEM_LANCAMENTO',
};

const EMPTY_DIARIO_ROWS: never[] = [];

type EditableGradeField = 'p' | 'ti' | 'tg' | 's' | 'cq' | 'o' | 'rec';

const DiarioClasse: React.FC<DiarioClasseProps> = ({
  disciplina,
  moduloNome,
  turma,
  onBack,
  accessMode = 'GESTOR',
  initialExportMode,
  returnToListOnExportClose = false,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const effectiveAccessMode: 'GESTOR' | 'PROFESSOR' = accessMode === 'PROFESSOR'
    ? 'PROFESSOR'
    : 'GESTOR';
  const [activeTab, setActiveTab] = useState<DiarioActiveTab>('frequencia');
  const [isExportModalOpen, setIsExportModalOpen] = useState(Boolean(initialExportMode));
  const [exportMode, setExportMode] = useState<DiarioExportMode>(
    initialExportMode || 'PREENCHIDO',
  );
  const isReadOnly = !isAcademicContextEditable(turma?.status, disciplina?.periodoStatus);
  const readOnlyContent = getAcademicReadOnlyContent(turma?.status, disciplina?.periodoStatus);
  const readOnlyLabel = readOnlyContent.label;
  const readOnlyMessage = readOnlyContent.message;

  const templateQuery = useDiarioTemplate(turma.cursoId);
  const { data: diarioTemplate } = templateQuery;
  const { data: watermark } = useQuery({
    queryKey: ['polo-watermark', turma.poloId],
    queryFn: () => diariosService.getLandscapeWatermark(turma.poloId),
    enabled: Boolean(turma.poloId),
  });
  const studentsQuery = useDiarioStudents(turma.id, disciplina.id, effectiveAccessMode);
  const aulasQuery = useDiarioAulas(turma.id, disciplina.id);
  const attendanceQuery = useDiarioAttendance(turma.id, disciplina.id);
  const gradesQuery = useDiarioGrades(turma.id, disciplina.id);
  const praticasQuery = useDiarioPraticas(turma.id, disciplina.id);
  const observacoesQuery = useDiarioObservacoes(turma.id, disciplina.id);
  const students = studentsQuery.data ?? EMPTY_DIARIO_ROWS;
  const aulas = aulasQuery.data ?? EMPTY_DIARIO_ROWS;
  const dbAttendance = attendanceQuery.data ?? EMPTY_DIARIO_ROWS;
  const dbGrades = gradesQuery.data ?? EMPTY_DIARIO_ROWS;
  const dbPraticas = praticasQuery.data ?? EMPTY_DIARIO_ROWS;
  const dbObservacoes = observacoesQuery.data ?? '';
  useDiarioRealtime(turma.id, disciplina.id);
  const {
    activeInstruments,
    toggleInstrument: handleToggleInstrument,
    query: instrumentsQuery,
    saving: savingInstruments,
  } = useDiarioInstruments({
    turmaId: turma.id,
    disciplinaId: disciplina.id,
    canEdit: !isReadOnly,
    onError: (error) => {
      console.error('Erro ao salvar instrumentos avaliativos:', error);
      toast.error(
        'Instrumentos não salvos',
        error?.message || 'Não foi possível atualizar os instrumentos avaliativos.',
      );
    },
  });

  const attendanceMap = useMemo(
    () => buildAttendanceMap(students, aulas, dbAttendance),
    [students, aulas, dbAttendance],
  );
  const gradesMap = useMemo(
    () => buildGradesMap(students, aulas, dbGrades),
    [students, aulas, dbGrades],
  );
  const praticasMap = useMemo(
    () => buildPraticasMap(aulas, dbPraticas),
    [aulas, dbPraticas],
  );

  const [localAttendance, setLocalAttendance] = useState<AttendanceMap>({});
  const [localGrades, setLocalGrades] = useState<GradesMap>({});
  const [localPraticas, setLocalPraticas] = useState<Record<string, string>>({});
  const [localObservacoes, setLocalObservacoes] = useState('');

  useEffect(() => {
    setLocalAttendance({});
  }, [dbAttendance]);

  const effectiveAttendanceMap = useMemo(() => {
    if (Object.keys(localAttendance).length === 0) return attendanceMap;
    const merged: AttendanceMap = { ...attendanceMap };
    Object.entries(localAttendance).forEach(([studentId, classMap]) => {
      merged[studentId] = { ...(merged[studentId] || {}), ...(classMap as Record<string, 'P' | 'F' | null>) };
    });
    return merged;
  }, [attendanceMap, localAttendance]);

  useEffect(() => {
    if (Object.keys(gradesMap).length > 0) setLocalGrades({ ...gradesMap });
  }, [gradesMap]);

  useEffect(() => {
    setLocalPraticas(praticasMap);
  }, [praticasMap]);

  useEffect(() => {
    if (dbObservacoes !== undefined) setLocalObservacoes(dbObservacoes);
  }, [dbObservacoes]);

  const toggleAttendanceMutation = useToggleDiarioAttendanceMutation(
    turma.id,
    disciplina.id,
    (input) => {
      const aluno = students.find((s) => s.id === input.alunoId);
      const aula = aulas.find((a) => a.id === input.aulaId);
      const alunoNome = aluno?.nome || 'Aluno';
      const aulaLabel = aula?.dataLabel ? ` (${aula.dataLabel})` : '';

      if (input.nextStatus === 'P') {
        toast.success('Presença registrada', `Presença de ${alunoNome}${aulaLabel} salva.`);
      } else if (input.nextStatus === 'F') {
        toast.info('Falta registrada', `Falta de ${alunoNome}${aulaLabel} lançada.`);
      }
    },
    (error) => {
      console.error('Erro ao alternar frequência:', error);
      toast.error('Frequência não salva', error?.message || 'Não consegui atualizar a presença/falta deste aluno. Tente novamente.');
    },
  );
  const saveStudentGradesMutation = useSaveDiarioGradesMutation(
    turma.id,
    disciplina.id,
    (input) => {
      const aluno = students.find((s) => s.id === input.alunoId);
      toast.success('Notas salvas', `Notas de ${aluno?.nome || 'aluno'} atualizadas com sucesso.`);
    },
    (error) => {
      console.error('Erro ao salvar notas:', error);
      toast.error('Notas não salvas', error?.message || 'Não foi possível atualizar as notas.');
    },
  );
  const savePraticaMutation = useSaveDiarioPraticaMutation(
    turma.id,
    disciplina.id,
    () => {
      toast.success('Conteúdo salvo', 'Conteúdo da aula atualizado com sucesso.');
    },
    (error) => {
      console.error('Erro ao salvar conteúdo:', error);
      toast.error('Conteúdo não salvo', error?.message || 'Não foi possível atualizar o conteúdo.');
    },
  );
  const saveObservacoesMutation = useSaveDiarioObservacoesMutation(
    turma.id,
    disciplina.id,
    () => {
      toast.success('Observações salvas', 'Observações do diário salvas com sucesso.');
    },
    (error) => {
      console.error('Erro ao salvar observações:', error);
      toast.error('Observações não salvas', error?.message || 'Não foi possível salvar as observações.');
    },
  );

  const handleToggleAttendance = (studentId: string, classId: string) => {
    if (isReadOnly) return;
    if (getStudentStats(gradesMap, studentId).resultado === 'APROVEITADO') {
      toast.info(
        'Disciplina aproveitada',
        'Notas e frequência são preservadas pela equivalência registrada na transferência.',
      );
      return;
    }
    const current = effectiveAttendanceMap[studentId]?.[classId] || null;
    const nextStatus = current === null ? 'P' : current === 'P' ? 'F' : 'P';

    // Atualização otimista instantânea na UI (< 1ms)
    setLocalAttendance((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || effectiveAttendanceMap[studentId] || {}),
        [classId]: nextStatus,
      },
    }));

    toggleAttendanceMutation.mutate(
      { aulaId: classId, alunoId: studentId, nextStatus },
      {
        onError: () => {
          // Reverte o estado local em caso de erro no servidor
          setLocalAttendance((prev) => {
            const copy = { ...prev };
            if (copy[studentId]) {
              const studentCopy = { ...copy[studentId] };
              delete studentCopy[classId];
              copy[studentId] = studentCopy;
            }
            return copy;
          });
        },
      },
    );
  };

  const handleLocalGradeChange = (studentId: string, field: EditableGradeField, value: string) => {
    if (isReadOnly) return;
    setLocalGrades((previous) => {
      const studentFields = previous[studentId] || gradesMap[studentId] || EMPTY_DIARIO_GRADE;
      const parsedValue = value.trim() === '' ? null : Number(value.replace(',', '.'));
      const numeric = parsedValue === null || !Number.isFinite(parsedValue)
        ? null
        : Math.min(10, Math.max(0, parsedValue));
      return { ...previous, [studentId]: { ...studentFields, [field]: numeric } };
    });
  };

  const handleSaveGrade = (studentId: string, field: EditableGradeField) => {
    if (isReadOnly) return;
    const fields = localGrades[studentId] || gradesMap[studentId] || EMPTY_DIARIO_GRADE;
    saveStudentGradesMutation.mutate({
      alunoId: studentId,
      fields: { [field]: fields[field] },
    });
  };

  const printProps = useMemo(() => ({
    template: diarioTemplate!,
    turma,
    disciplina,
    moduloNome,
    students,
    aulas,
    attendanceMap,
    gradesMap,
    praticasMap,
    observacoes: dbObservacoes,
    activeInstruments,
    watermark,
    exportMode,
  }), [
    activeInstruments,
    attendanceMap,
    aulas,
    dbObservacoes,
    diarioTemplate,
    disciplina,
    exportMode,
    gradesMap,
    moduloNome,
    praticasMap,
    students,
    turma,
    watermark,
  ]);

  const { downloadingPdf, printingPdf, downloadPdf, printPdf } = useDiarioPdfDownload({
    printProps,
    toast,
  });
  const hasPendingWrites = toggleAttendanceMutation.isPending
    || saveStudentGradesMutation.isPending
    || savePraticaMutation.isPending
    || saveObservacoesMutation.isPending
    || savingInstruments;

  const openExportModal = (mode: DiarioExportMode) => {
    if (hasPendingWrites) {
      toast.info('Aguarde o salvamento', 'O PDF será liberado assim que os registros forem confirmados.');
      return;
    }
    setExportMode(mode);
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
    if (returnToListOnExportClose) onBack();
  };

  const completeDiaryQueries = [
    templateQuery,
    studentsQuery,
    aulasQuery,
    attendanceQuery,
    gradesQuery,
    praticasQuery,
    observacoesQuery,
    instrumentsQuery,
  ];
  const blankExportQueries = [
    templateQuery,
    studentsQuery,
    aulasQuery,
    instrumentsQuery,
  ];
  const coreQueries = initialExportMode === 'EM_BRANCO'
    ? blankExportQueries
    : completeDiaryQueries;
  const loading = coreQueries.some((query) => query.isLoading);
  const loadingError = coreQueries.some((query) => query.isError);
  const retrying = coreQueries.some((query) => query.isFetching);
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando detalhes do diário...</span>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="mx-auto max-w-[1400px] py-8">
        <TechnicalDataError
          title="Diário não carregado"
          message="Frequência, notas e conteúdo não foram exibidos para evitar que dados incompletos sejam salvos sobre os registros existentes."
          retrying={retrying}
          onRetry={() => { void Promise.all(coreQueries.map((query) => query.refetch())); }}
        />
      </div>
    );
  }

  return (
    <div className=" max-w-[1400px] mx-auto">
      <DiarioClasseHeader
        disciplina={disciplina}
        moduloNome={moduloNome}
        turma={turma}
        onBack={onBack}
        onOpenExportModal={() => openExportModal('PREENCHIDO')}
        exportDisabled={hasPendingWrites}
        isReadOnly={isReadOnly}
        readOnlyLabel={readOnlyLabel}
        readOnlyMessage={readOnlyMessage}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] mb-8">
        <div className="flex-1">
          {activeTab === 'frequencia' && (
            <DiarioFrequenciaTab
              students={students}
              aulas={aulas}
              attendanceMap={effectiveAttendanceMap}
              isReadOnly={isReadOnly}
              onToggleAttendance={handleToggleAttendance}
              getStats={(studentId) => getStudentStats(gradesMap, studentId)}
            />
          )}
          {activeTab === 'resultado' && (
            <DiarioResultadoTab
              students={students}
              localGrades={localGrades}
              isReadOnly={isReadOnly}
              activeInstruments={activeInstruments}
              onToggleInstrument={handleToggleInstrument}
              getStats={(studentId) => getStudentStats(gradesMap, studentId)}
              onGradeChange={handleLocalGradeChange}
              onSaveGrade={handleSaveGrade}
            />
          )}
          {activeTab === 'conteudo' && (
            <DiarioConteudoTab
              aulas={aulas}
              localPraticas={localPraticas}
              setLocalPraticas={setLocalPraticas}
              isReadOnly={isReadOnly}
              onSavePratica={(aulaId, text) => savePraticaMutation.mutate({ aulaId, text })}
            />
          )}
          {activeTab === 'observacoes' && (
            <DiarioObservacoesTab
              observacoes={localObservacoes}
              isReadOnly={isReadOnly}
              onChange={setLocalObservacoes}
              onSave={(text) => saveObservacoesMutation.mutate(text)}
            />
          )}
        </div>
        <DiarioClasseFooter disciplina={disciplina} />
      </div>

      {diarioTemplate && (
        <>
          <DiarioExportModal
            isOpen={isExportModalOpen}
            onClose={closeExportModal}
            onDownloadPdf={downloadPdf}
            onPrintPdf={printPdf}
            downloadingPdf={downloadingPdf}
            printingPdf={printingPdf}
            printProps={printProps}
            exportMode={exportMode}
          />
        </>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default DiarioClasse;
