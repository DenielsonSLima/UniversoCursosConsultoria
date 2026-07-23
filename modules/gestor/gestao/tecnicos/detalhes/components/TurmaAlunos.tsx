import React, { useState } from 'react';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { AcademicMovementType, AcademicStudent } from '../academic-lifecycle.service';
import { isValidStudentCpf } from '../turma-alunos.service';
import ConfirmarMatriculaModal, { EnrollmentFinance, EnrollmentStep } from './alunos/ConfirmarMatriculaModal';
import MatricularAlunoModal from './alunos/MatricularAlunoModal';
import MovimentacaoAlunoModal, { OperationMode, TransferType } from './alunos/MovimentacaoAlunoModal';
import TurmaAlunosTable from './alunos/TurmaAlunosTable';
import TurmaAlunosHeader from './alunos/TurmaAlunosHeader';
import TurmaAlunosQueryState from './alunos/TurmaAlunosQueryState';
import RemoveEnrollmentConfirm from './alunos/RemoveEnrollmentConfirm';
import { ENROLLMENT_PHASES, EnrollmentFlagConfig } from './alunos/turmaAlunos.config';
import {
  useAvailableStudents,
  useDestinationClasses,
  useEnrollmentPaymentOptions,
  useTurmaFinanceiroMatriculaConfig,
  useTurmaStudents,
  usePrevisaoFinanceiraTurma,
} from '../hooks/useTurmaAlunosQueries';
import {
  useEnrollStudentMutation,
  useMovementMutation,
  useRemoveEnrollmentMutation,
  useReturnEnrollmentMutation,
  useTransferMutation,
  useTurmaAcademicInvalidation,
} from '../hooks/useTurmaAlunosMutations';
import { getTechnicalEnrollmentMissingFields } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { getMaceioIsoDate } from '../../technicalClassDates';
import type { GatewayPaymentMethod } from '../../../../../asaas/asaas.service';

interface TurmaAlunosProps {
  turma: Turma;
}
const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<any>(null);
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>('MATRICULA');
  const [enrollmentFinance, setEnrollmentFinance] = useState<EnrollmentFinance>({
    valorMatricula: turma.valorMatricula || 0,
    valorParcela: turma.valorParcela || 0,
    valorRematricula: turma.valorRematricula || 0,
    descontoPontualidade: turma.descontoPontualidade || 0,
    jurosAtraso: turma.jurosAtraso || 0,
    multaAtraso: turma.multaAtraso || 0,
    dataVencimentoMatricula: getMaceioIsoDate(),
    diaVencimento: 10,
  });
  const [enrollmentFlags, setEnrollmentFlags] = useState<EnrollmentFlagConfig>({
    financeiro_herdado: turma.financeiroHerdado || false,
    gerar_cobranca_inicial: !(turma.origemFinanceira === 'LEGADO' || turma.financeiroHerdado),
    gerar_cobranca_futura: turma.gerarCobrancasFuturas ?? null,
    sincronizar_asaas: turma.sincronizarAsaasFuturo ?? true,
  });
  const [enrollmentPaymentMethod, setEnrollmentPaymentMethod] = useState<GatewayPaymentMethod | null>(null);
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
  const paymentOptionsQuery = useEnrollmentPaymentOptions(
    turma.id,
    !!pendingEnrollment
      && enrollmentFlags.gerar_cobranca_inicial
      && enrollmentFlags.sincronizar_asaas !== false,
  );
  const paymentOptionsEnvironment = paymentOptionsQuery.data?.environment || 'sandbox';
  const availablePaymentMethods = (paymentOptionsQuery.data?.options || [])
    .map((option) => option.paymentMethod);
  const destinationClassesQuery = useDestinationClasses(
    turma.id,
    !!selectedStudent && (
      operationMode === 'RETORNO'
      || (operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA')
    ),
  );
  const destinationClasses = destinationClassesQuery.data || [];
  const invalidateAcademicData = useTurmaAcademicInvalidation(turma.id);
  const enrollMutation = useEnrollStudentMutation(
    turma.id,
    async (result) => {
      await invalidateAcademicData();
      setShowMatricularModal(false);
      setPendingEnrollment(null);
      setEnrollmentStep('MATRICULA');
      setSearchTerm('');
    if (result.asaasSynced) {
      toast.success(
        'Matrícula e cobrança inicial geradas',
        'O aluno foi vinculado à turma. O carnê com mensalidades será gerado após a confirmação da matrícula inicial.'
      );
    } else if (result.asaasSkipped) {
      toast.success(
        'Matrícula criada sem envio ao gateway',
        result.asaasSkipReason || 'A regra financeira da turma/matrícula não exige sincronização no gateway.'
      );
    } else {
      toast.info(
        'Matrícula criada; sincronização pendente',
        result.asaasError
          ? `A cobrança local foi criada, mas o gateway respondeu: ${result.asaasError}`
          : 'A matrícula foi criada, mas não houve confirmação de sincronização no gateway.'
      );
    }
    },
    (error: any) => toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no gateway: ${error.message}`),
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
    const deveSincronizarGateway = gerarCobrancaInicial && (defaults.sincronizarAsaasFuturo ?? true);

    if (deveSincronizarGateway && !isValidStudentCpf(student.cpf_cnpj)) {
      toast.error(
        'CPF inválido para cobrança',
        'Atualize o CPF do aluno com um documento válido antes de gerar a cobrança no gateway.'
      );
      return;
    }

      setEnrollmentFinance({
        valorMatricula: defaults.valorMatricula,
        valorParcela: defaults.valorParcela,
        valorRematricula: defaults.valorRematricula,
        descontoPontualidade: defaults.descontoPontualidade,
        jurosAtraso: defaults.jurosAtraso,
        multaAtraso: defaults.multaAtraso,
        dataVencimentoMatricula: getMaceioIsoDate(),
        diaVencimento: defaults.diaVencimento,
      });
      setEnrollmentFlags({
        financeiro_herdado: financeiroHerdado,
        gerar_cobranca_inicial: gerarCobrancaInicial,
        gerar_cobranca_futura: defaults.gerarCobrancasFuturas ?? null,
        sincronizar_asaas: defaults.sincronizarAsaasFuturo ?? true,
      });
      setEnrollmentPaymentMethod(null);
      setEnrollmentStep('MATRICULA');
      setPendingEnrollment(student);
    };

  const closeEnrollmentConfirmation = () => {
    setPendingEnrollment(null);
    setEnrollmentStep('MATRICULA');
    setEnrollmentPaymentMethod(null);
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
    if (enrollmentFlags.gerar_cobranca_inicial && !enrollmentPaymentMethod) {
      toast.error('Método obrigatório', 'Escolha Pix, boleto ou cartão de crédito para a cobrança inicial.');
      setEnrollmentStep('MATRICULA');
      return;
    }
    if (
      enrollmentFlags.gerar_cobranca_inicial
      && enrollmentFlags.sincronizar_asaas !== false
      && (
        paymentOptionsQuery.isLoading
        || paymentOptionsQuery.isError
        || !enrollmentPaymentMethod
        || !availablePaymentMethods.includes(enrollmentPaymentMethod)
      )
    ) {
      toast.error(
        'Rota bancária indisponível',
        paymentOptionsQuery.isError
          ? 'Não foi possível validar as rotas bancárias. Atualize a tela e tente novamente.'
          : 'Escolha um método que possua rota ativa e credencial pronta neste ambiente.',
      );
      return;
    }
    if (enrollmentFlags.gerar_cobranca_futura && enrollmentFinance.valorParcela <= 0) {
      toast.error('Valor obrigatório', 'Informe o valor da mensalidade para gerar cobranças futuras.');
      return;
    }
    if (enrollmentFinance.jurosAtraso < 0 || enrollmentFinance.jurosAtraso > 100) {
      toast.error('Juros inválidos', 'Informe juros mensais entre 0% e 100%.');
      return;
    }
    const descontoInvalido = (
      (turmaFinanceiroConfig.aplicarDescontoMatricula
        && enrollmentFinance.valorMatricula > 0
        && enrollmentFinance.descontoPontualidade >= enrollmentFinance.valorMatricula)
      || (turmaFinanceiroConfig.aplicarDescontoMensalidade
        && enrollmentFinance.valorParcela > 0
        && enrollmentFinance.descontoPontualidade >= enrollmentFinance.valorParcela)
      || (turmaFinanceiroConfig.aplicarDescontoRematricula
        && enrollmentFinance.valorRematricula > 0
        && enrollmentFinance.descontoPontualidade >= enrollmentFinance.valorRematricula)
    );
    if (enrollmentFinance.descontoPontualidade > 0 && descontoInvalido) {
      toast.error('Desconto inválido', 'O desconto deve ser menor que cada cobrança em que ele será aplicado.');
      return;
    }
    enrollMutation.mutate({
      alunoId: pendingEnrollment.id,
      paymentMethod: enrollmentPaymentMethod,
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
    <div className="">
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
          paymentMethod={enrollmentPaymentMethod}
          availablePaymentMethods={availablePaymentMethods}
          paymentOptionsLoading={paymentOptionsQuery.isLoading}
          paymentOptionsError={paymentOptionsQuery.isError}
          paymentOptionsEnvironment={paymentOptionsEnvironment}
          onFlagsChange={setEnrollmentFlags}
          onPaymentMethodChange={setEnrollmentPaymentMethod}
          isPending={enrollMutation.isPending || paymentOptionsQuery.isLoading}
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
          returnPending={returnMutation.isPending}
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
            : operationMode === 'RETORNO'
              ? returnMutation.mutate({
                matriculaOrigemId: selectedStudent.matricula_id,
                turmaDestinoId: destinationClassId,
                motivo: reason,
                observacao: notes,
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
