import React, { useState } from 'react';
import {
  Loader2,
  UserPlus,
} from 'lucide-react';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { AcademicMovementType, AcademicStudent } from '../academic-lifecycle.service';
import { isValidStudentCpf } from '../turma-alunos.service';
import ConfirmarMatriculaModal, { EnrollmentFinance, EnrollmentStep } from './alunos/ConfirmarMatriculaModal';
import MatricularAlunoModal from './alunos/MatricularAlunoModal';
import MovimentacaoAlunoModal, { OperationMode, TransferType } from './alunos/MovimentacaoAlunoModal';
import TurmaAlunosTable from './alunos/TurmaAlunosTable';
import {
  useAvailableStudents,
  useDestinationClasses,
  useTurmaFinanceiroMatriculaConfig,
  useTurmaStudents,
} from '../hooks/useTurmaAlunosQueries';
import {
  useEnrollStudentMutation,
  useMovementMutation,
  useTransferMutation,
  useTurmaAcademicInvalidation,
} from '../hooks/useTurmaAlunosMutations';

interface TurmaAlunosProps {
  turma: Turma;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const responsavelId = window.sessionStorage.getItem('logged_user_id');
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<any>(null);
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>('PREVIEW');
  const [enrollmentFinance, setEnrollmentFinance] = useState<EnrollmentFinance>({
    valorMatricula: turma.valorMatricula || 0,
    valorParcela: turma.valorParcela || 0,
    valorRematricula: turma.valorRematricula || 0,
    dataVencimentoMatricula: todayISO(),
    diaVencimento: 10,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<AcademicStudent | null>(null);
  const [operationMode, setOperationMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<TransferType>('INTERNA_TURMA');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');

  const { data: students = [], isLoading } = useTurmaStudents(turma.id);
  const { filteredAvailableStudents, isLoading: loadingAvailable } = useAvailableStudents(
    turma.id,
    students,
    showMatricularModal,
    searchTerm,
  );
  const { data: turmaFinanceiroConfig } = useTurmaFinanceiroMatriculaConfig(
    turma.id,
    showMatricularModal || !!pendingEnrollment,
  );
  const { data: destinationClasses = [] } = useDestinationClasses(
    turma.id,
    !!selectedStudent && operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA',
  );
  const invalidateAcademicData = useTurmaAcademicInvalidation(turma.id);

  const enrollMutation = useEnrollStudentMutation(
    turma.id,
    responsavelId,
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
      } else {
        toast.warning(
          'Matrícula criada; sincronização pendente',
          `A cobrança local foi criada, mas o Asaas respondeu: ${result.asaasError}`
        );
      }
    },
    (error: any) => toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no Asaas: ${error.message}`),
  );

  const confirmEnrollment = (student: any) => {
    if (!isValidStudentCpf(student.cpf_cnpj)) {
      toast.error(
        'CPF inválido para cobrança',
        'Atualize o CPF do aluno com um documento válido antes de gerar a matrícula no Asaas.'
      );
      return;
    }

    const defaults = turmaFinanceiroConfig || {
      valorMatricula: turma.valorMatricula || 0,
      valorParcela: turma.valorParcela || 0,
      valorRematricula: turma.valorRematricula || 0,
      diaVencimento: 10,
    };
    setEnrollmentFinance({
      valorMatricula: defaults.valorMatricula,
      valorParcela: defaults.valorParcela,
      valorRematricula: defaults.valorRematricula,
      dataVencimentoMatricula: todayISO(),
      diaVencimento: defaults.diaVencimento,
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
    if (!enrollmentFinance.dataVencimentoMatricula) {
      toast.error('Vencimento obrigatório', 'Informe a data de vencimento da matrícula.');
      return;
    }
    if (enrollmentFinance.valorMatricula <= 0 || enrollmentFinance.valorParcela <= 0) {
      toast.error('Valor obrigatório', 'Informe o valor da matrícula e da mensalidade do aluno.');
      return;
    }
    enrollMutation.mutate({
      alunoId: pendingEnrollment.id,
      ...enrollmentFinance,
    });
  };

  const movementMutation = useMovementMutation(
    responsavelId,
    async () => {
      await invalidateAcademicData();
      closeOperationModal();
      toast.success('Movimentação registrada', 'O histórico acadêmico da matrícula foi atualizado.');
    },
    (error: any) => toast.error('Movimentação não realizada', error.message),
  );

  const transferMutation = useTransferMutation(
    responsavelId,
    async (_result, input) => {
      await invalidateAcademicData(input.turmaDestinoId);
      closeOperationModal();
      toast.success('Transferência concluída', 'A matrícula de origem foi preservada no histórico.');
    },
    (error: any) => toast.error('Transferência não realizada', error.message),
  );

  const closeOperationModal = () => {
    setSelectedStudent(null);
    setReason('');
    setNotes('');
    setReturnDate('');
    setDestinationClassId('');
    setDestinationInstitution('');
  };

  const openMovement = (student: AcademicStudent) => {
    setSelectedStudent(student);
    setOperationMode('MOVIMENTACAO');
    setMovementType(
      ['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status)
        ? 'REATIVACAO'
        : 'TRANCAMENTO'
    );
  };

  const openTransfer = (student: AcademicStudent) => {
    setSelectedStudent(student);
    setOperationMode('TRANSFERENCIA');
    setTransferType('INTERNA_TURMA');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando matrículas...</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-[#001a33] mb-1">Matrículas da Turma</h3>
          <p className="text-slate-500 text-xs">
            {students.length} registros preservados, incluindo alunos inativos e transferidos.
          </p>
        </div>
        <button
          onClick={() => setShowMatricularModal(true)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-md"
        >
          <UserPlus size={16} /> Matricular Aluno
        </button>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
        <TurmaAlunosTable
          students={students}
          onOpenMovement={openMovement}
          onOpenTransfer={openTransfer}
        />
      </div>

      {showMatricularModal && (
        <MatricularAlunoModal
          searchTerm={searchTerm}
          loadingAvailable={loadingAvailable}
          enrollPending={enrollMutation.isPending}
          students={filteredAvailableStudents}
          onSearchChange={setSearchTerm}
          onConfirmStudent={confirmEnrollment}
          onClose={() => setShowMatricularModal(false)}
        />
      )}

      {pendingEnrollment && (
        <ConfirmarMatriculaModal
          turma={turma}
          student={pendingEnrollment}
          step={enrollmentStep}
          finance={enrollmentFinance}
          turmaFinanceiroConfig={turmaFinanceiroConfig}
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
          onOperationModeChange={setOperationMode}
          onMovementTypeChange={setMovementType}
          onTransferTypeChange={setTransferType}
          onReasonChange={setReason}
          onNotesChange={setNotes}
          onReturnDateChange={setReturnDate}
          onDestinationClassChange={setDestinationClassId}
          onDestinationInstitutionChange={setDestinationInstitution}
          onClose={closeOperationModal}
          onConfirm={() => operationMode === 'MOVIMENTACAO'
            ? movementMutation.mutate({
              matriculaId: selectedStudent.matricula_id,
              tipo: movementType,
              motivo: reason,
              observacao: notes,
              dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
            })
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

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAlunos;
