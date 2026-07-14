import React, { useState } from 'react';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import ConfirmModal from '../../../../components/ConfirmModal';
import { AcademicMovementType, AcademicStudent } from '../academic-lifecycle.service';
import { isValidStudentCpf } from '../turma-alunos.service';
import ConfirmarMatriculaModal, { EnrollmentFinance, EnrollmentStep } from './alunos/ConfirmarMatriculaModal';
import MatricularAlunoModal from './alunos/MatricularAlunoModal';
import MovimentacaoAlunoModal, { OperationMode, TransferType } from './alunos/MovimentacaoAlunoModal';
import TurmaAlunosTable from './alunos/TurmaAlunosTable';
import TurmaAlunosHeader from './alunos/TurmaAlunosHeader';
import TurmaAlunosQueryState from './alunos/TurmaAlunosQueryState';
import {
  useAvailableStudents,
  useDestinationClasses,
  useTurmaFinanceiroMatriculaConfig,
  useTurmaStudents,
  usePrevisaoFinanceiraTurma,
} from '../hooks/useTurmaAlunosQueries';
import {
  useEnrollStudentMutation,
  useMovementMutation,
  useRemoveEnrollmentMutation,
  useTransferMutation,
  useTurmaAcademicInvalidation,
} from '../hooks/useTurmaAlunosMutations';
import { getTechnicalEnrollmentMissingFields } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { getMaceioIsoDate } from '../../technicalClassDates';

interface TurmaAlunosProps {
  turma: Turma;
}

interface EnrollmentFlagConfig {
  financeiro_herdado: boolean;
  gerar_cobranca_inicial: boolean;
  gerar_cobranca_futura: boolean | null;
  sincronizar_asaas: boolean | null;
}

const ENROLLMENT_PHASES = new Set(['PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO']);

const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<any>(null);
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>('PREVIEW');
  const [enrollmentFinance, setEnrollmentFinance] = useState<EnrollmentFinance>({
    valorMatricula: turma.valorMatricula || 0,
    valorParcela: turma.valorParcela || 0,
    valorRematricula: turma.valorRematricula || 0,
    dataVencimentoMatricula: getMaceioIsoDate(),
    diaVencimento: 10,
  });
  const [enrollmentFlags, setEnrollmentFlags] = useState<EnrollmentFlagConfig>({
    financeiro_herdado: turma.financeiroHerdado || false,
    gerar_cobranca_inicial: !(turma.origemFinanceira === 'LEGADO' || turma.financeiroHerdado),
    gerar_cobranca_futura: turma.gerarCobrancasFuturas ?? null,
    sincronizar_asaas: turma.sincronizarAsaasFuturo ?? true,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<AcademicStudent | null>(null);
  const [studentToRemove, setStudentToRemove] = useState<AcademicStudent | null>(null);
  const [operationMode, setOperationMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<TransferType>('INTERNA_TURMA');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');
  const requireTechnicalProfile = String(turma.modalidade || '').toUpperCase() === 'TECNICO';
  const turmaStatus = String(turma.status || '').toUpperCase();
  const canEnroll = ENROLLMENT_PHASES.has(turmaStatus);
  const isReadOnly = turmaStatus === 'FINALIZADA';

  const studentsQuery = useTurmaStudents(turma.id);
  const students = studentsQuery.data || [];
  const availableStudentsQuery = useAvailableStudents(
    turma.id,
    students,
    showMatricularModal,
    searchTerm,
  );
  const financeiroConfigQuery = useTurmaFinanceiroMatriculaConfig(
    turma.id,
    canEnroll && (showMatricularModal || !!pendingEnrollment),
  );
  const turmaFinanceiroConfig = financeiroConfigQuery.data;
  const previsaoQuery = usePrevisaoFinanceiraTurma(turma.id, !!pendingEnrollment && !!turmaFinanceiroConfig);
  const destinationClassesQuery = useDestinationClasses(
    turma.id,
    !!selectedStudent && operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA',
  );
  const destinationClasses = destinationClassesQuery.data || [];
  const invalidateAcademicData = useTurmaAcademicInvalidation(turma.id);
  const enrollMutation = useEnrollStudentMutation(
    turma.id,
    async (result) => {
      await invalidateAcademicData();
      setShowMatricularModal(false);
      setPendingEnrollment(null);
      setEnrollmentStep('PREVIEW');
      setSearchTerm('');
    if (result.asaasSynced) {
      toast.success(
        'Matrícula e cobrança inicial geradas',
        'O aluno foi vinculado à turma. O carnê com mensalidades será gerado após a confirmação da matrícula inicial.'
      );
    } else if (result.asaasSkipped) {
      toast.success(
        'Matrícula criada sem envio ao Asaas',
        result.asaasSkipReason || 'A regra financeira da turma/matrícula não exige sincronização no gateway.'
      );
    } else {
      toast.warning(
        'Matrícula criada; sincronização pendente',
        result.asaasError
          ? `A cobrança local foi criada, mas o Asaas respondeu: ${result.asaasError}`
          : 'A matrícula foi criada, mas não houve confirmação de sincronização no gateway.'
      );
    }
    },
    (error: any) => toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no Asaas: ${error.message}`),
  );

  const confirmEnrollment = (student: any) => {
    if (!canEnroll || financeiroConfigQuery.isError || financeiroConfigQuery.isLoading || !turmaFinanceiroConfig) {
      toast.error('Matrícula indisponível', 'A fase da turma e a configuração financeira precisam estar carregadas antes da matrícula.');
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

    const defaults = turmaFinanceiroConfig;
    const financeiroHerdado = defaults.financeiroHerdado || defaults.origemFinanceira === 'LEGADO';
    const gerarCobrancaInicial = defaults.origemFinanceira === 'NORMAL' && !financeiroHerdado;
    const deveSincronizarAsaas = gerarCobrancaInicial && (defaults.sincronizarAsaasFuturo ?? true);

    if (deveSincronizarAsaas && !isValidStudentCpf(student.cpf_cnpj)) {
      toast.error(
        'CPF inválido para cobrança',
        'Atualize o CPF do aluno com um documento válido antes de gerar a matrícula no Asaas.'
      );
      return;
    }

      setEnrollmentFinance({
        valorMatricula: defaults.valorMatricula,
        valorParcela: defaults.valorParcela,
        valorRematricula: defaults.valorRematricula,
        dataVencimentoMatricula: getMaceioIsoDate(),
        diaVencimento: defaults.diaVencimento,
      });
      setEnrollmentFlags({
        financeiro_herdado: financeiroHerdado,
        gerar_cobranca_inicial: gerarCobrancaInicial,
        gerar_cobranca_futura: defaults.gerarCobrancasFuturas ?? null,
        sincronizar_asaas: defaults.sincronizarAsaasFuturo ?? true,
      });
      setEnrollmentStep('PREVIEW');
      setPendingEnrollment(student);
    };

  const closeEnrollmentConfirmation = () => {
    setPendingEnrollment(null);
    setEnrollmentStep('PREVIEW');
  };
  const updateEnrollmentFinance = (field: keyof typeof enrollmentFinance, value: string) => {
    setEnrollmentFinance((current) => ({
      ...current,
      [field]: field === 'dataVencimentoMatricula'
        ? value
        : Number(value) || 0,
    }));
  };
  const confirmEnrollmentFinance = () => {
    if (!pendingEnrollment) return;
    if (!canEnroll || !turmaFinanceiroConfig || financeiroConfigQuery.isError) {
      toast.error('Configuração não carregada', 'Recarregue os dados financeiros antes de confirmar a matrícula.');
      return;
    }
    if (!enrollmentFinance.dataVencimentoMatricula) {
      toast.error('Vencimento obrigatório', 'Informe a data de vencimento da matrícula.');
      return;
    }
    if (enrollmentFlags.gerar_cobranca_inicial && enrollmentFinance.valorMatricula <= 0) {
      toast.error('Valor obrigatório', 'Informe o valor da matrícula para gerar a cobrança inicial.');
      return;
    }
    if (enrollmentFlags.gerar_cobranca_futura && enrollmentFinance.valorParcela <= 0) {
      toast.error('Valor obrigatório', 'Informe o valor da mensalidade para gerar cobranças futuras.');
      return;
    }
    enrollMutation.mutate({
      alunoId: pendingEnrollment.id,
      ...enrollmentFlags,
      ...enrollmentFinance,
    });
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
    setOperationMode('TRANSFERENCIA');
    setTransferType('INTERNA_TURMA');
  };

  if (studentsQuery.isLoading || studentsQuery.isError) return (
    <TurmaAlunosQueryState {...studentsQuery} onRetry={() => { void studentsQuery.refetch(); }} />
  );

  return (
    <div className="animate-fadeIn">
      <TurmaAlunosHeader totalStudents={students.length} onEnroll={openEnrollmentSearch} canEnroll={canEnroll} />

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <TurmaAlunosTable
          students={students}
          readOnly={isReadOnly}
          onOpenMovement={openMovement}
          onOpenTransfer={openTransfer}
          onRemoveEnrollment={setStudentToRemove}
        />
      </div>

      {showMatricularModal && (
        <MatricularAlunoModal
          searchTerm={searchTerm}
          loadingAvailable={availableStudentsQuery.isLoading || financeiroConfigQuery.isLoading}
          enrollPending={enrollMutation.isPending || financeiroConfigQuery.isLoading}
          loadError={financeiroConfigQuery.isError
            ? 'A configuração financeira da turma não foi carregada. A matrícula foi bloqueada.'
            : availableStudentsQuery.isError
              ? 'A busca de alunos falhou. Nenhuma matrícula pode ser iniciada com dados incompletos.'
              : null}
          retrying={availableStudentsQuery.isFetching || financeiroConfigQuery.isFetching}
          students={availableStudentsQuery.filteredAvailableStudents}
          requireTechnicalProfile={requireTechnicalProfile}
          onSearchChange={setSearchTerm}
          onConfirmStudent={confirmEnrollment}
          onRetry={() => { void Promise.all([financeiroConfigQuery.refetch(), availableStudentsQuery.refetch()]); }}
          onClose={closeEnrollmentSearch}
        />
      )}

      {pendingEnrollment && (
        <ConfirmarMatriculaModal
          turma={turma}
          student={pendingEnrollment}
          step={enrollmentStep}
          finance={enrollmentFinance}
          turmaFinanceiroConfig={turmaFinanceiroConfig}
          previsao={previsaoQuery.data}
          enrollmentFlags={enrollmentFlags}
          onFlagsChange={setEnrollmentFlags}
          isPending={enrollMutation.isPending}
          onStepChange={setEnrollmentStep}
          onFinanceChange={updateEnrollmentFinance}
          onClose={closeEnrollmentConfirmation}
          onConfirm={confirmEnrollmentFinance}
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
          returnDate={returnDate}
          destinationClassId={destinationClassId}
          destinationInstitution={destinationInstitution}
          destinationClasses={destinationClasses}
          movementPending={movementMutation.isPending}
          transferPending={transferMutation.isPending}
          destinationError={destinationClassesQuery.isError}
          destinationRetrying={destinationClassesQuery.isFetching}
          onOperationModeChange={setOperationMode}
          onMovementTypeChange={setMovementType}
          onTransferTypeChange={setTransferType}
          onReasonChange={setReason}
          onNotesChange={setNotes}
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
              dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
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
            })}
        />
      )}

      <ConfirmModal
        isOpen={!!studentToRemove}
        onClose={() => setStudentToRemove(null)}
        onConfirm={() => {
          if (studentToRemove && !isReadOnly) {
            removeEnrollmentMutation.mutate(studentToRemove.matricula_id);
          }
        }}
        title="Remover aluno"
        message={`Remover ${studentToRemove?.nome || 'este aluno'} apaga a matrícula desta turma e as cobranças vinculadas. Se houver diário, notas, frequência ou a turma já tiver começado, o banco bloqueará e você deve usar o cancelamento.`}
        confirmText={removeEnrollmentMutation.isPending ? 'Removendo...' : 'Remover'}
        cancelText="Voltar"
        variant="danger"
      />

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAlunos;
