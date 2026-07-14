import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  CalendarClock,
  ClipboardList,
  Loader2,
  PauseCircle,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import {
  AcademicMovementType,
  academicLifecycleService,
} from '../../../../gestao/tecnicos/detalhes/academic-lifecycle.service';
import { turmaAsaasService } from '../../../../gestao/tecnicos/detalhes/asaas';
import { getMaceioIsoDate } from '../../../../gestao/tecnicos/technicalClassDates';
import ToastNotification, { useToast } from '../../shared/ToastNotification';
import ParceiroAlunoMatriculasModals, {
  OperationMode,
  TransferType,
} from './ParceiroAlunoMatriculasModals';
import {
  enrollmentStatusStyle,
  formatEnrollmentDate,
  isValidEnrollmentCpf,
} from './parceiro-aluno-matriculas.utils';

interface Props { alunoId: string; }
const ParceiroAlunoMatriculas: React.FC<Props> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [newClassId, setNewClassId] = useState('');
  const [pendingNewEnrollment, setPendingNewEnrollment] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [mode, setMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<TransferType>('INTERNA_TURMA');
  const [destinationClassId, setDestinationClassId] = useState('');
  const [destinationInstitution, setDestinationInstitution] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [returnDate, setReturnDate] = useState('');

  const { data: matriculas = [], isLoading } = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'matriculas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select(`
          *,
          turmas(
            id, nome, codigo, turno, status, polo_id,
            cursos(id, nome, modalidade),
            polos(nome, cidade, estado),
            periodos_letivos(id, nome, ordem, status, data_inicio, data_fim)
          )
        `)
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });
  const { data: movements = [] } = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'matricula-movimentacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matricula_movimentacoes')
        .select(`
          *,
          turma_origem:turmas!matricula_movimentacoes_turma_origem_id_fkey(nome, codigo),
          turma_destino:turmas!matricula_movimentacoes_turma_destino_id_fkey(nome, codigo)
        `)
        .eq('aluno_id', alunoId)
        .order('data_movimentacao', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });
  const { data: aluno } = useQuery<any>({
    queryKey: ['parceiro', alunoId, 'dados-basicos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome, cpf_cnpj')
        .eq('id', alunoId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  const { data: allClasses = [] } = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'turmas-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turmas')
        .select(`
          id,
          nome,
          codigo,
          turno,
          status,
          valor_matricula,
          valor_rematricula,
          valor_parcela,
          dia_vencimento_padrao,
          origem_financeira,
          financeiro_herdado,
          gerar_cobrancas_futuras,
          sincronizar_asaas_futuro,
          cursos(id, nome, modalidade),
          polos(nome)
        `)
        .eq('status', 'EM_ANDAMENTO')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
  const destinationClasses = useMemo(
    () => allClasses.filter((item) =>
      item.id !== selected?.turma_id
      && (
        !selected?.turmas?.cursos?.id
        || item.cursos?.id === selected.turmas.cursos.id
      )
    ),
    [allClasses, selected]
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['parceiro', alunoId, 'matriculas'] }),
      queryClient.invalidateQueries({ queryKey: ['parceiro', alunoId, 'matricula-atual'] }),
      queryClient.invalidateQueries({ queryKey: ['parceiro', alunoId, 'matricula-movimentacoes'] }),
      queryClient.invalidateQueries({ queryKey: ['matriculas', alunoId] }),
      queryClient.invalidateQueries({ queryKey: ['financeiro-aluno-receivables', alunoId] }),
      queryClient.invalidateQueries({ queryKey: ['aluno-financeiro', alunoId] }),
      queryClient.invalidateQueries({ queryKey: ['financeiro-tecnico-recebiveis'] }),
    ]);
  };

  const newEnrollmentMutation = useMutation({
    mutationFn: async () => {
      const selectedClass = allClasses.find((item) => item.id === newClassId);
      const modalidade = selectedClass?.cursos?.modalidade;

      if (modalidade === 'TECNICO') {
        const origem = selectedClass?.origem_financeira || 'NORMAL';
        const financeiroHerdado = Boolean(selectedClass?.financeiro_herdado) || origem === 'LEGADO';

        return turmaAsaasService.matricularAlunoComCobranca({
          turmaId: newClassId,
          alunoId,
          valorMatricula: Number(selectedClass?.valor_matricula || 0),
          valorParcela: Number(selectedClass?.valor_parcela || 0),
          valorRematricula: Number(selectedClass?.valor_rematricula || 0),
          dataVencimentoMatricula: getMaceioIsoDate(),
          diaVencimento: Number(selectedClass?.dia_vencimento_padrao || 10),
          financeiro_herdado: financeiroHerdado,
          gerar_cobranca_inicial: !financeiroHerdado,
          gerar_cobranca_futura: selectedClass?.gerar_cobrancas_futuras ?? false,
          sincronizar_asaas: selectedClass?.sincronizar_asaas_futuro ?? true,
        });
      }

      const matricula = await academicLifecycleService.matricularAluno(newClassId, alunoId);
      return { matricula, asaasSynced: false };
    },
    onSuccess: async (result) => {
      await invalidate();
      setShowNew(false);
      setPendingNewEnrollment(null);
      setNewClassId('');
    },
    onError: (error: any) => {
      toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no Asaas: ${error.message}`);
    },
  });

  const confirmNewEnrollment = () => {
    const selectedClass = allClasses.find((item) => item.id === newClassId);
    if (!selectedClass) return;

    const isTechnical = selectedClass.cursos?.modalidade === 'TECNICO';
    const origem = selectedClass?.origem_financeira || 'NORMAL';
    const financeiroHerdado = Boolean(selectedClass?.financeiro_herdado) || origem === 'LEGADO';
    const deveSincronizarAsaas = isTechnical
      && !financeiroHerdado
      && (selectedClass?.sincronizar_asaas_futuro ?? true);

    if (deveSincronizarAsaas && !isValidEnrollmentCpf(aluno?.cpf_cnpj)) {
      toast.error(
        'CPF inválido para cobrança',
        'Atualize o CPF do aluno com um documento válido antes de gerar a matrícula no Asaas.'
      );
      return;
    }

    setPendingNewEnrollment(selectedClass);
  };

  const movementMutation = useMutation({
    mutationFn: () => academicLifecycleService.movimentar({
      matriculaId: selected.id,
      tipo: movementType,
      motivo: reason,
      observacao: notes,
      dataRetornoPrevista: movementType === 'TRANCAMENTO' ? returnDate || undefined : undefined,
    }),
    onSuccess: async () => {
      await invalidate();
      closeModal();
    },
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (selected.status !== 'ATIVO') {
        await academicLifecycleService.movimentar({
          matriculaId: selected.id,
          tipo: 'REATIVACAO',
          motivo: `Reativação necessária para transferência: ${reason}`,
          observacao: notes,
        });
      }
      return academicLifecycleService.transferir({
        matriculaId: selected.id,
        tipo: transferType,
        motivo: reason,
        turmaDestinoId: transferType === 'EXTERNA_ENVIADA' ? undefined : destinationClassId,
        instituicaoDestino: transferType === 'EXTERNA_ENVIADA' ? destinationInstitution : undefined,
        observacao: notes,
      });
    },
    onSuccess: async () => {
      await invalidate();
      closeModal();
    },
  });

  const closeModal = () => {
    setSelected(null);
    setReason('');
    setNotes('');
    setReturnDate('');
    setDestinationClassId('');
    setDestinationInstitution('');
  };

  const openOperation = (matricula: any, operationMode: OperationMode) => {
    setSelected(matricula);
    setMode(operationMode);
    setMovementType(
      ['TRANCADO', 'CANCELADO', 'DESISTENTE'].includes(matricula.status)
        ? 'REATIVACAO'
        : 'TRANCAMENTO'
    );
  };

  return (
    <div className="space-y-7 animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-600">
            <ClipboardList size={20} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Linha do tempo acadêmica</span>
          </div>
          <h3 className="mt-2 text-xl font-black uppercase text-[#001a33]">Matrículas e movimentações</h3>
          <p className="mt-1 text-xs text-slate-500">Cada turma mantém um registro próprio, sem apagar vínculos anteriores.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white">
          <Plus size={15} /> Nova matrícula
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>
      ) : (
        <div className="space-y-4">
          {matriculas.map((matricula) => {
            const turma = matricula.turmas || {};
            const currentPeriod = [...(turma.periodos_letivos || [])]
              .sort((a: any, b: any) => Number(a.ordem) - Number(b.ordem))
              .find((period: any) => period.status !== 'FECHADO');
            return (
              <article key={matricula.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${enrollmentStatusStyle[matricula.status] || 'bg-slate-50 text-slate-600'}`}>{matricula.status}</span>
                      <span className="text-[10px] font-bold text-slate-400">{formatMatricula(matricula.id, matricula.data_matricula, turma.polo_id)}</span>
                    </div>
                    <h4 className="mt-3 text-lg font-black text-[#001a33]">{turma.cursos?.nome || 'Curso'}</h4>
                    <p className="mt-1 text-xs font-bold text-slate-500">{turma.nome} · {turma.codigo} · {turma.turno}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{turma.polos?.nome} · {turma.polos?.cidade}/{turma.polos?.estado}</p>
                    {matricula.origem_matricula_id && (
                      <div className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700">
                        Continuidade de matrícula anterior · disciplinas aprovadas preservadas
                      </div>
                    )}
                  </div>
                  <div className="grid min-w-[300px] grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <span className="text-[9px] font-black uppercase text-slate-400">Ingresso</span>
                      <p className="mt-1 text-xs font-black text-slate-700">{formatEnrollmentDate(matricula.data_matricula)}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <span className="text-[9px] font-black uppercase text-slate-400">Etapa atual</span>
                      <p className="mt-1 text-xs font-black text-slate-700">{currentPeriod?.nome || 'Sem etapa aberta'}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                  {!['TRANSFERIDO', 'CONCLUIDO'].includes(matricula.status) && (
                    <button onClick={() => openOperation(matricula, 'MOVIMENTACAO')} className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[10px] font-black uppercase text-amber-700">
                      {matricula.status === 'ATIVO' ? <PauseCircle size={14} /> : <RotateCcw size={14} />} Movimentar
                    </button>
                  )}
                  {!['TRANSFERIDO', 'CONCLUIDO'].includes(matricula.status) && (
                    <button onClick={() => openOperation(matricula, 'TRANSFERENCIA')} className="flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2.5 text-[10px] font-black uppercase text-violet-700">
                      <ArrowRightLeft size={14} /> Transferir / continuar
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!matriculas.length && <p className="py-16 text-center text-sm text-slate-400">Nenhuma matrícula registrada.</p>}
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock size={17} className="text-slate-400" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[#001a33]">Histórico de movimentações</h4>
        </div>
        <div className="space-y-2">
          {movements.map((movement) => (
            <div key={movement.id} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
              <div className="min-w-0">
                <p className="text-xs font-black text-[#001a33]">{movement.tipo.replaceAll('_', ' ')}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">{formatEnrollmentDate(movement.data_movimentacao)} · {movement.status_anterior || 'INÍCIO'} → {movement.status_novo}</p>
                <p className="mt-1 text-xs text-slate-600">{movement.motivo}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ParceiroAlunoMatriculasModals
        open={showNew}
        classId={newClassId}
        classes={allClasses}
        pendingClass={pendingNewEnrollment}
        mutation={newEnrollmentMutation}
        onClassChange={setNewClassId}
        onPrepare={confirmNewEnrollment}
        onConfirm={() => newEnrollmentMutation.mutate()}
        onCloseEnrollment={() => setShowNew(false)}
        onCloseConfirmation={() => setPendingNewEnrollment(null)}
        selected={selected}
        mode={mode}
        movementType={movementType}
        transferType={transferType}
        destinationClassId={destinationClassId}
        destinationInstitution={destinationInstitution}
        destinationClasses={destinationClasses}
        reason={reason}
        notes={notes}
        returnDate={returnDate}
        movementMutation={movementMutation}
        transferMutation={transferMutation}
        onModeChange={setMode}
        onMovementTypeChange={setMovementType}
        onTransferTypeChange={setTransferType}
        onDestinationClassChange={setDestinationClassId}
        onDestinationInstitutionChange={setDestinationInstitution}
        onReasonChange={setReason}
        onNotesChange={setNotes}
        onReturnDateChange={setReturnDate}
        onCloseOperation={closeModal}
      />
    </div>
  );
};

export default ParceiroAlunoMatriculas;
