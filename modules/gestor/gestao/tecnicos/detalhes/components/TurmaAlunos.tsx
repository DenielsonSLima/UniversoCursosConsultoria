import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RotateCcw,
  Search,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import { supabase } from '../../../../../../lib/supabase';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import {
  AcademicMovementType,
  AcademicStudent,
  academicLifecycleService,
} from '../academic-lifecycle.service';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { asaasIntegrationService } from '../../../../../asaas/asaas.service';

interface TurmaAlunosProps {
  turma: Turma;
}

type OperationMode = 'MOVIMENTACAO' | 'TRANSFERENCIA';

const movementLabels: Record<AcademicMovementType, string> = {
  TRANCAMENTO: 'Trancar matrícula',
  CANCELAMENTO: 'Cancelar matrícula',
  DESISTENCIA: 'Registrar desistência',
  REATIVACAO: 'Reativar matrícula',
  CONCLUSAO: 'Concluir matrícula',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const isValidCpf = (value?: string | null) => {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split('').reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

const TurmaAlunos: React.FC<TurmaAlunosProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const responsavelId = window.sessionStorage.getItem('logged_user_id');
  const [showMatricularModal, setShowMatricularModal] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<AcademicStudent | null>(null);
  const [operationMode, setOperationMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA'>('INTERNA_TURMA');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');

  const { data: students = [], isLoading } = useQuery({
    queryKey: academicLifecycleKeys.alunos(turma.id),
    queryFn: () => academicLifecycleService.getStudents(turma.id),
    staleTime: 15_000,
  });

  const { data: availableStudents = [], isLoading: loadingAvailable } = useQuery({
    queryKey: [...academicLifecycleKeys.alunos(turma.id), 'disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome, cpf_cnpj')
        .eq('tipo', 'Aluno')
        .eq('status', 'ATIVO')
        .order('nome');
      if (error) throw error;
      const enrolledIds = new Set(students.map((student) => student.aluno_id));
      return (data || []).filter((student) => !enrolledIds.has(student.id));
    },
    enabled: showMatricularModal,
  });

  const { data: destinationClasses = [] } = useQuery({
    queryKey: academicLifecycleKeys.turmasDestino(turma.id),
    queryFn: () => academicLifecycleService.getTurmasDestino(turma.id),
    enabled: !!selectedStudent && operationMode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA',
  });

  const invalidateAcademicData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
      queryClient.invalidateQueries({ queryKey: ['gestao-kpis'] }),
      queryClient.invalidateQueries({ queryKey: ['diario-alunos', turma.id] }),
    ]);
  };

  const enrollMutation = useMutation({
    mutationFn: async (alunoId: string) => {
      await asaasIntegrationService.testConnection();
      const matricula = await academicLifecycleService.matricularAluno(turma.id, alunoId, responsavelId);
      try {
        await asaasIntegrationService.syncEnrollment(matricula.id);
        return { matricula, asaasSynced: true };
      } catch (error) {
        console.error('Matrícula criada, mas a cobrança Asaas não foi sincronizada:', error);
        return {
          matricula,
          asaasSynced: false,
          asaasError: error instanceof Error ? error.message : 'Falha na integração Asaas',
        };
      }
    },
    onSuccess: async (result) => {
      await invalidateAcademicData();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['turma-financeiro', turma.id] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] }),
        queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables'] }),
      ]);
      setShowMatricularModal(false);
      setPendingEnrollment(null);
      setSearchTerm('');
      if (result.asaasSynced) {
        toast.success(
          'Matrícula e cobrança inicial geradas',
          'O aluno foi vinculado à turma. As demais parcelas serão geradas após a confirmação da matrícula inicial.'
        );
      } else {
        toast.warning(
          'Matrícula criada; sincronização pendente',
          `A cobrança local foi criada, mas o Asaas respondeu: ${result.asaasError}`
        );
      }
    },
    onError: (error: any) => toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no Asaas: ${error.message}`),
  });

  const confirmEnrollment = (student: any) => {
    if (!isValidCpf(student.cpf_cnpj)) {
      toast.error(
        'CPF inválido para cobrança',
        'Atualize o CPF do aluno com um documento válido antes de gerar a matrícula no Asaas.'
      );
      return;
    }

    setPendingEnrollment(student);
  };

  const movementMutation = useMutation({
    mutationFn: () => academicLifecycleService.movimentar({
      matriculaId: selectedStudent!.matricula_id,
      tipo: movementType,
      motivo: reason,
      observacao: notes,
      dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
      responsavelId,
    }),
    onSuccess: async () => {
      await invalidateAcademicData();
      closeOperationModal();
      toast.success('Movimentação registrada', 'O histórico acadêmico da matrícula foi atualizado.');
    },
    onError: (error: any) => toast.error('Movimentação não realizada', error.message),
  });

  const transferMutation = useMutation({
    mutationFn: () => academicLifecycleService.transferir({
      matriculaId: selectedStudent!.matricula_id,
      tipo: transferType,
      motivo: reason,
      turmaDestinoId: transferType === 'EXTERNA_ENVIADA' ? undefined : destinationClassId,
      instituicaoDestino: transferType === 'EXTERNA_ENVIADA' ? destinationInstitution : undefined,
      observacao: notes,
      responsavelId,
    }),
    onSuccess: async () => {
      await invalidateAcademicData();
      if (destinationClassId) {
        await queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(destinationClassId) });
      }
      closeOperationModal();
      toast.success('Transferência concluída', 'A matrícula de origem foi preservada no histórico.');
    },
    onError: (error: any) => toast.error('Transferência não realizada', error.message),
  });

  const filteredAvailableStudents = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase('pt-BR');
    if (!search) return availableStudents;
    return availableStudents.filter((student: any) =>
      student.nome.toLocaleLowerCase('pt-BR').includes(search)
      || student.cpf_cnpj?.includes(searchTerm.trim())
    );
  }, [availableStudents, searchTerm]);

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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ATIVO': return 'bg-emerald-100 text-emerald-700';
      case 'TRANCADO': return 'bg-amber-100 text-amber-700';
      case 'DESISTENTE':
      case 'CANCELADO': return 'bg-rose-100 text-rose-700';
      case 'TRANSFERIDO': return 'bg-violet-100 text-violet-700';
      case 'CONCLUIDO': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-600';
    }
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
        {students.length === 0 ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center">
            <UserX size={48} className="mb-4 opacity-50 text-slate-300" />
            <p className="font-bold text-sm">Nenhuma matrícula registrada nesta turma.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left border-collapse">
              <thead className="bg-[#001a33] text-white">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Aluno</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Matrícula</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Situação</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.matricula_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500 border border-slate-200">
                          {student.nome.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-[#001a33] text-sm block">{student.nome}</span>
                          <span className="text-[10px] text-slate-500">
                            CPF: {student.cpf || 'Não informado'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-500 font-mono">
                      {formatMatricula(student.matricula_id, student.data_matricula)}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${getStatusStyle(student.status)}`}>
                        {student.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      {student.frequencia_percent === null ? (
                        <span className="text-[10px] font-bold uppercase text-slate-400">Sem lançamentos</span>
                      ) : (
                        <span className="text-sm font-black text-slate-700">{student.frequencia_percent}%</span>
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openMovement(student)}
                          disabled={student.status === 'TRANSFERIDO' || student.status === 'CONCLUIDO'}
                          title="Movimentar matrícula"
                          className="p-2.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status)
                            ? <RotateCcw size={16} />
                            : <PauseCircle size={16} />}
                        </button>
                        <button
                          onClick={() => openTransfer(student)}
                          disabled={student.status !== 'ATIVO'}
                          title="Transferir aluno"
                          className="p-2.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showMatricularModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-black text-[#001a33] text-lg uppercase">Matricular aluno</h3>
                <p className="text-xs text-slate-500">A matrícula será registrada no histórico acadêmico.</p>
              </div>
              <button onClick={() => setShowMatricularModal(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nome ou CPF..."
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {loadingAvailable ? (
                <Loader2 className="animate-spin text-emerald-600 mx-auto my-12" />
              ) : filteredAvailableStudents.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-12">Nenhum aluno disponível.</p>
              ) : filteredAvailableStudents.map((student: any) => (
                <div key={student.id} className="p-4 rounded-2xl border border-slate-100 flex justify-between items-center gap-4">
                  <div>
                    <p className="font-bold text-[#001a33]">{student.nome}</p>
                    <p className="text-xs text-slate-500">{student.cpf_cnpj || 'CPF não informado'}</p>
                  </div>
                  <button
                    onClick={() => confirmEnrollment(student)}
                    disabled={enrollMutation.isPending}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase disabled:opacity-50"
                  >
                    Matricular
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingEnrollment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Confirmação de matrícula</p>
                <h3 className="mt-1 text-xl font-black">{pendingEnrollment.nome}</h3>
              </div>
              <button onClick={() => setPendingEnrollment(null)} className="rounded-full p-2 text-blue-200 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm font-semibold leading-relaxed text-slate-600">
                Ao confirmar, o sistema vai matricular o aluno na turma <strong className="text-[#001a33]">{turma.nome}</strong>,
                gerar o Contas a Receber e criar a cobrança inicial no Asaas.
              </p>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Valor da matrícula</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{formatCurrency(turma.valorMatricula || 0)}</p>
              </div>
              <p className="rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-500">
                Depois que o pagamento for confirmado no Asaas, a baixa será automática no sistema e as próximas parcelas da turma serão geradas.
              </p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setPendingEnrollment(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                  Cancelar
                </button>
                <button
                  onClick={() => enrollMutation.mutate(pendingEnrollment.id)}
                  disabled={enrollMutation.isPending}
                  className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  {enrollMutation.isPending ? 'Gerando...' : 'Confirmar e gerar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="p-6 bg-[#001a33] text-white flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Movimentação acadêmica</p>
                <h3 className="font-black text-xl mt-1">{selectedStudent.nome}</h3>
              </div>
              <button onClick={closeOperationModal} className="p-2 text-blue-200 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  onClick={() => setOperationMode('MOVIMENTACAO')}
                  className={`py-2.5 rounded-lg text-xs font-black uppercase ${operationMode === 'MOVIMENTACAO' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500'}`}
                >
                  Situação
                </button>
                <button
                  onClick={() => setOperationMode('TRANSFERENCIA')}
                  disabled={selectedStudent.status !== 'ATIVO'}
                  className={`py-2.5 rounded-lg text-xs font-black uppercase disabled:opacity-40 ${operationMode === 'TRANSFERENCIA' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}
                >
                  Transferência
                </button>
              </div>

              {operationMode === 'MOVIMENTACAO' ? (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Operação</label>
                  <select
                    value={movementType}
                    onChange={(event) => setMovementType(event.target.value as AcademicMovementType)}
                    className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-700"
                  >
                    {['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(selectedStudent.status) ? (
                      <option value="REATIVACAO">{movementLabels.REATIVACAO}</option>
                    ) : (
                      <>
                        <option value="TRANCAMENTO">{movementLabels.TRANCAMENTO}</option>
                        <option value="CANCELAMENTO">{movementLabels.CANCELAMENTO}</option>
                        <option value="DESISTENCIA">{movementLabels.DESISTENCIA}</option>
                        <option value="CONCLUSAO">{movementLabels.CONCLUSAO}</option>
                      </>
                    )}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Tipo de transferência</label>
                    <select
                      value={transferType}
                      onChange={(event) => setTransferType(event.target.value as typeof transferType)}
                      className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500 font-bold text-slate-700"
                    >
                      <option value="INTERNA_TURMA">Entre turmas</option>
                      <option value="INTERNA_POLO">Entre polos</option>
                      <option value="EXTERNA_ENVIADA">Para outra instituição</option>
                    </select>
                  </div>
                  {transferType === 'EXTERNA_ENVIADA' ? (
                    <input
                      value={destinationInstitution}
                      onChange={(event) => setDestinationInstitution(event.target.value)}
                      placeholder="Instituição de destino"
                      className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
                    />
                  ) : (
                    <select
                      value={destinationClassId}
                      onChange={(event) => setDestinationClassId(event.target.value)}
                      className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
                    >
                      <option value="">Selecione a turma de destino...</option>
                      {destinationClasses.map((destination: any) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.nome} — {destination.polos?.nome || 'Polo não informado'}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Motivo obrigatório</label>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Descreva o motivo da operação"
                  className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>

              {operationMode === 'MOVIMENTACAO' && movementType === 'TRANCAMENTO' && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Retorno previsto</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                    className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Observações adicionais (opcional)"
                className="w-full min-h-24 p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 resize-none"
              />

              <div className="flex gap-3 pt-2">
                <button onClick={closeOperationModal} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-xs">
                  Cancelar
                </button>
                <button
                  onClick={() => operationMode === 'MOVIMENTACAO' ? movementMutation.mutate() : transferMutation.mutate()}
                  disabled={
                    !reason.trim()
                    || movementMutation.isPending
                    || transferMutation.isPending
                    || (operationMode === 'TRANSFERENCIA'
                      && transferType !== 'EXTERNA_ENVIADA'
                      && !destinationClassId)
                    || (operationMode === 'TRANSFERENCIA'
                      && transferType === 'EXTERNA_ENVIADA'
                      && !destinationInstitution.trim())
                  }
                  className="flex-[1.5] py-3 rounded-xl bg-[#001a33] text-white font-black uppercase text-xs disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {(movementMutation.isPending || transferMutation.isPending)
                    ? <Loader2 size={15} className="animate-spin" />
                    : operationMode === 'TRANSFERENCIA'
                      ? <ArrowRightLeft size={15} />
                      : movementType === 'REATIVACAO'
                        ? <RotateCcw size={15} />
                        : movementType === 'CONCLUSAO'
                          ? <CheckCircle2 size={15} />
                          : movementType === 'DESISTENCIA'
                            ? <Ban size={15} />
                            : <PauseCircle size={15} />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAlunos;
