import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  BookCheck,
  CalendarRange,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  LockKeyhole,
  RotateCcw,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { AcademicPeriod, academicLifecycleService } from '../academic-lifecycle.service';
import { supabase } from '../../../../../../lib/supabase';

interface TurmaAcademicoProps {
  turma: Turma;
  onTurmaFinalizada?: () => void;
}

const PeriodCard: React.FC<{
  period: AcademicPeriod;
  onClose: (period: AcademicPeriod) => void;
  onReopen: (period: AcademicPeriod) => void;
  closing: boolean;
}> = ({ period, onClose, onReopen, closing }) => {
  const { data: pending, isLoading } = useQuery({
    queryKey: [...academicLifecycleKeys.periodos(period.turma_id), period.id, 'pendencias'],
    queryFn: () => academicLifecycleService.getPendencias(period.id),
  });

  const statusStyle = period.status === 'FECHADO'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2.5 rounded-xl ${period.status === 'FECHADO' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
            {period.status === 'FECHADO' ? <LockKeyhole size={18} /> : <CalendarRange size={18} />}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Etapa {period.ordem}</p>
            <h4 className="font-black text-[#001a33]">{period.nome}</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              {period.data_inicio ? new Date(`${period.data_inicio}T12:00:00`).toLocaleDateString('pt-BR') : 'Início não definido'}
              {' — '}
              {period.data_fim ? new Date(`${period.data_fim}T12:00:00`).toLocaleDateString('pt-BR') : 'Fim não definido'}
            </p>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase ${statusStyle}`}>
          {period.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        {isLoading ? (
          <div className="col-span-3 py-3 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-black text-[#001a33]">{pending?.disciplinasNaoConcluidas ?? 0}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Disciplinas abertas</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-black text-[#001a33]">{pending?.disciplinasSemAula ?? 0}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Sem aulas</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-black text-[#001a33]">{pending?.lancamentosDeNotaPendentes ?? 0}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Notas pendentes</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-black text-[#001a33]">{pending?.frequenciasPendentes ?? 0}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Freq. pendentes</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-black text-[#001a33]">{pending?.recuperacoesPendentes ?? 0}</p>
              <p className="text-[8px] font-black uppercase text-slate-400">Recuperações</p>
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        {period.status === 'FECHADO' ? (
          <button
            onClick={() => onReopen(period)}
            className="w-full py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-black uppercase flex justify-center items-center gap-2"
          >
            <RotateCcw size={14} /> Reabrir com justificativa
          </button>
        ) : (
          <button
            onClick={() => onClose(period)}
            disabled={!pending?.podeFechar || closing}
            className="w-full py-2.5 rounded-xl bg-[#001a33] text-white text-[10px] font-black uppercase flex justify-center items-center gap-2 disabled:opacity-35"
          >
            {closing ? <Loader2 size={14} className="animate-spin" /> : <BookCheck size={14} />}
            Fechar período
          </button>
        )}
      </div>
    </div>
  );
};

const TurmaAcademico: React.FC<TurmaAcademicoProps> = ({ turma, onTurmaFinalizada }) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const responsavelId = sessionStorage.getItem('logged_user_id');
  const [reopenPeriod, setReopenPeriod] = useState<AcademicPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [showReceiveTransfer, setShowReceiveTransfer] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [originInstitution, setOriginInstitution] = useState('');
  const [originCourse, setOriginCourse] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const { data: periods = [], isLoading: loadingPeriods } = useQuery({
    queryKey: academicLifecycleKeys.periodos(turma.id),
    queryFn: () => academicLifecycleService.getPeriodos(turma.id),
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: academicLifecycleKeys.movimentacoes(turma.id),
    queryFn: () => academicLifecycleService.getMovimentacoes(turma.id),
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turma.id), 'alunos-recebimento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome, cpf_cnpj')
        .eq('tipo', 'Aluno')
        .order('nome');
      if (error) throw error;
      return data || [];
    },
    enabled: showReceiveTransfer,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
      queryClient.invalidateQueries({ queryKey: ['gestao-kpis'] }),
    ]);
  };

  const closePeriodMutation = useMutation({
    mutationFn: (periodId: string) => academicLifecycleService.fecharPeriodo(periodId, responsavelId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Período fechado', 'Notas e frequências foram consolidadas em um snapshot auditável.');
    },
    onError: (error: any) => toast.error('Fechamento não realizado', error.message),
  });

  const reopenPeriodMutation = useMutation({
    mutationFn: () => academicLifecycleService.reabrirPeriodo(reopenPeriod!.id, reopenReason, responsavelId),
    onSuccess: async () => {
      await invalidate();
      setReopenPeriod(null);
      setReopenReason('');
      toast.success('Período reaberto', 'A justificativa foi registrada no histórico.');
    },
    onError: (error: any) => toast.error('Reabertura não realizada', error.message),
  });

  const finalizeClassMutation = useMutation({
    mutationFn: () => academicLifecycleService.finalizarTurma(turma.id, responsavelId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Turma finalizada', 'As matrículas ativas foram concluídas após o fechamento dos períodos.');
      onTurmaFinalizada?.();
    },
    onError: (error: any) => toast.error('Turma não finalizada', error.message),
  });

  const receiveTransferMutation = useMutation({
    mutationFn: () => academicLifecycleService.receberTransferencia({
      alunoId: selectedStudentId,
      turmaDestinoId: turma.id,
      instituicaoOrigem: originInstitution,
      cursoOrigem: originCourse,
      motivo: transferReason,
      responsavelId,
    }),
    onSuccess: async () => {
      await invalidate();
      setShowReceiveTransfer(false);
      setSelectedStudentId('');
      setOriginInstitution('');
      setOriginCourse('');
      setTransferReason('');
      toast.success('Transferência recebida', 'A matrícula e a origem acadêmica foram registradas.');
    },
    onError: (error: any) => toast.error('Transferência não recebida', error.message),
  });

  const allPeriodsClosed = periods.length > 0 && periods.every((period) => period.status === 'FECHADO');

  return (
    <div className="space-y-7 animate-fadeIn">
      <div className="rounded-[2rem] bg-[#001a33] p-6 text-white relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-72 bg-blue-500/10 blur-3xl rounded-full" />
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-black text-blue-300">Ciclo acadêmico</p>
            <h3 className="text-2xl font-black mt-1">Períodos, movimentações e fechamento</h3>
            <p className="text-sm text-blue-100/75 mt-2 max-w-2xl">
              As etapas seguem os módulos cadastrados no curso. Períodos fechados bloqueiam novos lançamentos até uma reabertura justificada.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowReceiveTransfer(true)}
              className="px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-[10px] font-black uppercase flex items-center gap-2 hover:bg-white/15"
            >
              <ArrowDownToLine size={15} /> Receber transferência
            </button>
            <button
              onClick={() => finalizeClassMutation.mutate()}
              disabled={!allPeriodsClosed || turma.status === 'FINALIZADA' || finalizeClassMutation.isPending}
              className="px-4 py-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase flex items-center gap-2 disabled:opacity-35"
            >
              {finalizeClassMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Finalizar turma
            </button>
          </div>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <CalendarRange size={17} className="text-blue-600" />
          <h4 className="font-black text-[#001a33] uppercase tracking-wider text-sm">Períodos letivos</h4>
        </div>
        {loadingPeriods ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : periods.length === 0 ? (
          <div className="p-10 text-center bg-white border border-dashed border-slate-300 rounded-3xl text-slate-400">
            Nenhum período foi gerado. Verifique se o curso possui módulos e disciplinas cadastrados.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {periods.map((period) => (
              <PeriodCard
                key={period.id}
                period={period}
                onClose={(item) => closePeriodMutation.mutate(item.id)}
                onReopen={setReopenPeriod}
                closing={closePeriodMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <History size={17} className="text-violet-600" />
          <h4 className="font-black text-[#001a33] uppercase tracking-wider text-sm">Histórico de movimentações</h4>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
          {loadingMovements ? (
            <div className="py-14 flex justify-center"><Loader2 className="animate-spin text-violet-600" /></div>
          ) : movements.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400">Nenhuma movimentação registrada.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {movements.map((movement: any) => (
                <div key={movement.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-xl"><Clock3 size={15} /></div>
                    <div>
                      <p className="font-black text-sm text-[#001a33]">{movement.aluno?.nome || 'Aluno'}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-violet-600 mt-0.5">
                        {movement.tipo.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{movement.motivo}</p>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-[10px] font-bold text-slate-500">
                      {new Date(movement.created_at).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1">
                      {movement.status_anterior || 'INÍCIO'} → {movement.status_novo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {reopenPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-black text-[#001a33]">Reabrir {reopenPeriod.nome}</h3>
                <p className="text-xs text-slate-500 mt-1">A reabertura ficará registrada na auditoria.</p>
              </div>
              <button onClick={() => setReopenPeriod(null)} className="p-2 text-slate-400"><X size={18} /></button>
            </div>
            <textarea
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Justificativa obrigatória"
              className="w-full min-h-28 p-4 border border-slate-200 rounded-xl mt-5 outline-none focus:border-amber-500 resize-none"
            />
            <button
              onClick={() => reopenPeriodMutation.mutate()}
              disabled={!reopenReason.trim() || reopenPeriodMutation.isPending}
              className="w-full mt-4 py-3 bg-amber-500 text-white rounded-xl font-black uppercase text-xs disabled:opacity-40"
            >
              Confirmar reabertura
            </button>
          </div>
        </div>
      )}

      {showReceiveTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="p-6 bg-violet-700 text-white flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">Entrada acadêmica</p>
                <h3 className="font-black text-xl mt-1">Receber transferência externa</h3>
              </div>
              <button onClick={() => setShowReceiveTransfer(false)} className="p-2 hover:bg-white/10 rounded-full"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <select
                value={selectedStudentId}
                onChange={(event) => setSelectedStudentId(event.target.value)}
                className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
              >
                <option value="">Selecione o aluno já cadastrado...</option>
                {allStudents.map((student: any) => (
                  <option key={student.id} value={student.id}>
                    {student.nome} — {student.cpf_cnpj || 'sem CPF'}
                  </option>
                ))}
              </select>
              <input
                value={originInstitution}
                onChange={(event) => setOriginInstitution(event.target.value)}
                placeholder="Instituição de origem"
                className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
              />
              <input
                value={originCourse}
                onChange={(event) => setOriginCourse(event.target.value)}
                placeholder="Curso de origem (opcional)"
                className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
              />
              <textarea
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
                placeholder="Motivo e contexto da transferência"
                className="w-full min-h-24 p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500 resize-none"
              />
              <div className="p-3 rounded-xl bg-amber-50 text-amber-700 text-xs flex gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                O aproveitamento detalhado de disciplinas poderá ser ajustado após a reunião de regras acadêmicas.
              </div>
              <button
                onClick={() => receiveTransferMutation.mutate()}
                disabled={!selectedStudentId || !originInstitution.trim() || !transferReason.trim() || receiveTransferMutation.isPending}
                className="w-full py-3 bg-violet-700 text-white rounded-xl font-black uppercase text-xs disabled:opacity-40"
              >
                {receiveTransferMutation.isPending ? 'Registrando...' : 'Registrar recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAcademico;
