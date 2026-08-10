import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { AcademicMovementType, AcademicStudent, academicLifecycleService } from '../academic-lifecycle.service';
import ConfirmarMatriculaModal, { type EnrollmentFinanceSubmission } from './alunos/ConfirmarMatriculaModal';
import ConfirmarVinculoAcademicoModal from './alunos/ConfirmarVinculoAcademicoModal';
import MatricularAlunoModal from './alunos/MatricularAlunoModal';
import MovimentacaoAlunoModal, { OperationMode, TransferType } from './alunos/MovimentacaoAlunoModal';
import MovimentacaoHistoricoModal from './alunos/MovimentacaoHistoricoModal';
import TurmaAlunosTable from './alunos/TurmaAlunosTable';
import TurmaAlunosHeader from './alunos/TurmaAlunosHeader';
import TurmaAlunosQueryState from './alunos/TurmaAlunosQueryState';
import RemoveEnrollmentConfirm from './alunos/RemoveEnrollmentConfirm';
import { ENROLLMENT_PHASES } from './alunos/turmaAlunos.config';
import {
  useAvailableStudents,
  useDestinationClasses,
  useTurmaStudents,
  useTurmaMovements,
} from '../hooks/useTurmaAlunosQueries';
import {
  useMovementMutation,
  useRemoveEnrollmentMutation,
  useReturnEnrollmentMutation,
  useTransferMutation,
  useTurmaAcademicInvalidation,
} from '../hooks/useTurmaAlunosMutations';
import { getTechnicalEnrollmentMissingFields } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { getMaceioIsoDate } from '../../technicalClassDates';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import {
  createFinanceiroRequestId,
  useAtivarFinanceiroMatriculaTecnica,
  useMatriculaTecnicaFinanceiroWorkspace,
  usePreVinculoAlunoTecnicoContexto,
  usePreVincularAlunoTecnico,
  useSalvarOverrideFinanceiroTecnico,
} from './financeiro/hooks/useMatriculaTecnicaFinanceiro';
import { useMatriculaTecnicaFinanceiroRealtime } from './financeiro/hooks/useMatriculaTecnicaFinanceiroRealtime';
import { matriculaTecnicaFinanceiroKeys } from './financeiro/matricula-tecnica-financeiro.keys';
import {
  isFinanceiroDateRejected,
  isRegraFinanceiraConflict,
} from './financeiro/matricula-tecnica-financeiro.service';

interface TurmaAlunosProps {
  turma: Turma;
  canManageFinanceiro?: boolean;
}
const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma, canManageFinanceiro = false }) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<any>(null);
  const preLinkRequestIds = useRef(new Map<string, string>());
  const overrideRequestIds = useRef(new Map<string, string>());
  const activationRequestIds = useRef(new Map<string, string>());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<AcademicStudent | null>(null);
  const [studentToRemove, setStudentToRemove] = useState<AcademicStudent | null>(null);
  const [operationMode, setOperationMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<TransferType>('INTERNA_TURMA');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [operationDate, setOperationDate] = useState(getMaceioIsoDate());
  const [returnDate, setReturnDate] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');
  const [historyStudent, setHistoryStudent] = useState<AcademicStudent | null>(null);
  const requireTechnicalProfile = String(turma.modalidade || '').toUpperCase() === 'TECNICO';
  const turmaStatus = String(turma.status || '').toUpperCase();
  const canEnroll = ENROLLMENT_PHASES.has(turmaStatus);
  const isReadOnly = turmaStatus === 'FINALIZADA';
  useMatriculaTecnicaFinanceiroRealtime(
    requireTechnicalProfile && canManageFinanceiro ? turma.id : '',
  );
  const studentsQuery = useTurmaStudents(turma.id);
  const students = studentsQuery.data || [];
  const movementsQuery = useTurmaMovements(turma.id);
  const movements = movementsQuery.data || [];
  const latestMovements = useMemo(() => {
    const byEnrollment = new Map<string, (typeof movements)[number]>();
    const currentStatus = new Map(
      students.map((student) => [student.matricula_id, student.status]),
    );
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
  const selectedHistory = useMemo(
    () => historyStudent
      ? movements.filter((movement) => movement.matricula_id === historyStudent.matricula_id)
      : [],
    [historyStudent, movements],
  );
  const availableStudentsQuery = useAvailableStudents(
    turma.id,
    showMatricularModal,
    searchTerm,
  );
  const enrollmentWorkspaceQuery = useMatriculaTecnicaFinanceiroWorkspace(
    turma.id,
    pendingEnrollment?.id,
    requireTechnicalProfile && canManageFinanceiro && canEnroll && Boolean(pendingEnrollment),
  );
  const preVinculoContextoQuery = usePreVinculoAlunoTecnicoContexto(
    turma.id,
    pendingEnrollment?.id,
    requireTechnicalProfile && !canManageFinanceiro && canEnroll && Boolean(pendingEnrollment),
  );
  const destinationClassesQuery = useDestinationClasses(
    turma.id,
    !!selectedStudent && (
      operationMode === 'RETORNO'
      || (operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA')
    ),
  );
  const destinationClasses = destinationClassesQuery.data || [];
  const invalidateAcademicData = useTurmaAcademicInvalidation(turma.id);
  const preLinkMutation = usePreVincularAlunoTecnico();
  const saveOverrideMutation = useSalvarOverrideFinanceiroTecnico();
  const activateFinanceMutation = useAtivarFinanceiroMatriculaTecnica();
  const legacyEnrollMutation = useMutation({
    mutationFn: (alunoId: string) => academicLifecycleService.matricularAluno(turma.id, alunoId),
  });
  const confirmEnrollment = (student: any) => {
    if (!canEnroll) {
      toast.error('Matrícula indisponível', 'A fase atual da turma não permite novas matrículas.');
      return;
    }
    if (requireTechnicalProfile) {
      const missingFields = getTechnicalEnrollmentMissingFields(student);
      if (missingFields.length > 0) {
        toast.error(
          'Cadastro técnico incompleto',
          `Antes da matrícula técnica, complete no cadastro do aluno: ${missingFields.map((field) => field.label).join(', ')}.`
        );
        return;
      }
    }
    setShowMatricularModal(false);
    setPendingEnrollment(student);
  };

  const closeEnrollmentConfirmation = () => {
    setPendingEnrollment(null);
  };
  const confirmEnrollmentFinance = async (submission?: EnrollmentFinanceSubmission) => {
    if (!pendingEnrollment) return;
    if (!requireTechnicalProfile) {
      try {
        await legacyEnrollMutation.mutateAsync(pendingEnrollment.id);
        await queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(turma.id) });
        setSearchTerm('');
        closeEnrollmentConfirmation();
        toast.success('Aluno vinculado', 'O vínculo acadêmico foi confirmado sem criar uma nova cobrança automática.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'O servidor não confirmou o vínculo.';
        toast.error('Matrícula não realizada', message);
      }
      return;
    }
    const confirmedRule = canManageFinanceiro
      ? enrollmentWorkspaceQuery.data?.regra
      : preVinculoContextoQuery.data?.regra;
    const financialContextError = canManageFinanceiro
      ? enrollmentWorkspaceQuery.isError
      : preVinculoContextoQuery.isError;
    if (!canEnroll || financialContextError || !confirmedRule) {
      toast.error('Regra não carregada', 'Recarregue o workspace financeiro oficial antes de confirmar.');
      return;
    }
    const effectiveIntent = canManageFinanceiro ? submission?.intent || 'PENDENTE' : 'PENDENTE';
    const primeiroVencimento = canManageFinanceiro ? submission?.primeiroVencimento || '' : '';
    const ativarEm = canManageFinanceiro ? submission?.ativarEm || '' : '';
    if (canManageFinanceiro && !primeiroVencimento) {
      toast.error('Vencimento obrigatório', 'Informe o primeiro vencimento desta matrícula.');
      return;
    }
    if (effectiveIntent === 'AGENDADA' && !ativarEm) {
      toast.error('Agendamento obrigatório', 'Informe quando a geração financeira deve ser executada.');
      return;
    }
    const preLinkKey = `${pendingEnrollment.id}:${primeiroVencimento || 'CANONICO'}:${confirmedRule.revisao}:${confirmedRule.fingerprint}`;
    const currentPreLinkRequestId = preLinkRequestIds.current.get(preLinkKey)
      || createFinanceiroRequestId();
    preLinkRequestIds.current.set(preLinkKey, currentPreLinkRequestId);
    let preLinkConfirmed = false;
    try {
      const preLink = await preLinkMutation.mutateAsync({
        turmaId: turma.id,
        alunoId: pendingEnrollment.id,
        requestId: currentPreLinkRequestId,
        expectedRegraRevisao: confirmedRule.revisao,
        expectedRegraFingerprint: confirmedRule.fingerprint,
        primeiroVencimento: canManageFinanceiro ? primeiroVencimento || null : null,
      });
      if (preLink.cobrancaGerada) {
        throw new Error('O pré-vínculo retornou uma cobrança inesperada.');
      }
      preLinkConfirmed = true;
      await queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.alunos(turma.id) });

      let effectiveMatricula = preLink.matricula;
      if (submission?.override) {
        if (!submission.codigoAutorizacao || !submission.motivo) {
          throw new Error('A condição individual não possui autorização válida.');
        }
        const effectiveRule = effectiveMatricula.regraEfetiva;
        const currentOverride = effectiveMatricula.override;
        if (!effectiveRule || !currentOverride) {
          throw new Error('O servidor não retornou a identidade financeira para aplicar a condição individual.');
        }
        const overrideKey = JSON.stringify({
          matriculaId: effectiveMatricula.matriculaId,
          override: submission.override,
          motivo: submission.motivo,
          justificativa: submission.justificativa,
          expected: effectiveRule.identidade,
        });
        const overrideRequestId = overrideRequestIds.current.get(overrideKey)
          || createFinanceiroRequestId();
        overrideRequestIds.current.set(overrideKey, overrideRequestId);
        const overrideResult = await saveOverrideMutation.mutateAsync({
          turmaId: turma.id,
          matriculaId: effectiveMatricula.matriculaId,
          requestId: overrideRequestId,
          expectedTurmaRevisao: effectiveRule.identidade.turmaRevisao,
          expectedTurmaFingerprint: effectiveRule.identidade.turmaFingerprint,
          expectedOverrideRevisao: currentOverride.identidade.revisao,
          expectedOverrideFingerprint: currentOverride.identidade.fingerprint,
          override: submission.override,
          codigoAutorizacao: submission.codigoAutorizacao,
          motivo: submission.motivo,
          justificativa: submission.justificativa,
        });
        overrideRequestIds.current.delete(overrideKey);
        effectiveMatricula = overrideResult.matricula;
      }

      if (effectiveIntent !== 'PENDENTE') {
        const effectiveRule = effectiveMatricula.regraEfetiva;
        const currentOverride = effectiveMatricula.override;
        if (!effectiveRule || !currentOverride) {
          throw new Error('O servidor não retornou a identidade financeira efetiva da matrícula.');
        }
        const activationKey = `${effectiveMatricula.matriculaId}:${effectiveIntent}:${ativarEm || 'AGORA'}:${effectiveRule.identidade.efetivaFingerprint}`;
        const currentActivationRequestId = activationRequestIds.current.get(activationKey)
          || createFinanceiroRequestId();
        activationRequestIds.current.set(activationKey, currentActivationRequestId);
        await activateFinanceMutation.mutateAsync({
          turmaId: turma.id,
          matriculaId: effectiveMatricula.matriculaId,
          modo: effectiveIntent,
          requestId: currentActivationRequestId,
          expectedTurmaRevisao: effectiveRule.identidade.turmaRevisao,
          expectedTurmaFingerprint: effectiveRule.identidade.turmaFingerprint,
          expectedOverrideRevisao: currentOverride.identidade.revisao,
          expectedOverrideFingerprint: currentOverride.identidade.fingerprint,
          expectedEfetivaFingerprint: effectiveRule.identidade.efetivaFingerprint,
          ativarEm: effectiveIntent === 'AGENDADA'
            ? new Date(ativarEm).toISOString()
            : null,
        });
      }

      setShowMatricularModal(false);
      setSearchTerm('');
      preLinkRequestIds.current.clear();
      overrideRequestIds.current.clear();
      activationRequestIds.current.clear();
      closeEnrollmentConfirmation();
      if (effectiveIntent === 'PENDENTE') {
        toast.success('Aluno pré-vinculado', 'Nenhuma cobrança foi gerada. O financeiro ficou pendente para uma ação posterior.');
      } else if (effectiveIntent === 'AGORA') {
        toast.success('Cobrança inicial gerada', 'O servidor confirmou o vínculo e criou somente o título inicial local.');
      } else {
        toast.success('Financeiro agendado', 'O vínculo foi confirmado e a geração ficou agendada pelo servidor.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'O servidor não confirmou a operação.';
      if (isRegraFinanceiraConflict(error)) {
        void queryClient.invalidateQueries({
          queryKey: matriculaTecnicaFinanceiroKeys.turma(turma.id),
          refetchType: 'active',
        });
        toast.warning(
          preLinkConfirmed ? 'Vínculo confirmado; regra alterada' : 'Regra financeira alterada',
          'A regra da turma mudou durante a confirmação. Revise os novos valores e confirme novamente.',
        );
        return;
      }
      if (isFinanceiroDateRejected(error)) {
        toast.warning(
          preLinkConfirmed ? 'Aluno vinculado; data não aceita' : 'Data não aceita pelo servidor',
          'A data informada já venceu ou não é válida. O financeiro permanece pendente; corrija o vencimento e tente novamente.',
        );
        return;
      }
      if (preLinkConfirmed) {
        void queryClient.invalidateQueries({
          queryKey: matriculaTecnicaFinanceiroKeys.turma(turma.id),
          refetchType: 'active',
        });
        toast.warning(
          'Aluno vinculado; financeiro pendente',
          `${message} A ativação não foi confirmada. Tente novamente; o mesmo identificador será reutilizado com segurança.`,
        );
      } else {
        toast.error('Matrícula não realizada', `${message} Tente novamente; o mesmo identificador será reutilizado com segurança.`);
      }
    }
  };
  const movementMutation = useMovementMutation(
    async () => {
      await invalidateAcademicData();
      closeOperationModal();
      toast.success('Movimentação registrada', 'O histórico acadêmico da matrícula foi atualizado.');
    },
    (error: any) => toast.error('Movimentação não realizada', error.message),
  );

  const transferMutation = useTransferMutation(
    async (_result, input) => {
      await invalidateAcademicData(input.turmaDestinoId);
      closeOperationModal();
      toast.success('Transferência concluída', 'A matrícula de origem foi preservada no histórico.');
    },
    (error: any) => toast.error('Transferência não realizada', error.message),
  );

  const returnMutation = useReturnEnrollmentMutation(
    async (_result, input) => {
      await invalidateAcademicData(input.turmaDestinoId);
      closeOperationModal();
      toast.success('Retorno registrado', 'A nova matrícula recebeu o histórico de disciplinas aprovadas.');
    },
    (error: any) => toast.error('Retorno não realizado', error.message),
  );

  const removeEnrollmentMutation = useRemoveEnrollmentMutation(
    async () => {
      await invalidateAcademicData();
      setStudentToRemove(null);
      toast.success('Aluno removido da turma', 'A matrícula e os lançamentos financeiros vinculados foram excluídos.');
    },
    (error: any) => toast.error('Remoção não realizada', error.message),
  );

  const closeOperationModal = () => {
    setSelectedStudent(null);
    setReason('');
    setNotes('');
    setOperationDate(getMaceioIsoDate());
    setReturnDate('');
    setDestinationClassId('');
    setDestinationInstitution('');
  };
  const openEnrollmentSearch = () => {
    if (!canEnroll) return;
    setSearchTerm('');
    setShowMatricularModal(true);
  };

  const closeEnrollmentSearch = () => {
    setShowMatricularModal(false);
    setSearchTerm('');
  };

  const openMovement = (student: AcademicStudent) => {
    if (isReadOnly) return;
    setSelectedStudent(student);
    setOperationDate(getMaceioIsoDate());
    setOperationMode('MOVIMENTACAO');
    setMovementType(
      ['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status)
        ? 'REATIVACAO'
        : 'TRANCAMENTO'
    );
  };

  const openTransfer = (student: AcademicStudent) => {
    if (isReadOnly) return;
    setSelectedStudent(student);
    setOperationDate(getMaceioIsoDate());
    setOperationMode('TRANSFERENCIA');
    setTransferType('INTERNA_TURMA');
  };

  if (studentsQuery.isLoading || studentsQuery.isError) return (
    <TurmaAlunosQueryState {...studentsQuery} onRetry={() => { void studentsQuery.refetch(); }} />
  );

  return (
    <div className="">
      <TurmaAlunosHeader totalStudents={students.length} onEnroll={openEnrollmentSearch} canEnroll={canEnroll} />

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <TurmaAlunosTable
          students={students}
          readOnly={isReadOnly}
          onOpenMovement={openMovement}
          onOpenTransfer={openTransfer}
          onRemoveEnrollment={setStudentToRemove}
          latestMovements={latestMovements}
          onOpenHistory={setHistoryStudent}
        />
      </div>

      {showMatricularModal && (
        <MatricularAlunoModal
          searchTerm={searchTerm}
          loadingAvailable={availableStudentsQuery.isLoading}
          enrollPending={preLinkMutation.isPending || saveOverrideMutation.isPending || activateFinanceMutation.isPending || legacyEnrollMutation.isPending}
          loadError={availableStudentsQuery.isError
            ? 'A busca de alunos falhou. Nenhuma matrícula pode ser iniciada com dados incompletos.'
            : null}
          retrying={availableStudentsQuery.isFetching}
          students={availableStudentsQuery.filteredAvailableStudents}
          requireTechnicalProfile={requireTechnicalProfile}
          onSearchChange={setSearchTerm}
          onConfirmStudent={confirmEnrollment}
          onRetry={() => { void availableStudentsQuery.refetch(); }}
          onClose={closeEnrollmentSearch}
        />
      )}

      {pendingEnrollment && requireTechnicalProfile && (
        <ConfirmarMatriculaModal
          turma={turma}
          student={pendingEnrollment}
          regra={canManageFinanceiro
            ? enrollmentWorkspaceQuery.data?.regra
            : preVinculoContextoQuery.data?.regra}
          canManageFinanceiro={canManageFinanceiro}
          loading={canManageFinanceiro
            ? enrollmentWorkspaceQuery.isLoading
            : preVinculoContextoQuery.isLoading}
          error={canManageFinanceiro
            ? enrollmentWorkspaceQuery.isError
            : preVinculoContextoQuery.isError}
          retrying={canManageFinanceiro
            ? enrollmentWorkspaceQuery.isFetching
            : preVinculoContextoQuery.isFetching}
          isPending={preLinkMutation.isPending || saveOverrideMutation.isPending || activateFinanceMutation.isPending}
          onRetry={() => {
            if (canManageFinanceiro) void enrollmentWorkspaceQuery.refetch();
            else void preVinculoContextoQuery.refetch();
          }}
          onClose={closeEnrollmentConfirmation}
          onConfirm={(submission) => { void confirmEnrollmentFinance(submission); }}
        />
      )}

      {pendingEnrollment && !requireTechnicalProfile && (
        <ConfirmarVinculoAcademicoModal
          turma={turma}
          student={pendingEnrollment}
          pending={legacyEnrollMutation.isPending}
          onClose={closeEnrollmentConfirmation}
          onConfirm={() => { void confirmEnrollmentFinance(); }}
        />
      )}

      {selectedStudent && (
        <MovimentacaoAlunoModal
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
          destinationClasses={destinationClasses}
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
          onConfirm={() => operationMode === 'MOVIMENTACAO'
            ? movementMutation.mutate({
              matriculaId: selectedStudent.matricula_id,
              tipo: movementType,
              motivo: reason,
              observacao: notes,
              dataMovimentacao: operationDate,
              dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
            })
            : operationMode === 'RETORNO'
              ? returnMutation.mutate({
                matriculaOrigemId: selectedStudent.matricula_id,
                turmaDestinoId: destinationClassId,
                motivo: reason,
                observacao: notes,
                dataRetorno: operationDate,
              })
            : transferType !== 'EXTERNA_ENVIADA'
              && (destinationClassesQuery.isError || destinationClassesQuery.isLoading)
              ? toast.error('Destino não carregado', 'Recarregue as turmas de destino antes de transferir.')
              : transferMutation.mutate({
              matriculaId: selectedStudent.matricula_id,
              tipo: transferType,
              motivo: reason,
              turmaDestinoId: transferType === 'EXTERNA_ENVIADA' ? undefined : destinationClassId,
              instituicaoDestino: transferType === 'EXTERNA_ENVIADA' ? destinationInstitution : undefined,
              observacao: notes,
              dataTransferencia: operationDate,
            })}
        />
      )}

      {historyStudent && (
        <MovimentacaoHistoricoModal
          student={historyStudent}
          movements={selectedHistory}
          onClose={() => setHistoryStudent(null)}
        />
      )}

      <RemoveEnrollmentConfirm
        student={studentToRemove}
        pending={removeEnrollmentMutation.isPending}
        readOnly={isReadOnly}
        onClose={() => setStudentToRemove(null)}
        onConfirm={(matriculaId) => removeEnrollmentMutation.mutate(matriculaId)}
      />

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAlunos;
