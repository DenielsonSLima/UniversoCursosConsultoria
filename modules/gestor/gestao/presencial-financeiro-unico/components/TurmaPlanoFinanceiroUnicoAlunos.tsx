import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw, UserPlus } from 'lucide-react';
import type { Turma } from '../../gestao.types';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import {
  type AcademicMovementType,
  type AcademicStudent,
  academicLifecycleService,
} from '../../tecnicos/detalhes/academic-lifecycle.service';
import { academicLifecycleKeys } from '../../tecnicos/detalhes/academic-lifecycle.keys';
import TurmaAlunosTable from '../../tecnicos/detalhes/components/alunos/TurmaAlunosTable';
import MatricularAlunoModal from '../../tecnicos/detalhes/components/alunos/MatricularAlunoModal';
import MovimentacaoAlunoModal, {
  type OperationMode,
  type TransferType,
} from '../../tecnicos/detalhes/components/alunos/MovimentacaoAlunoModal';
import MovimentacaoHistoricoModal from '../../tecnicos/detalhes/components/alunos/MovimentacaoHistoricoModal';
import RemoveEnrollmentConfirm from '../../tecnicos/detalhes/components/alunos/RemoveEnrollmentConfirm';
import { getMaceioIsoDate } from '../../tecnicos/technicalClassDates';
import { useAlunosDisponiveisPlanoFinanceiroUnico } from '../hooks/useAlunosDisponiveisPlanoFinanceiroUnico';
import {
  useMatricularAlunoPlanoFinanceiroUnicoV2,
  usePendenciasPlanoFinanceiroUnico,
} from '../hooks/useCondicaoPlanoFinanceiroUnico';
import {
  useMatricularAlunoPlanoFinanceiroUnico,
  usePlanoFinanceiroUnicoWorkspace,
  useTurmasDestinoPlanoFinanceiroUnico,
} from '../hooks/usePlanoFinanceiroUnico';
import { createPlanoFinanceiroUnicoRequestId } from '../presencial-financeiro-unico.service';
import type {
  AlunoDisponivelPlanoFinanceiroUnico,
  MatricularAlunoPlanoFinanceiroUnicoV2Result,
  PendenciaPlanoFinanceiroUnico,
} from '../types';
import CondicaoPlanoFinanceiroUnicoModal from './CondicaoPlanoFinanceiroUnicoModal';
import ConfirmarPlanoFinanceiroUnicoModal from './ConfirmarPlanoFinanceiroUnicoModal';
import PendenciasPlanoFinanceiroUnicoPanel from './PendenciasPlanoFinanceiroUnicoPanel';
import PlanoFinanceiroUnicoStateModal from './PlanoFinanceiroUnicoStateModal';

interface TurmaPlanoFinanceiroUnicoAlunosProps {
  turma: Turma;
  canManageFinanceiro?: boolean;
}

const ENROLLMENT_PHASES = new Set(['PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO']);

const TurmaPlanoFinanceiroUnicoAlunos: React.FC<TurmaPlanoFinanceiroUnicoAlunosProps> = ({
  turma,
  canManageFinanceiro = false,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<AlunoDisponivelPlanoFinanceiroUnico | null>(null);
  const [selectedPendingCondition, setSelectedPendingCondition] = useState<PendenciaPlanoFinanceiroUnico | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const requestIds = useRef(new Map<string, string>());
  const [selectedStudent, setSelectedStudent] = useState<AcademicStudent | null>(null);
  const [studentToRemove, setStudentToRemove] = useState<AcademicStudent | null>(null);
  const [historyStudent, setHistoryStudent] = useState<AcademicStudent | null>(null);
  const [operationMode, setOperationMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<TransferType>('INTERNA_TURMA');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [operationDate, setOperationDate] = useState(getMaceioIsoDate());
  const [returnDate, setReturnDate] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');
  const turmaStatus = String(turma.status || '').toUpperCase();
  const isLivre = turma.modalidade === 'LIVRE';
  const canEnroll = ENROLLMENT_PHASES.has(turmaStatus);
  const isReadOnly = turmaStatus === 'FINALIZADA';

  const studentsQuery = useQuery({
    queryKey: academicLifecycleKeys.alunos(turma.id),
    queryFn: () => academicLifecycleService.getStudents(turma.id),
    staleTime: 15_000,
  });
  const movementsQuery = useQuery({
    queryKey: academicLifecycleKeys.movimentacoes(turma.id),
    queryFn: () => academicLifecycleService.getMovimentacoes(turma.id),
    staleTime: 15_000,
  });
  const availableStudentsQuery = useAlunosDisponiveisPlanoFinanceiroUnico(
    turma.id,
    showMatricularModal,
    searchTerm,
  );
  const planQuery = usePlanoFinanceiroUnicoWorkspace(
    turma.id,
    Boolean(pendingEnrollment || selectedPendingCondition) && canManageFinanceiro,
  );
  const pendingConditionsQuery = usePendenciasPlanoFinanceiroUnico(
    turma.id,
    isLivre && canManageFinanceiro,
  );
  const destinationClassesQuery = useTurmasDestinoPlanoFinanceiroUnico(
    turma.id,
    Boolean(selectedStudent) && (
      operationMode === 'RETORNO'
      || (operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA')
    ),
  );
  const planEnrollmentMutation = useMatricularAlunoPlanoFinanceiroUnico();
  const planEnrollmentV2Mutation = useMatricularAlunoPlanoFinanceiroUnicoV2();

  const invalidateAcademicData = useCallback(async (extraTurmaId?: string) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(turma.id) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.movimentacoes(turma.id) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.resumo(turma.id) }),
      queryClient.invalidateQueries({ queryKey: ['diario-alunos', turma.id] }),
      queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turma.id] }),
    ];
    if (extraTurmaId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(extraTurmaId) }),
        queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.movimentacoes(extraTurmaId) }),
      );
    }
    await Promise.all(invalidations);
  }, [queryClient, turma.id]);

  const closeOperationModal = () => {
    setSelectedStudent(null);
    setReason('');
    setNotes('');
    setOperationDate(getMaceioIsoDate());
    setReturnDate('');
    setDestinationClassId('');
    setDestinationInstitution('');
  };

  const movementMutation = useMutation({
    mutationFn: (input: {
      matriculaId: string;
      tipo: AcademicMovementType;
      motivo: string;
      observacao?: string;
      dataMovimentacao: string;
      dataRetornoPrevista?: string;
    }) => academicLifecycleService.movimentar(input),
    onSuccess: async () => {
      await invalidateAcademicData();
      closeOperationModal();
      toast.success('Movimentação registrada', 'O histórico acadêmico da matrícula foi atualizado.');
    },
    onError: (error) => toast.error('Movimentação não realizada', error instanceof Error ? error.message : 'O servidor não confirmou a movimentação.'),
  });
  const transferMutation = useMutation({
    mutationFn: (input: {
      matriculaId: string;
      tipo: TransferType;
      motivo: string;
      turmaDestinoId?: string;
      instituicaoDestino?: string;
      observacao?: string;
      dataTransferencia: string;
    }) => academicLifecycleService.transferir({
      ...input,
      turmaDestinoId: input.tipo === 'EXTERNA_ENVIADA' ? undefined : input.turmaDestinoId,
      instituicaoDestino: input.tipo === 'EXTERNA_ENVIADA' ? input.instituicaoDestino : undefined,
    }),
    onSuccess: async (_result, input) => {
      await invalidateAcademicData(input.turmaDestinoId);
      closeOperationModal();
      toast.success('Transferência concluída', 'A matrícula de origem foi preservada no histórico.');
    },
    onError: (error) => toast.error('Transferência não realizada', error instanceof Error ? error.message : 'O servidor não confirmou a transferência.'),
  });
  const returnMutation = useMutation({
    mutationFn: (input: {
      matriculaOrigemId: string;
      turmaDestinoId: string;
      motivo: string;
      observacao?: string;
      dataRetorno: string;
    }) => academicLifecycleService.retornarEmNovaTurma(input),
    onSuccess: async (_result, input) => {
      await invalidateAcademicData(input.turmaDestinoId);
      closeOperationModal();
      toast.success('Retorno registrado', 'A nova matrícula foi registrada no histórico acadêmico.');
    },
    onError: (error) => toast.error('Retorno não realizado', error instanceof Error ? error.message : 'O servidor não confirmou o retorno.'),
  });
  const removeEnrollmentMutation = useMutation({
    mutationFn: (matriculaId: string) => academicLifecycleService.removerMatricula(matriculaId),
    onSuccess: async () => {
      await invalidateAcademicData();
      setStudentToRemove(null);
      toast.success('Aluno removido da turma', 'A matrícula e os lançamentos vinculados foram removidos.');
    },
    onError: (error) => toast.error('Remoção não realizada', error instanceof Error ? error.message : 'O servidor não confirmou a remoção.'),
  });

  const students = studentsQuery.data || [];
  const movements = movementsQuery.data || [];
  const latestMovements = useMemo(() => {
    const byEnrollment = new Map<string, (typeof movements)[number]>();
    const currentStatus = new Map(students.map((student) => [student.matricula_id, student.status]));
    movements.forEach((movement) => {
      const current = byEnrollment.get(movement.matricula_id);
      if (
        movement.status_novo === currentStatus.get(movement.matricula_id)
        && (!current || movement.created_at > current.created_at)
      ) {
        byEnrollment.set(movement.matricula_id, movement);
      }
    });
    return byEnrollment;
  }, [movements, students]);
  const selectedHistory = useMemo(() => (
    historyStudent ? movements.filter((movement) => movement.matricula_id === historyStudent.matricula_id) : []
  ), [historyStudent, movements]);

  const openEnrollmentSearch = () => {
    if (!canEnroll) {
      toast.error('Matrícula indisponível', 'A fase atual da turma não permite novas matrículas.');
      return;
    }
    if (!canManageFinanceiro) {
      toast.error('Permissão financeira necessária', 'Solicite acesso à aba Financeiro para definir a condição comercial desta matrícula.');
      return;
    }
    setSearchTerm('');
    setShowMatricularModal(true);
  };

  const confirmStudent = (student: AlunoDisponivelPlanoFinanceiroUnico) => {
    setShowMatricularModal(false);
    setPendingEnrollment(student);
  };

  const closeEnrollment = () => {
    setPendingEnrollment(null);
    setSelectedPendingCondition(null);
    setSearchTerm('');
  };

  const completeV2Enrollment = (result: MatricularAlunoPlanoFinanceiroUnicoV2Result) => {
    if (result.financeiroGerado) {
      toast.success(
        'Financeiro local gerado',
        `${result.parcelasGeradas} título${result.parcelasGeradas === 1 ? '' : 's'} criado${result.parcelasGeradas === 1 ? '' : 's'}. A emissão bancária continua em Financeiro › Receber.`,
      );
    } else {
      toast.success(
        'Aluno vinculado',
        'A condição foi preservada sem gerar títulos. Ela aparece em “Financeiro para gerar depois”.',
      );
    }
    closeEnrollment();
  };

  const confirmPlanEnrollment = async () => {
    if (!pendingEnrollment) return;
    const regra = planQuery.data?.regra;
    if (!planQuery.data?.configurado || !regra || !regra.revisao || !regra.fingerprint || regra.cronograma.length === 0) {
      toast.error('Plano não confirmado', 'Recarregue o plano financeiro oficial antes de gerar as parcelas.');
      return;
    }

    const requestKey = `${pendingEnrollment.id}:${regra.revisao}:${regra.fingerprint}`;
    const requestId = requestIds.current.get(requestKey) || createPlanoFinanceiroUnicoRequestId();
    requestIds.current.set(requestKey, requestId);

    try {
      const result = await planEnrollmentMutation.mutateAsync({
        requestId,
        turmaId: turma.id,
        alunoId: pendingEnrollment.id,
        expectedRevisao: regra.revisao,
        expectedFingerprint: regra.fingerprint,
      });
      requestIds.current.delete(requestKey);
      const total = result.parcelasGeradas || regra.qtdParcelas;
      const insertedMessage = result.parcelasInseridas > 0
        ? `${result.parcelasInseridas} título${result.parcelasInseridas === 1 ? '' : 's'} de parcela em boleto foram gerados conforme o plano da turma.`
        : `O plano já possuía ${total} parcela${total === 1 ? '' : 's'} para esta matrícula; nenhum título foi duplicado.`;
      toast.success(
        'Pré-matrícula criada',
        `${insertedMessage} Emita os boletos em Financeiro › Receber. O aluno será ativado automaticamente após a confirmação do pagamento da primeira parcela.`,
      );
      closeEnrollment();
    } catch (error) {
      toast.error('Matrícula não realizada', error instanceof Error ? error.message : 'O servidor não confirmou a geração das parcelas.');
    }
  };

  const openMovement = (student: AcademicStudent) => {
    if (isReadOnly) return;
    setSelectedStudent(student);
    setOperationDate(getMaceioIsoDate());
    setOperationMode('MOVIMENTACAO');
    setMovementType(['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status) ? 'REATIVACAO' : 'TRANCAMENTO');
  };
  const openTransfer = (student: AcademicStudent) => {
    if (isReadOnly) return;
    setSelectedStudent(student);
    setOperationDate(getMaceioIsoDate());
    setOperationMode('TRANSFERENCIA');
    setTransferType('INTERNA_TURMA');
  };
  const confirmAcademicOperation = () => {
    if (!selectedStudent) return;
    if (operationMode === 'MOVIMENTACAO') {
      movementMutation.mutate({
        matriculaId: selectedStudent.matricula_id,
        tipo: movementType,
        motivo: reason,
        observacao: notes,
        dataMovimentacao: operationDate,
        dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
      });
      return;
    }
    if (operationMode === 'RETORNO') {
      returnMutation.mutate({
        matriculaOrigemId: selectedStudent.matricula_id,
        turmaDestinoId: destinationClassId,
        motivo: reason,
        observacao: notes,
        dataRetorno: operationDate,
      });
      return;
    }
    if (transferType !== 'EXTERNA_ENVIADA' && (destinationClassesQuery.isError || destinationClassesQuery.isLoading)) {
      toast.error('Destino não carregado', 'Recarregue as turmas de destino antes de transferir.');
      return;
    }
    transferMutation.mutate({
      matriculaId: selectedStudent.matricula_id,
      tipo: transferType,
      motivo: reason,
      turmaDestinoId: transferType === 'EXTERNA_ENVIADA' ? undefined : destinationClassId,
      instituicaoDestino: transferType === 'EXTERNA_ENVIADA' ? destinationInstitution : undefined,
      observacao: notes,
      dataTransferencia: operationDate,
    });
  };

  if (studentsQuery.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-emerald-600" size={32} /><span className="ml-3 font-bold text-slate-500">Carregando matrículas...</span></div>;
  }
  if (studentsQuery.isError) {
    return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-7 text-center"><AlertCircle className="mx-auto text-rose-600" size={26} /><h3 className="mt-3 text-sm font-black uppercase tracking-wider text-rose-900">Matrículas não carregadas</h3><p className="mt-2 text-sm font-medium text-rose-700">As ações foram bloqueadas para evitar alterações com uma lista incompleta.</p><button type="button" onClick={() => { void studentsQuery.refetch(); }} disabled={studentsQuery.isFetching} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase text-rose-700 disabled:opacity-50"><RefreshCw size={13} className={studentsQuery.isFetching ? 'animate-spin' : ''} /> Tentar novamente</button></div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-bold text-[#001a33]">Matrículas da turma</h3>
          <p className="mt-1 text-xs text-slate-500">{students.length} registros preservados, incluindo alunos inativos e transferidos.</p>
          {!canManageFinanceiro ? <p className="mt-2 text-[11px] font-semibold text-amber-700">É necessária permissão financeira para definir a condição e gerar as cobranças do aluno.</p> : null}
          <p className="mt-2 text-[11px] font-semibold text-slate-500">Para preservar as parcelas geradas, movimentação, transferência e remoção de matrícula não estão disponíveis nesta modalidade.</p>
        </div>
        <button type="button" onClick={openEnrollmentSearch} disabled={!canEnroll || !canManageFinanceiro} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"><UserPlus size={16} /> Matricular aluno</button>
      </div>

      {isLivre ? <PendenciasPlanoFinanceiroUnicoPanel
        items={pendingConditionsQuery.data?.pendencias || []}
        loading={pendingConditionsQuery.isLoading}
        error={pendingConditionsQuery.isError}
        retrying={pendingConditionsQuery.isFetching}
        onRetry={() => { void pendingConditionsQuery.refetch(); }}
        onOpen={setSelectedPendingCondition}
      /> : null}

      <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <TurmaAlunosTable
          students={students}
          readOnly
          onOpenMovement={openMovement}
          onOpenTransfer={openTransfer}
          onRemoveEnrollment={(student) => setStudentToRemove(student)}
          latestMovements={latestMovements}
          onOpenHistory={(student) => setHistoryStudent(student)}
        />
      </div>

      {showMatricularModal ? <MatricularAlunoModal
        searchTerm={searchTerm}
        loadingAvailable={availableStudentsQuery.isLoading || availableStudentsQuery.isSearchSettling}
        enrollPending={planEnrollmentMutation.isPending || planEnrollmentV2Mutation.isPending}
        loadError={availableStudentsQuery.isError ? 'A busca de alunos falhou. Nenhuma matrícula pode ser iniciada com dados incompletos.' : null}
        retrying={availableStudentsQuery.isFetching}
        students={availableStudentsQuery.filteredAvailableStudents}
        onSearchChange={setSearchTerm}
        onConfirmStudent={confirmStudent}
        onRetry={() => { void availableStudentsQuery.refetch(); }}
        onClose={() => { setShowMatricularModal(false); setSearchTerm(''); }}
      /> : null}

      {(pendingEnrollment || selectedPendingCondition) && planQuery.isLoading ? <PlanoFinanceiroUnicoStateModal mode="loading" onClose={closeEnrollment} /> : null}
      {(pendingEnrollment || selectedPendingCondition) && planQuery.isError ? <PlanoFinanceiroUnicoStateModal mode="error" retrying={planQuery.isFetching} onClose={closeEnrollment} onRetry={() => { void planQuery.refetch(); }} /> : null}
      {(pendingEnrollment || selectedPendingCondition) && planQuery.data && !planQuery.data.configurado ? <PlanoFinanceiroUnicoStateModal mode="missing" retrying={planQuery.isFetching} onClose={closeEnrollment} onRetry={() => { void planQuery.refetch(); }} /> : null}
      {isLivre && (pendingEnrollment || selectedPendingCondition) && planQuery.data?.configurado && planQuery.data.regra ? <CondicaoPlanoFinanceiroUnicoModal
        turmaId={turma.id}
        turmaNome={turma.nome}
        student={selectedPendingCondition?.aluno || pendingEnrollment!}
        regraTurma={planQuery.data.regra}
        pendencia={selectedPendingCondition}
        pending={planEnrollmentV2Mutation.isPending}
        onClose={closeEnrollment}
        onSubmit={(input) => planEnrollmentV2Mutation.mutateAsync(input)}
        onCompleted={completeV2Enrollment}
        onError={(error) => toast.error('Operação não realizada', error instanceof Error ? error.message : 'O servidor não confirmou a condição financeira.')}
      /> : null}
      {!isLivre && pendingEnrollment && planQuery.data?.configurado && planQuery.data.regra ? <ConfirmarPlanoFinanceiroUnicoModal turmaNome={turma.nome} student={pendingEnrollment} regra={planQuery.data.regra} pending={planEnrollmentMutation.isPending} onClose={closeEnrollment} onConfirm={() => { void confirmPlanEnrollment(); }} /> : null}

      {selectedStudent ? <MovimentacaoAlunoModal
        student={selectedStudent}
        operationMode={operationMode}
        movementType={movementType}
        transferType={transferType}
        reason={reason}
        notes={notes}
        operationDate={operationDate}
        returnDate={returnDate}
        destinationClassId={destinationClassId}
        destinationInstitution={destinationInstitution}
        destinationClasses={destinationClassesQuery.data || []}
        movementPending={movementMutation.isPending}
        transferPending={transferMutation.isPending}
        returnPending={returnMutation.isPending}
        destinationError={destinationClassesQuery.isError}
        destinationRetrying={destinationClassesQuery.isFetching}
        onOperationModeChange={setOperationMode}
        onMovementTypeChange={setMovementType}
        onTransferTypeChange={setTransferType}
        onReasonChange={setReason}
        onNotesChange={setNotes}
        onOperationDateChange={setOperationDate}
        onReturnDateChange={setReturnDate}
        onDestinationClassChange={setDestinationClassId}
        onDestinationInstitutionChange={setDestinationInstitution}
        onClose={closeOperationModal}
        onRetryDestination={() => { void destinationClassesQuery.refetch(); }}
        onConfirm={confirmAcademicOperation}
      /> : null}

      {historyStudent ? <MovimentacaoHistoricoModal student={historyStudent} movements={selectedHistory} onClose={() => setHistoryStudent(null)} /> : null}
      <RemoveEnrollmentConfirm student={studentToRemove} pending={removeEnrollmentMutation.isPending} readOnly={isReadOnly} onClose={() => setStudentToRemove(null)} onConfirm={(matriculaId) => removeEnrollmentMutation.mutate(matriculaId)} />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaPlanoFinanceiroUnicoAlunos;
