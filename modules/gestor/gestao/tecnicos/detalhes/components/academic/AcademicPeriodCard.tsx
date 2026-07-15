import React from 'react';
import { BookCheck, CalendarRange, Loader2, LockKeyhole, PlayCircle, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import { AcademicPeriod, academicLifecycleService } from '../../academic-lifecycle.service';
import TechnicalDataError from '../TechnicalDataError';

interface AcademicPeriodCardProps {
  period: AcademicPeriod;
  onClose: (period: AcademicPeriod) => void;
  onOpen: (period: AcademicPeriod) => void;
  onReopen: (period: AcademicPeriod) => void;
  canOpen: boolean;
  canReopen: boolean;
  changing: boolean;
}

const AcademicPeriodCard: React.FC<AcademicPeriodCardProps> = ({
  period,
  onClose,
  onOpen,
  onReopen,
  canOpen,
  canReopen,
  changing,
}) => {
  const pendingQuery = useQuery({
    queryKey: [...academicLifecycleKeys.periodos(period.turma_id), period.id, 'pendencias'],
    queryFn: () => academicLifecycleService.getPendencias(period.id),
  });
  const pending = pendingQuery.data;

  const statusStyle = period.status === 'FECHADO'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : period.status === 'PLANEJADO'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : 'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-xl p-2.5 ${period.status === 'FECHADO' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
            {period.status === 'FECHADO' ? <LockKeyhole size={18} /> : <CalendarRange size={18} />}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Etapa {period.ordem}</p>
            <h4 className="font-black text-[#001a33]">{period.nome}</h4>
            <p className="mt-1 text-[11px] text-slate-500">
              {period.data_inicio ? new Date(`${period.data_inicio}T12:00:00`).toLocaleDateString('pt-BR') : 'Início não definido'}
              {' — '}
              {period.data_fim ? new Date(`${period.data_fim}T12:00:00`).toLocaleDateString('pt-BR') : 'Fim não definido'}
            </p>
          </div>
        </div>
        <span className={`rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase ${statusStyle}`}>
          {period.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-7">
        {pendingQuery.isLoading ? (
          <div className="col-span-3 flex justify-center py-3"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
        ) : pendingQuery.isError ? (
          <div className="col-span-full">
            <TechnicalDataError
              title="Pendências não carregadas"
              message="O fechamento deste período permanece bloqueado até a conferência acadêmica ser carregada."
              retrying={pendingQuery.isFetching}
              onRetry={() => { void pendingQuery.refetch(); }}
            />
          </div>
        ) : (
          <>
            {[
              [pending?.disciplinasNaoConcluidas ?? 0, 'Disciplinas abertas'],
              [pending?.disciplinasSemAula ?? 0, 'Sem aulas'],
              [pending?.lancamentosDeNotaPendentes ?? 0, 'Notas pendentes'],
              [pending?.frequenciasPendentes ?? 0, 'Freq. pendentes'],
              [pending?.recuperacoesPendentes ?? 0, 'Recuperações'],
              [pending?.avaliacoesEstagioPendentes ?? 0, 'Estágio pendente'],
              [pending?.estagiosReprovados ?? 0, 'Estágio reprovado'],
            ].map(([value, label]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-lg font-black text-[#001a33]">{value}</p>
                <p className="text-[8px] font-black uppercase text-slate-400">{label}</p>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-4">
        {period.status === 'FECHADO' ? (
          <button onClick={() => onReopen(period)} disabled={!canReopen || changing}
            title={canReopen ? 'Reabrir este período' : 'Feche o período posterior antes de reabrir este.'}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-[10px] font-black uppercase text-amber-700 disabled:opacity-35">
            <RotateCcw size={14} /> Reabrir com justificativa
          </button>
        ) : period.status === 'PLANEJADO' ? (
          <button onClick={() => onOpen(period)} disabled={!canOpen || changing}
            title={canOpen ? 'Abrir este período' : 'Conclua os períodos anteriores e inicie a turma.'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-35">
            <PlayCircle size={14} /> Abrir período
          </button>
        ) : (
          <button onClick={() => onClose(period)} disabled={pendingQuery.isError || !pending?.podeFechar || changing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-35">
            {changing ? <Loader2 size={14} className="animate-spin" /> : <BookCheck size={14} />}
            Fechar período
          </button>
        )}
      </div>
    </div>
  );
};

export default AcademicPeriodCard;
