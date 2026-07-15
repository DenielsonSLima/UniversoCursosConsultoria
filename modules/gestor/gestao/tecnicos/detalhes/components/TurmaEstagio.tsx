import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import { getMaceioIsoDate } from '../../technicalClassDates';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import {
  useAvaliacaoEstagioCalculada,
  useSaveEstagioEvaluationMutation,
  useTurmaEstagioAvaliacoes,
  useTurmaEstagioData,
} from '../hooks/useTurmaEstagio';
import { turmaEstagioService } from '../turma-estagio.service';
import {
  EstagioAluno,
  EstagioCriteriosValores,
  EstagioProcedimentosLog,
  ProcedimentoStatus,
} from '../turma-estagio.types';
import EstagioEvaluationPanel from './estagio/EstagioEvaluationPanel';
import EstagioPrintSheet from './estagio/EstagioPrintSheet';
import EstagioStudentsPanel from './estagio/EstagioStudentsPanel';
import TechnicalDataError from './TechnicalDataError';
import {
  getAcademicReadOnlyContent,
  isAcademicContextEditable,
} from '../academic-access.utils';

interface TurmaEstagioProps {
  turma: Turma;
  disciplinaIdRestrita?: string;
  disciplinaRestrita?: any;
  modo?: 'GESTOR' | 'PROFESSOR';
  readOnly?: boolean;
  readOnlyMessage?: string;
}

const TurmaEstagio: React.FC<TurmaEstagioProps> = ({
  turma,
  disciplinaIdRestrita,
  disciplinaRestrita,
  modo = 'GESTOR',
  readOnly = false,
  readOnlyMessage,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const effectiveModo: 'GESTOR' | 'PROFESSOR' = modo === 'PROFESSOR'
    ? 'PROFESSOR'
    : 'GESTOR';
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [selectedDiscId, setSelectedDiscId] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<EstagioAluno | null>(null);
  const [instrumentosConfig, setInstrumentosConfig] = useState<any[]>([]);
  const [checklistUcsConfig, setChecklistUcsConfig] = useState<any[]>([]);
  const [criteriosValores, setCriteriosValores] = useState<EstagioCriteriosValores>({});
  const [procedimentosLog, setProcedimentosLog] = useState<EstagioProcedimentosLog>({});
  const [perfilAluno, setPerfilAluno] = useState('');
  const [instrutorNome, setInstrutorNome] = useState('');
  const [dataAvaliacao, setDataAvaliacao] = useState(getMaceioIsoDate());
  const [frequenciaEstagio, setFrequenciaEstagio] = useState(100);

  const estagioQuery = useTurmaEstagioData(turma.id, turma.cursoId, effectiveModo, disciplinaRestrita);
  const estagioData = estagioQuery.data;
  const disciplinasEstagio = estagioData?.disciplinasEstagio || [];
  const disciplinasDisponiveis = disciplinaIdRestrita
    ? disciplinasEstagio.filter((disciplina: any) => disciplina.id === disciplinaIdRestrita)
    : disciplinasEstagio;
  const alunos = estagioData?.alunos || [];
  const avaliacoesQuery = useTurmaEstagioAvaliacoes(turma.id, selectedDiscId);
  const avaliacoesExistentes = avaliacoesQuery.data || {};
  const vacinasQuery = useQuery({
    queryKey: ['turma-estagio-vacinas-resumo', turma.id, turma.cursoId],
    queryFn: () => turmaEstagioService.getVacinasResumo(turma.id, turma.cursoId),
    enabled: effectiveModo === 'GESTOR' && Boolean(turma.id && turma.cursoId),
  });
  const vacinasResumo = effectiveModo === 'PROFESSOR'
    ? estagioData?.vacinasResumo
    : vacinasQuery.data;
  const avaliacaoQuery = useAvaliacaoEstagioCalculada(
    criteriosValores,
    Boolean(selectedAluno) && !loadingConfig,
  );
  const avaliacaoCalculada = avaliacaoQuery.data;
  const saveEvaluationMutation = useSaveEstagioEvaluationMutation(turma.id, selectedDiscId);
  const currentDisc = disciplinasDisponiveis.find((disciplina: any) => disciplina.id === selectedDiscId);
  const invalidProfessorContext = effectiveModo === 'PROFESSOR' && (
    !turma.id
    || !turma.cursoId
    || !disciplinaRestrita?.id
    || Number(disciplinaRestrita?.cargaHorariaEstagio || 0) <= 0
  );
  const waitingForSelection = disciplinasDisponiveis.length > 0 && !selectedDiscId;
  const loadingCriticalData = estagioQuery.isLoading
    || (effectiveModo === 'GESTOR' && vacinasQuery.isLoading)
    || waitingForSelection
    || (Boolean(selectedDiscId) && avaliacoesQuery.isLoading);
  const criticalDataError = estagioQuery.isError
    || invalidProfessorContext
    || (effectiveModo === 'GESTOR' && vacinasQuery.isError)
    || (Boolean(selectedDiscId) && avaliacoesQuery.isError)
    || (Boolean(selectedAluno) && avaliacaoQuery.isError);
  const retryingCriticalData = estagioQuery.isFetching
    || (effectiveModo === 'GESTOR' && vacinasQuery.isFetching)
    || avaliacoesQuery.isFetching
    || avaliacaoQuery.isFetching;
  const evaluationDataUnavailable = loadingCriticalData
    || criticalDataError
    || avaliacoesQuery.data === undefined
    || vacinasResumo === undefined;
  const academicContextEditable = isAcademicContextEditable(turma.status, currentDisc?.periodoStatus);
  const academicReadOnlyContent = getAcademicReadOnlyContent(turma.status, currentDisc?.periodoStatus);
  const effectiveReadOnly = readOnly || !academicContextEditable;
  const effectiveReadOnlyMessage = readOnlyMessage || academicReadOnlyContent.message;

  useEffect(() => {
    const firstAvailableId = disciplinasDisponiveis[0]?.id || '';
    if (!disciplinasDisponiveis.some((disciplina: any) => disciplina.id === selectedDiscId)) {
      setSelectedDiscId(firstAvailableId);
      setSelectedAluno(null);
    }
  }, [disciplinasDisponiveis, selectedDiscId]);

  const startEvaluation = async (aluno: EstagioAluno) => {
    if (evaluationDataUnavailable) {
      toast.error(
        'Dados do estágio indisponíveis',
        'Recarregue avaliações e vacinas antes de abrir uma ficha.',
      );
      return;
    }

    const existingEvaluation = avaliacoesExistentes[aluno.id];
    if (effectiveReadOnly && !existingEvaluation) {
      toast.error('Ciclo encerrado', effectiveReadOnlyMessage);
      return;
    }

    const vacinaStatus = vacinasResumo?.porAluno?.[aluno.id];
    if (!effectiveReadOnly && vacinasResumo?.exige && !vacinaStatus?.liberado) {
      toast.error(
        'Vacinas pendentes',
        effectiveModo === 'PROFESSOR'
          ? `${aluno.nome} possui pendências vacinais e ainda não está liberado para o estágio.`
          : `${aluno.nome} ainda tem ${vacinaStatus?.pendentes?.length || vacinasResumo.totalDoses} dose(s) obrigatória(s) sem aprovação.`,
      );
      return;
    }

    setSelectedAluno(aluno);
    setLoadingConfig(true);
    try {
      const draft = await turmaEstagioService.buildEvaluationDraft(
        turma.cursoId,
        existingEvaluation,
      );
      setInstrumentosConfig(draft.instrumentosConfig);
      setChecklistUcsConfig(draft.checklistUcsConfig);
      setPerfilAluno(draft.perfilAluno);
      setInstrutorNome(draft.instrutorNome);
      setDataAvaliacao(draft.dataAvaliacao);
      setFrequenciaEstagio(draft.frequenciaEstagio);
      setCriteriosValores(draft.criteriosValores);
      setProcedimentosLog(draft.procedimentosLog);
    } catch (error) {
      console.error(error);
      toast.error('Erro', 'Erro ao carregar a ficha de estágio do aluno.');
      setSelectedAluno(null);
    } finally {
      setLoadingConfig(false);
    }
  };

  const getSubtotal = (grupoNome: string) => {
    if (grupoNome === 'Comportamento') return Number(avaliacaoCalculada?.comportamento || 0);
    if (grupoNome === 'Desempenho nos Registros') return Number(avaliacaoCalculada?.registros || 0);
    if (grupoNome === 'Desempenho das Técnicas') return Number(avaliacaoCalculada?.tecnicas || 0);
    return 0;
  };

  const handleCriterioObsChange = (grupoNome: string, itemNome: string, observacao: string) => {
    setCriteriosValores((current) => {
      const group = current[grupoNome] || {};
      return {
        ...current,
        [grupoNome]: {
          ...group,
          [itemNome]: { ...(group[itemNome] || { nota: 0 }), obs: observacao },
        },
      };
    });
  };

  const handleCriterioNotaChange = (grupoNome: string, itemNome: string, nota: number) => {
    setCriteriosValores((current) => {
      const group = current[grupoNome] || {};
      return {
        ...current,
        [grupoNome]: {
          ...group,
          [itemNome]: { ...(group[itemNome] || { obs: '' }), nota: Number.isNaN(nota) ? 0 : nota },
        },
      };
    });
  };

  const handleProcedureStatus = (atividade: string, status: ProcedimentoStatus) => {
    setProcedimentosLog((current) => {
      const item = current[atividade] || { status: '', data: '' };
      return {
        ...current,
        [atividade]: {
          ...item,
          status,
          data: status === '' ? '' : item.data || getMaceioIsoDate(),
        },
      };
    });
  };

  const handleProcedureDate = (atividade: string, data: string) => {
    setProcedimentosLog((current) => ({
      ...current,
      [atividade]: { ...(current[atividade] || { status: '', data: '' }), data },
    }));
  };

  const handleSaveEvaluation = async () => {
    if (!selectedAluno || !selectedDiscId) return;
    if (effectiveReadOnly) {
      toast.error('Alteração bloqueada', effectiveReadOnlyMessage);
      return;
    }
    if (
      evaluationDataUnavailable
      || avaliacaoQuery.isLoading
      || avaliacaoQuery.isError
      || avaliacaoQuery.data === undefined
    ) {
      toast.error(
        'Ficha não salva',
        'A avaliação não foi salva porque os dados acadêmicos não estão completamente carregados.',
      );
      return;
    }
    try {
      await saveEvaluationMutation.mutateAsync({
        turmaId: turma.id,
        disciplinaId: selectedDiscId,
        alunoId: selectedAluno.id,
        frequencia: frequenciaEstagio,
        criterios: criteriosValores,
        procedimentosLog,
        perfilAluno,
        instrutorNome,
        dataAvaliacao,
      });
      toast.success('Sucesso', `Avaliação de ${selectedAluno.nome} em ${currentDisc?.nome || ''} salva com sucesso!`);
      setSelectedAluno(null);
    } catch (error) {
      console.error(error);
      toast.error('Erro', 'Não foi possível salvar a avaliação do estágio.');
    }
  };

  const ucConfig = checklistUcsConfig.find(
    (config) => config.uc.toLowerCase().trim() === currentDisc?.nome.toLowerCase().trim(),
  ) || { uc: currentDisc?.nome || '', atividades: [] };

  if (loadingCriticalData) {
    return (
      <div className="flex justify-center items-center py-20 bg-white rounded-[2rem] border border-slate-100">
        <Loader2 className="animate-spin text-teal-600" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando módulo de estágio...</span>
      </div>
    );
  }

  if (criticalDataError) {
    return (
      <div className="py-8">
        <TechnicalDataError
          title="Dados do estágio não carregados"
          message="Avaliações e situação vacinal foram bloqueadas para impedir uma ficha vazia ou a liberação indevida de aluno com pendências."
          retrying={retryingCriticalData}
          onRetry={() => {
            const queries: Promise<unknown>[] = [estagioQuery.refetch()];
            if (effectiveModo === 'GESTOR') queries.push(vacinasQuery.refetch());
            if (selectedDiscId) queries.push(avaliacoesQuery.refetch());
            if (selectedAluno) queries.push(avaliacaoQuery.refetch());
            void Promise.all(queries);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectedAluno ? (
        <EstagioPrintSheet
          turma={turma}
          aluno={selectedAluno}
          disciplina={currentDisc}
          instrutorNome={instrutorNome}
          dataAvaliacao={dataAvaliacao}
          frequenciaEstagio={frequenciaEstagio}
          instrumentosConfig={instrumentosConfig}
          criteriosValores={criteriosValores}
          procedimentosLog={procedimentosLog}
          perfilAluno={perfilAluno}
          ucConfig={ucConfig}
          avaliacaoCalculada={avaliacaoCalculada}
          getSubtotal={getSubtotal}
        />
      ) : null}

      {selectedAluno ? (
        <EstagioEvaluationPanel
          aluno={selectedAluno}
          disciplina={currentDisc}
          readOnly={effectiveReadOnly}
          readOnlyMessage={effectiveReadOnlyMessage}
          hasExistingEvaluation={Boolean(avaliacoesExistentes[selectedAluno.id])}
          loadingConfig={loadingConfig || avaliacaoQuery.isLoading}
          saving={saveEvaluationMutation.isPending}
          instrumentosConfig={instrumentosConfig}
          criteriosValores={criteriosValores}
          procedimentosLog={procedimentosLog}
          ucConfig={ucConfig}
          avaliacaoCalculada={avaliacaoCalculada}
          instrutorNome={instrutorNome}
          dataAvaliacao={dataAvaliacao}
          frequenciaEstagio={frequenciaEstagio}
          perfilAluno={perfilAluno}
          getSubtotal={getSubtotal}
          onBack={() => setSelectedAluno(null)}
          onPrint={() => window.print()}
          onSave={handleSaveEvaluation}
          onCriterioObsChange={handleCriterioObsChange}
          onCriterioNotaChange={handleCriterioNotaChange}
          onProcedureStatus={handleProcedureStatus}
          onProcedureDate={handleProcedureDate}
          onInstrutorNomeChange={setInstrutorNome}
          onDataAvaliacaoChange={setDataAvaliacao}
          onFrequenciaChange={setFrequenciaEstagio}
          onPerfilAlunoChange={setPerfilAluno}
        />
      ) : (
        <EstagioStudentsPanel
          disciplinas={disciplinasDisponiveis}
          selectedDiscId={selectedDiscId}
          onDisciplinaChange={setSelectedDiscId}
          alunos={alunos}
          avaliacoes={avaliacoesExistentes}
          vacinasResumo={vacinasResumo}
          readOnly={effectiveReadOnly}
          readOnlyMessage={effectiveReadOnlyMessage}
          showCpf={effectiveModo === 'GESTOR'}
          showVaccineDetails={effectiveModo === 'GESTOR'}
          onStartEvaluation={startEvaluation}
        />
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaEstagio;
