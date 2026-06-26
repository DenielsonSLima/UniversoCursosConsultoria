import React, { useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PauseCircle,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import {
  AcademicMovementType,
  academicLifecycleService,
} from '../../../../gestao/tecnicos/detalhes/academic-lifecycle.service';
import { asaasIntegrationService } from '../../../../../asaas/asaas.service';
import ToastNotification, { useToast } from '../../shared/ToastNotification';

interface Props {
  alunoId: string;
}

type OperationMode = 'MOVIMENTACAO' | 'TRANSFERENCIA';

const movementLabels: Record<AcademicMovementType, string> = {
  TRANCAMENTO: 'Trancar matrícula',
  CANCELAMENTO: 'Cancelar matrícula',
  DESISTENCIA: 'Registrar desistência',
  REATIVACAO: 'Reativar na mesma turma',
  CONCLUSAO: 'Concluir matrícula',
};

const statusStyle: Record<string, string> = {
  ATIVO: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  TRANCADO: 'bg-amber-50 text-amber-700 border-amber-100',
  CANCELADO: 'bg-rose-50 text-rose-700 border-rose-100',
  DESISTENTE: 'bg-rose-50 text-rose-700 border-rose-100',
  TRANSFERIDO: 'bg-violet-50 text-violet-700 border-violet-100',
  CONCLUIDO: 'bg-blue-50 text-blue-700 border-blue-100',
};

const formatDate = (value?: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

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

const ParceiroAlunoMatriculas: React.FC<Props> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const responsavelId = window.sessionStorage.getItem('logged_user_id');
  const [showNew, setShowNew] = useState(false);
  const [newClassId, setNewClassId] = useState('');
  const [pendingNewEnrollment, setPendingNewEnrollment] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [mode, setMode] = useState<OperationMode>('MOVIMENTACAO');
  const [movementType, setMovementType] = useState<AcademicMovementType>('TRANCAMENTO');
  const [transferType, setTransferType] = useState<'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA'>('INTERNA_TURMA');
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
        .select('id, nome, codigo, turno, status, valor_matricula, cursos(id, nome, modalidade), polos(nome)')
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
      if (selectedClass?.cursos?.modalidade === 'TECNICO') {
        await asaasIntegrationService.testConnection();
      }

      const matricula = await academicLifecycleService.matricularAluno(newClassId, alunoId, responsavelId);
      if (selectedClass?.cursos?.modalidade !== 'TECNICO') return { matricula, asaasSynced: false };

      try {
        await asaasIntegrationService.syncEnrollment(matricula.id);
        return { matricula, asaasSynced: true };
      } catch (error) {
        return {
          matricula,
          asaasSynced: false,
          asaasError: error instanceof Error ? error.message : 'Falha na integração Asaas',
        };
      }
    },
    onSuccess: async (result) => {
      await invalidate();
      setShowNew(false);
      setPendingNewEnrollment(null);
      setNewClassId('');
      if (result.asaasError) {
        toast.error('Sincronização Asaas pendente', result.asaasError);
      }
    },
    onError: (error: any) => {
      toast.error('Matrícula não realizada', `Não foi possível validar/criar a cobrança no Asaas: ${error.message}`);
    },
  });

  const confirmNewEnrollment = () => {
    const selectedClass = allClasses.find((item) => item.id === newClassId);
    if (!selectedClass) return;

    const isTechnical = selectedClass.cursos?.modalidade === 'TECNICO';
    if (isTechnical && !isValidCpf(aluno?.cpf_cnpj)) {
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
      responsavelId,
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
          responsavelId,
        });
      }
      return academicLifecycleService.transferir({
        matriculaId: selected.id,
        tipo: transferType,
        motivo: reason,
        turmaDestinoId: transferType === 'EXTERNA_ENVIADA' ? undefined : destinationClassId,
        instituicaoDestino: transferType === 'EXTERNA_ENVIADA' ? destinationInstitution : undefined,
        observacao: notes,
        responsavelId,
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
                      <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusStyle[matricula.status] || 'bg-slate-50 text-slate-600'}`}>{matricula.status}</span>
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
                      <p className="mt-1 text-xs font-black text-slate-700">{formatDate(matricula.data_matricula)}</p>
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
                <p className="mt-1 text-[10px] font-bold text-slate-500">{formatDate(movement.data_movimentacao)} · {movement.status_anterior || 'INÍCIO'} → {movement.status_novo}</p>
                <p className="mt-1 text-xs text-slate-600">{movement.motivo}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showNew && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black uppercase text-[#001a33]">Nova matrícula</h4>
                <p className="text-xs text-slate-500">Use “Transferir / continuar” quando houver vínculo anterior a aproveitar.</p>
              </div>
              <button onClick={() => setShowNew(false)} className="p-2 text-slate-400"><X size={18} /></button>
            </div>
            <select value={newClassId} onChange={(event) => setNewClassId(event.target.value)} className="mt-6 w-full rounded-xl border border-slate-200 p-4 text-sm font-bold">
              <option value="">Selecione a turma...</option>
              {allClasses.map((item) => <option key={item.id} value={item.id}>{item.cursos?.nome} — {item.nome} — {item.polos?.nome}</option>)}
            </select>
            <button onClick={confirmNewEnrollment} disabled={!newClassId || newEnrollmentMutation.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-3.5 text-xs font-black uppercase text-white disabled:opacity-40">
              {newEnrollmentMutation.isPending && <Loader2 size={15} className="animate-spin" />} Confirmar matrícula
            </button>
          </div>
        </div>
      )}

      {pendingNewEnrollment && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Confirmação de matrícula</p>
                <h4 className="mt-1 font-black">{pendingNewEnrollment.nome}</h4>
              </div>
              <button onClick={() => setPendingNewEnrollment(null)} className="rounded-full p-2 text-blue-200 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {pendingNewEnrollment.cursos?.modalidade === 'TECNICO' ? (
                <>
                  <p className="text-sm font-semibold leading-relaxed text-slate-600">
                    Ao confirmar, o sistema vai registrar a matrícula, gerar o Contas a Receber e criar a cobrança inicial no Asaas.
                  </p>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Valor da matrícula</p>
                    <p className="mt-1 text-2xl font-black text-emerald-800">{formatCurrency(Number(pendingNewEnrollment.valor_matricula || 0))}</p>
                  </div>
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-500">
                    Após o pagamento no Asaas, a baixa será automática no sistema e as próximas parcelas serão liberadas.
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  Esta ação vai registrar a matrícula no histórico acadêmico do aluno.
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setPendingNewEnrollment(null)} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                  Cancelar
                </button>
                <button
                  onClick={() => newEnrollmentMutation.mutate()}
                  disabled={newEnrollmentMutation.isPending}
                  className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  {newEnrollmentMutation.isPending ? 'Gerando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
              <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Matrícula</p><h4 className="mt-1 font-black">{selected.turmas?.nome}</h4></div>
              <button onClick={closeModal} className="p-2 text-blue-200"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button onClick={() => setMode('MOVIMENTACAO')} className={`rounded-lg py-2.5 text-xs font-black uppercase ${mode === 'MOVIMENTACAO' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Situação</button>
                <button onClick={() => setMode('TRANSFERENCIA')} className={`rounded-lg py-2.5 text-xs font-black uppercase ${mode === 'TRANSFERENCIA' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Transferência</button>
              </div>
              {mode === 'MOVIMENTACAO' ? (
                <>
                  <select value={movementType} onChange={(event) => setMovementType(event.target.value as AcademicMovementType)} className="w-full rounded-xl border border-slate-200 p-3.5 font-bold">
                    {['TRANCADO', 'CANCELADO', 'DESISTENTE'].includes(selected.status) ? (
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
                  {movementType === 'TRANCAMENTO' && <input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5" />}
                </>
              ) : (
                <>
                  <select value={transferType} onChange={(event) => setTransferType(event.target.value as typeof transferType)} className="w-full rounded-xl border border-slate-200 p-3.5 font-bold">
                    <option value="INTERNA_TURMA">Continuar em outra turma</option>
                    <option value="INTERNA_POLO">Continuar em outro polo</option>
                    <option value="EXTERNA_ENVIADA">Transferência externa</option>
                  </select>
                  {transferType === 'EXTERNA_ENVIADA' ? (
                    <input value={destinationInstitution} onChange={(event) => setDestinationInstitution(event.target.value)} placeholder="Instituição de destino" className="w-full rounded-xl border border-slate-200 p-3.5" />
                  ) : (
                    <select value={destinationClassId} onChange={(event) => setDestinationClassId(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5">
                      <option value="">Selecione a turma de destino...</option>
                      {destinationClasses.map((item) => <option key={item.id} value={item.id}>{item.cursos?.nome} — {item.nome} — {item.polos?.nome}</option>)}
                    </select>
                  )}
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs font-semibold text-violet-800">
                    Disciplinas aprovadas serão aproveitadas. Pagamentos anteriores ficam na origem e parcelas futuras seguem para a nova matrícula.
                  </div>
                </>
              )}
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obrigatório" className="w-full rounded-xl border border-slate-200 p-3.5" />
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observações" className="min-h-24 w-full resize-none rounded-xl border border-slate-200 p-3.5" />
              {(movementMutation.isError || transferMutation.isError) && <p className="text-xs font-bold text-rose-600">{(movementMutation.error as any)?.message || (transferMutation.error as any)?.message}</p>}
              <button
                onClick={() => mode === 'MOVIMENTACAO' ? movementMutation.mutate() : transferMutation.mutate()}
                disabled={!reason.trim() || movementMutation.isPending || transferMutation.isPending || (mode === 'TRANSFERENCIA' && transferType !== 'EXTERNA_ENVIADA' && !destinationClassId) || (mode === 'TRANSFERENCIA' && transferType === 'EXTERNA_ENVIADA' && !destinationInstitution.trim())}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-3.5 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                {(movementMutation.isPending || transferMutation.isPending) ? <Loader2 size={15} className="animate-spin" /> : mode === 'TRANSFERENCIA' ? <ArrowRightLeft size={15} /> : movementType === 'REATIVACAO' ? <RotateCcw size={15} /> : movementType === 'CONCLUSAO' ? <CheckCircle2 size={15} /> : movementType === 'CANCELAMENTO' || movementType === 'DESISTENCIA' ? <Ban size={15} /> : <PauseCircle size={15} />}
                Confirmar operação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoMatriculas;
