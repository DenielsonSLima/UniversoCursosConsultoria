// File: modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { diariosService } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { assinaturasService } from '../../../../../configuracoes/assinaturas/assinaturas.service';
import DiarioClasseHeader from './DiarioClasseHeader';
import DiarioConteudoTab from './DiarioConteudoTab';
import DiarioFrequenciaTab from './DiarioFrequenciaTab';
import DiarioObservacoesTab from './DiarioObservacoesTab';
import DiarioPrintDocument from './DiarioPrintDocument';
import DiarioResultadoTab from './DiarioResultadoTab';
import TechnicalDataError from '../TechnicalDataError';
import {
  useAddDiarioAulaMutation,
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
import { DiarioClasseProps, DiarioActiveTab, GradesMap } from './diario-classe.types';
import {
  buildAttendanceMap,
  buildGradesMap,
  buildPraticasMap,
  getStudentStats,
} from './diario-classe.utils';
import {
  getAcademicReadOnlyContent,
  isAcademicContextEditable,
} from '../../academic-access.utils';

const DiarioClasse: React.FC<DiarioClasseProps> = ({
  disciplina,
  moduloNome,
  turma,
  onBack,
  accessMode = 'GESTOR',
}) => {
  const { toasts, removeToast, toast } = useToast();
  const effectiveAccessMode: 'GESTOR' | 'PROFESSOR' = accessMode === 'PROFESSOR'
    ? 'PROFESSOR'
    : 'GESTOR';
  const [activeTab, setActiveTab] = useState<DiarioActiveTab>('frequencia');
  const printDocumentRef = useRef<HTMLDivElement>(null);
  const isReadOnly = !isAcademicContextEditable(turma?.status, disciplina?.periodoStatus);
  const readOnlyContent = getAcademicReadOnlyContent(turma?.status, disciplina?.periodoStatus);
  const readOnlyLabel = readOnlyContent.label;
  const readOnlyMessage = readOnlyContent.message;

  const { data: diarioTemplate } = useDiarioTemplate(turma.cursoId);
  const { data: watermark } = useQuery({
    queryKey: ['polo-watermark', turma.poloId],
    queryFn: () => diariosService.getLandscapeWatermark(turma.poloId),
    enabled: Boolean(turma.poloId),
  });
  const { data: centralSignatures } = useQuery({
    queryKey: ['central-signatures'],
    queryFn: () => assinaturasService.getSignatures(),
  });
  const studentsQuery = useDiarioStudents(turma.id, disciplina.id, effectiveAccessMode);
  const aulasQuery = useDiarioAulas(turma.id, disciplina.id);
  const attendanceQuery = useDiarioAttendance(turma.id, disciplina.id);
  const gradesQuery = useDiarioGrades(turma.id, disciplina.id);
  const praticasQuery = useDiarioPraticas(turma.id, disciplina.id);
  const observacoesQuery = useDiarioObservacoes(turma.id, disciplina.id);
  const students = studentsQuery.data || [];
  const aulas = aulasQuery.data || [];
  const dbAttendance = attendanceQuery.data || [];
  const dbGrades = gradesQuery.data || [];
  const dbPraticas = praticasQuery.data || [];
  const dbObservacoes = observacoesQuery.data ?? '';
  useDiarioRealtime(turma.id, disciplina.id);

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

  const [localGrades, setLocalGrades] = useState<GradesMap>({});
  const [localPraticas, setLocalPraticas] = useState<Record<string, string>>({});
  const [localObservacoes, setLocalObservacoes] = useState('');
  const [novaAulaTitulo, setNovaAulaTitulo] = useState('');
  const [novaAulaData, setNovaAulaData] = useState('');
  const [novaAulaCarga, setNovaAulaCarga] = useState('');

  useEffect(() => {
    if (Object.keys(gradesMap).length > 0) setLocalGrades({ ...gradesMap });
  }, [gradesMap]);

  useEffect(() => {
    setLocalPraticas(praticasMap);
  }, [praticasMap]);

  useEffect(() => {
    if (dbObservacoes !== undefined) setLocalObservacoes(dbObservacoes);
  }, [dbObservacoes]);

  const toggleAttendanceMutation = useToggleDiarioAttendanceMutation(turma.id, disciplina.id);
  const addAulaMutation = useAddDiarioAulaMutation(
    turma.id,
    disciplina.id,
    (input) => {
      setNovaAulaTitulo('');
      setNovaAulaData('');
      setNovaAulaCarga('');
      toast.success('Aula salva', `${input.titulo} foi registrada no diário e na agenda.`);
    },
    (error) => {
      console.error('Erro ao salvar aula no diário:', error);
      toast.error('Aula não salva', error?.message || 'Não foi possível registrar a aula.');
    },
  );
  const saveStudentGradesMutation = useSaveDiarioGradesMutation(turma.id, disciplina.id);
  const savePraticaMutation = useSaveDiarioPraticaMutation(turma.id, disciplina.id);
  const saveObservacoesMutation = useSaveDiarioObservacoesMutation(turma.id, disciplina.id);

  const handleToggleAttendance = (studentId: string, classId: string) => {
    if (isReadOnly) return;
    const current = attendanceMap[studentId]?.[classId] || null;
    const nextStatus = current === null ? 'P' : current === 'P' ? 'F' : 'P';
    toggleAttendanceMutation.mutate({ aulaId: classId, alunoId: studentId, nextStatus });
  };

  const handleAddAula = () => {
    if (isReadOnly) return;
    const titulo = novaAulaTitulo.trim();
    const dataAula = novaAulaData.trim();
    const cargaHoraria = Number(novaAulaCarga.replace(',', '.'));

    if (!titulo || !dataAula || !novaAulaCarga.trim()) {
      toast.info('Complete os dados', 'Informe descrição, data da aula e carga horária antes de salvar.');
      return;
    }
    if (!Number.isFinite(cargaHoraria) || cargaHoraria <= 0) {
      toast.info('Carga horária inválida', 'Use uma carga horária maior que zero.');
      return;
    }
    addAulaMutation.mutate({ titulo, dataAula, cargaHoraria });
  };

  const handleLocalGradeChange = (studentId: string, field: string, value: string) => {
    if (isReadOnly) return;
    setLocalGrades((previous) => {
      const studentFields = previous[studentId] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
      let numeric: number | null = parseFloat(value);
      if (isNaN(numeric)) numeric = field === 'rec' ? null : 0;
      else numeric = Math.min(10, Math.max(0, numeric));
      return { ...previous, [studentId]: { ...studentFields, [field]: numeric } };
    });
  };

  const handleSaveGrade = (studentId: string) => {
    if (isReadOnly) return;
    const fields = localGrades[studentId] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
    saveStudentGradesMutation.mutate({
      alunoId: studentId,
      fields: {
        ...fields,
        p: fields.p ?? 0,
        ti: fields.ti ?? 0,
        tg: fields.tg ?? 0,
        s: fields.s ?? 0,
        cq: fields.cq ?? 0,
        o: fields.o ?? 0,
      },
    });
  };

  const { downloadingPdf, downloadPdf } = useDiarioPdfDownload({
    containerRef: printDocumentRef,
    diarioTemplate,
    turma,
    disciplina,
    toast,
  });

  const coreQueries = [
    studentsQuery,
    aulasQuery,
    attendanceQuery,
    gradesQuery,
    praticasQuery,
    observacoesQuery,
  ];
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
        onDownloadPdf={downloadPdf}
        downloadingPdf={downloadingPdf}
        isReadOnly={isReadOnly}
        readOnlyLabel={readOnlyLabel}
        readOnlyMessage={readOnlyMessage}
        novaAulaTitulo={novaAulaTitulo}
        novaAulaData={novaAulaData}
        novaAulaCarga={novaAulaCarga}
        setNovaAulaTitulo={setNovaAulaTitulo}
        setNovaAulaData={setNovaAulaData}
        setNovaAulaCarga={setNovaAulaCarga}
        onAddAula={handleAddAula}
        addingAula={addAulaMutation.isPending}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] mb-8">
        <div className="flex-1">
          {activeTab === 'frequencia' && (
            <DiarioFrequenciaTab
              students={students}
              aulas={aulas}
              attendanceMap={attendanceMap}
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
        <div className="diario-print-host fixed left-[-20000px] top-0 z-[-1]">
          <DiarioPrintDocument
            ref={printDocumentRef}
            template={diarioTemplate}
            turma={turma}
            disciplina={disciplina}
            moduloNome={moduloNome}
            students={students}
            aulas={aulas}
            attendanceMap={attendanceMap}
            gradesMap={gradesMap}
            praticasMap={praticasMap}
            observacoes={localObservacoes}
            watermark={watermark}
            diretorSigUrl={diarioTemplate.diretorAssinaturaRole ? centralSignatures?.[diarioTemplate.diretorAssinaturaRole] : null}
            secretarioSigUrl={diarioTemplate.secretarioAssinaturaRole ? centralSignatures?.[diarioTemplate.secretarioAssinaturaRole] : null}
          />
        </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

const DiarioClasseFooter: React.FC<{ disciplina: any }> = ({ disciplina }) => (
  <div className="bg-slate-50 p-6 md:px-8 border-t border-slate-200 mt-auto">
    <div className="flex flex-col xl:flex-row justify-between items-center gap-8 text-xs font-bold text-slate-500 uppercase tracking-widest">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
        <div>Carga Horária Total: <span className="text-slate-700">{disciplina.cargaHoraria}H</span></div>
        <div>Horas Lançadas: <span className="text-slate-700">{disciplina.horasRealizadas}H</span></div>
        <div>Encerrado em: <span className="text-slate-700 border-b border-dashed border-slate-400 px-8 text-transparent">____/____/_____</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-12 mt-4 xl:mt-0">
        <div className="text-center">
          <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
          <p>Assinatura Professor(a)</p>
        </div>
        <div className="text-center">
          <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
          <p>Assinatura Coordenador(a)</p>
        </div>
      </div>
    </div>
  </div>
);

export default DiarioClasse;
