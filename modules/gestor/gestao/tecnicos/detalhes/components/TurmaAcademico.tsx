import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CalendarRange,
  CheckCircle2,
  Loader2,
  Megaphone,
  MegaphoneOff,
  PlayCircle,
  X,
} from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import { academicLifecycleKeys } from '../academic-lifecycle.keys';
import { AcademicPeriod, academicLifecycleService } from '../academic-lifecycle.service';
import { supabase } from '../../../../../../lib/supabase';
import AcademicPeriodCard from './academic/AcademicPeriodCard';
import AcademicMovementsSection from './academic/AcademicMovementsSection';
import { getMaceioIsoDate } from '../../technicalClassDates';
import TechnicalDataError from './TechnicalDataError';
import ReceiveExternalTransferModal, { ExternalCreditDraft } from './academic/ReceiveExternalTransferModal';
import { gestaoQueryKeys } from '../../../gestao.query-keys';
import { invalidateSiteTickerQueries } from '../../../../../public/siteTicker.keys';
import { invalidateTechnicalLandingQueries } from '../../../../../public/landing-pages/cursos-tecnicos/technicalLanding.keys';

interface TurmaAcademicoProps {
  turma: Turma;
  onTurmaUpdated?: (turma: Turma) => void;
  onTurmaFinalizada?: () => void;
}

const MOVEMENTS_PAGE_SIZE = 10;

const TurmaAcademico: React.FC<TurmaAcademicoProps> = ({
  turma,
  onTurmaUpdated,
  onTurmaFinalizada,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const queryClient = useQueryClient();
  const [reopenPeriod, setReopenPeriod] = useState<AcademicPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [showReceiveTransfer, setShowReceiveTransfer] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [originInstitution, setOriginInstitution] = useState('');
  const [originCourse, setOriginCourse] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferDate, setTransferDate] = useState(getMaceioIsoDate());
  const [externalCredits, setExternalCredits] = useState<Record<string, ExternalCreditDraft>>({});
  const [movementsPage, setMovementsPage] = useState(1);

  const periodsQuery = useQuery({
    queryKey: academicLifecycleKeys.periodos(turma.id),
    queryFn: () => academicLifecycleService.getPeriodos(turma.id),
  });
  const periods = periodsQuery.data || [];

  const movementsQuery = useQuery({
    queryKey: academicLifecycleKeys.movimentacoesPagina(
      turma.id,
      movementsPage,
      MOVEMENTS_PAGE_SIZE,
    ),
    queryFn: () => academicLifecycleService.getMovimentacoesPage(
      turma.id,
      movementsPage,
      MOVEMENTS_PAGE_SIZE,
    ),
    placeholderData: keepPreviousData,
  });
  const movements = movementsQuery.data?.items || [];
  const movementsTotal = movementsQuery.data?.total || 0;
  const movementsTotalPages = Math.max(1, Math.ceil(movementsTotal / MOVEMENTS_PAGE_SIZE));

  useEffect(() => {
    setMovementsPage(1);
  }, [turma.id]);

  useEffect(() => {
    if (movementsPage > movementsTotalPages) {
      setMovementsPage(movementsTotalPages);
    }
  }, [movementsPage, movementsTotalPages]);

  const allStudentsQuery = useQuery({
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
  const allStudents = allStudentsQuery.data || [];
  const disciplinesQuery = useQuery({
    queryKey: [...academicLifecycleKeys.turma(turma.id), 'disciplinas-aproveitamento'],
    queryFn: () => academicLifecycleService.getDisciplinasAproveitamento(turma.id),
    enabled: showReceiveTransfer,
  });

  const closeReceiveTransfer = () => {
    setShowReceiveTransfer(false);
    setSelectedStudentId('');
    setOriginInstitution('');
    setOriginCourse('');
    setTransferReason('');
    setTransferNotes('');
    setTransferDate(getMaceioIsoDate());
    setExternalCredits({});
  };

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.turma(turma.id) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.summaries() }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality('TECNICO') }),
      invalidateSiteTickerQueries(queryClient),
      invalidateTechnicalLandingQueries(queryClient),
    ]);
  };

  const closePeriodMutation = useMutation({
    mutationFn: (periodId: string) => academicLifecycleService.fecharPeriodo(periodId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Período fechado', 'Notas e frequências foram consolidadas em um snapshot auditável.');
    },
    onError: (error: any) => toast.error('Fechamento não realizado', error.message),
  });

  const reopenPeriodMutation = useMutation({
    mutationFn: () => academicLifecycleService.reabrirPeriodo(reopenPeriod!.id, reopenReason),
    onSuccess: async () => {
      await invalidate();
      setReopenPeriod(null);
      setReopenReason('');
      toast.success('Período reaberto', 'A justificativa foi registrada no histórico.');
    },
    onError: (error: any) => toast.error('Reabertura não realizada', error.message),
  });

  const openPeriodMutation = useMutation({
    mutationFn: (periodId: string) => academicLifecycleService.abrirPeriodo(periodId),
    onSuccess: async () => {
      await invalidate();
      toast.success('Período aberto', 'O diário acadêmico foi liberado somente para a etapa selecionada.');
    },
    onError: (error: any) => toast.error('Período não aberto', error.message),
  });

  const changeClassStatusMutation = useMutation({
    mutationFn: (status: 'PLANEJADA' | 'INSCRICOES_ABERTAS' | 'EM_ANDAMENTO') => (
      academicLifecycleService.alterarStatusTurma(turma.id, status)
    ),
    onSuccess: async (updatedRecord: any, status) => {
      await invalidate();
      onTurmaUpdated?.({
        ...turma,
        status,
        permitirInscricoesOnline: updatedRecord?.permitir_inscricoes_online
          ?? (status === 'PLANEJADA' ? false : turma.permitirInscricoesOnline),
      });
      if (status === 'PLANEJADA') {
        toast.success('Inscrições fechadas', 'A turma voltou ao planejamento e a inscrição online foi desativada.');
      } else if (status === 'EM_ANDAMENTO') {
        toast.success('Turma iniciada', 'O primeiro período foi aberto e o acesso acadêmico dos alunos foi liberado.');
      } else {
        toast.success('Inscrições abertas', 'A matrícula administrativa está disponível, mas o conteúdo acadêmico continua bloqueado.');
      }
    },
    onError: (error: any) => toast.error('Fase não alterada', error.message),
  });

  const finalizeClassMutation = useMutation({
    mutationFn: () => academicLifecycleService.finalizarTurma(turma.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Turma finalizada', 'As matrículas ativas foram concluídas após o fechamento dos períodos.');
      onTurmaFinalizada?.();
    },
    onError: (error: any) => toast.error('Turma não finalizada', error.message),
  });

  const receiveTransferMutation = useMutation({
    mutationFn: () => {
      if (turma.status !== 'EM_ANDAMENTO') {
        throw new Error('Transferências só podem ser recebidas com a turma em andamento.');
      }
      if (allStudentsQuery.isError || !allStudentsQuery.data) {
        throw new Error('Recarregue a lista de alunos antes de receber a transferência.');
      }
      if (disciplinesQuery.isError || !disciplinesQuery.data) {
        throw new Error('Recarregue as disciplinas antes de receber a transferência.');
      }
      return academicLifecycleService.receberTransferencia({
        alunoId: selectedStudentId,
        turmaDestinoId: turma.id,
        instituicaoOrigem: originInstitution,
        cursoOrigem: originCourse,
        motivo: transferReason,
        observacao: transferNotes,
        dataTransferencia: transferDate,
        aproveitamentos: (Object.entries(externalCredits) as Array<[string, ExternalCreditDraft]>)
          .filter(([, credit]) => credit.selected)
          .map(([disciplinaId, credit]) => ({
            disciplinaId,
            mediaFinal: credit.mediaFinal === '' ? null : Number(credit.mediaFinal),
            frequenciaPercent: credit.frequenciaPercent === '' ? null : Number(credit.frequenciaPercent),
            situacao: credit.situacao,
          })),
      });
    },
    onSuccess: async () => {
      await invalidate();
      closeReceiveTransfer();
      toast.success('Transferência recebida', 'A matrícula e a origem acadêmica foram registradas.');
    },
    onError: (error: any) => toast.error('Transferência não recebida', error.message),
  });

  const allPeriodsClosed = periods.length > 0 && periods.every((period) => period.status === 'FECHADO');
  const activePeriodIndex = periods.findIndex((period) => (
    period.status === 'ABERTO' || period.status === 'EM_FECHAMENTO'
  ));
  const lastClosedIndex = periods.reduce(
    (lastIndex, period, index) => period.status === 'FECHADO' ? index : lastIndex,
    -1,
  );
  const hasInvalidPeriodDates = periods.some((period, index) => {
    if (!period.data_inicio || !period.data_fim || period.data_fim < period.data_inicio) return true;
    const previous = periods[index - 1];
    return Boolean(previous?.data_fim && period.data_inicio <= previous.data_fim);
  });
  const today = getMaceioIsoDate();
  const canStartClass = Boolean(turma.dataInicio && turma.dataInicio <= today);
  const canReceiveTransfer = turma.status === 'EM_ANDAMENTO';

  return (
    <div className="space-y-7 ">
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
              onClick={() => { if (canReceiveTransfer) setShowReceiveTransfer(true); }}
              disabled={!canReceiveTransfer}
              title={canReceiveTransfer ? 'Receber transferência externa' : 'Transferências só podem ser recebidas com a turma em andamento.'}
              className="px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-[10px] font-black uppercase flex items-center gap-2 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowDownToLine size={15} /> Receber transferência
            </button>
            <button
              onClick={() => finalizeClassMutation.mutate()}
              disabled={periodsQuery.isError || !allPeriodsClosed || hasInvalidPeriodDates || turma.status !== 'EM_ANDAMENTO' || finalizeClassMutation.isPending}
              className="px-4 py-3 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase flex items-center gap-2 disabled:opacity-35"
            >
              {finalizeClassMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Finalizar turma
            </button>
          </div>
        </div>
      </div>

      {turma.status !== 'FINALIZADA' && turma.status !== 'EM_ANDAMENTO' && (
        <section className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Fase da turma</p>
              <h4 className="mt-1 font-black text-[#001a33]">{turma.status.replaceAll('_', ' ')}</h4>
              <p className="mt-1 max-w-2xl text-xs text-slate-600">
                Matrículas administrativas podem ser registradas nesta fase. Diário, notas, estágio e atividades só ficam disponíveis ao aluno após iniciar a turma.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {turma.status === 'PLANEJADA' && turma.permitirInscricoesOnline && (
                <button
                  onClick={() => changeClassStatusMutation.mutate('INSCRICOES_ABERTAS')}
                  disabled={changeClassStatusMutation.isPending}
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-[10px] font-black uppercase text-amber-700 disabled:opacity-40"
                >
                  <Megaphone size={15} /> Abrir inscrições
                </button>
              )}
              {turma.status === 'INSCRICOES_ABERTAS' && (
                <button
                  onClick={() => changeClassStatusMutation.mutate('PLANEJADA')}
                  disabled={changeClassStatusMutation.isPending}
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-[10px] font-black uppercase text-amber-700 disabled:opacity-40"
                >
                  <MegaphoneOff size={15} /> Fechar inscrições
                </button>
              )}
              <button
                onClick={() => changeClassStatusMutation.mutate('EM_ANDAMENTO')}
                disabled={periodsQuery.isError || !canStartClass || changeClassStatusMutation.isPending || hasInvalidPeriodDates}
                title={!canStartClass ? 'A turma só pode começar na data de início configurada.' : undefined}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-[10px] font-black uppercase text-white disabled:opacity-40"
              >
                <PlayCircle size={15} /> Iniciar turma
              </button>
            </div>
          </div>
        </section>
      )}

      {hasInvalidPeriodDates && periods.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black uppercase">Cronograma de períodos inválido</p>
            <p className="mt-1 text-xs">Existem períodos sem datas, invertidos ou sobrepostos. A turma não pode ser iniciada ou finalizada até a correção.</p>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center gap-2 mb-4">
          <CalendarRange size={17} className="text-blue-600" />
          <h4 className="font-black text-[#001a33] uppercase tracking-wider text-sm">Períodos letivos</h4>
        </div>
        {periodsQuery.isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : periodsQuery.isError ? (
          <TechnicalDataError
            title="Períodos não carregados"
            message="As ações de iniciar, abrir, fechar ou finalizar a turma foram bloqueadas até o cronograma ser carregado com segurança."
            retrying={periodsQuery.isFetching}
            onRetry={() => { void periodsQuery.refetch(); }}
          />
        ) : periods.length === 0 ? (
          <div className="p-10 text-center bg-white border border-dashed border-slate-300 rounded-3xl text-slate-400">
            Nenhum período foi gerado. Verifique se o curso possui módulos e disciplinas cadastrados.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {periods.map((period) => (
              <AcademicPeriodCard
                key={period.id}
                period={period}
                onClose={(item) => closePeriodMutation.mutate(item.id)}
                onOpen={(item) => openPeriodMutation.mutate(item.id)}
                onReopen={setReopenPeriod}
                canOpen={
                  turma.status === 'EM_ANDAMENTO'
                  && activePeriodIndex === -1
                  && periods.slice(0, periods.indexOf(period)).every((item) => item.status === 'FECHADO')
                }
                canReopen={activePeriodIndex === -1 && periods.indexOf(period) === lastClosedIndex}
                changing={closePeriodMutation.isPending || openPeriodMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <AcademicMovementsSection
        movements={movements}
        page={movementsPage}
        pageSize={MOVEMENTS_PAGE_SIZE}
        total={movementsTotal}
        isLoading={movementsQuery.isLoading}
        isError={movementsQuery.isError}
        isFetching={movementsQuery.isFetching}
        onPageChange={setMovementsPage}
        onRetry={() => { void movementsQuery.refetch(); }}
      />

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
        <ReceiveExternalTransferModal
          students={allStudents}
          disciplines={disciplinesQuery.data || []}
          loading={allStudentsQuery.isLoading || disciplinesQuery.isLoading}
          loadError={allStudentsQuery.isError || disciplinesQuery.isError}
          retrying={allStudentsQuery.isFetching || disciplinesQuery.isFetching}
          pending={receiveTransferMutation.isPending}
          selectedStudentId={selectedStudentId}
          originInstitution={originInstitution}
          originCourse={originCourse}
          reason={transferReason}
          notes={transferNotes}
          transferDate={transferDate}
          credits={externalCredits}
          onStudentChange={setSelectedStudentId}
          onInstitutionChange={setOriginInstitution}
          onCourseChange={setOriginCourse}
          onReasonChange={setTransferReason}
          onNotesChange={setTransferNotes}
          onTransferDateChange={setTransferDate}
          onCreditsChange={setExternalCredits}
          onRetry={() => { void Promise.all([allStudentsQuery.refetch(), disciplinesQuery.refetch()]); }}
          onClose={closeReceiveTransfer}
          onConfirm={() => receiveTransferMutation.mutate()}
        />
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaAcademico;
