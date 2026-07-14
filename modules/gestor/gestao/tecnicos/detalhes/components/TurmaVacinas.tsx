import React from 'react';
import { Loader2, Syringe } from 'lucide-react';
import { Turma } from '../../../gestao.types';
import ToastNotification, { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import TechnicalDataError from './TechnicalDataError';
import TurmaVacinasStudentGroups from './vacinas/TurmaVacinasStudentGroups';
import { useTurmaVacinas } from './vacinas/useTurmaVacinas';

interface TurmaVacinasProps {
  turma: Turma;
}

const TurmaVacinas: React.FC<TurmaVacinasProps> = ({ turma }) => {
  const { toasts, removeToast, toast } = useToast();
  const {
    config,
    isLoading,
    isError,
    isFetching,
    refetch,
    registrosMap,
    requiredDoses,
    studentRows,
    studentGroups,
    statusMutation,
  } = useTurmaVacinas(turma, {
    onStatusSuccess: () => toast.success('Vacina atualizada', 'O status da dose foi salvo com sucesso.'),
    onStatusError: (error: any) => {
      console.error('Erro ao atualizar status da vacina:', error);
      toast.error(
        'Status não salvo',
        error?.message || 'Não foi possível atualizar esta dose. Tente novamente.',
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-[2rem] border border-slate-100 bg-white py-20">
        <Loader2 className="animate-spin text-emerald-600" size={30} />
        <span className="ml-3 text-sm font-bold text-slate-500">Carregando vacinas da turma...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <TechnicalDataError
        title="Controle de vacinas não carregado"
        message="Nenhuma dose foi exibida como pendente ou aprovada porque os dados não puderam ser consultados."
        retrying={isFetching}
        onRetry={() => { void refetch(); }}
      />
    );
  }

  if (!config?.exigirCarteiraEstagio || requiredDoses.length === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
        <Syringe className="mx-auto text-slate-300" size={46} />
        <h3 className="mt-4 text-lg font-black text-[#001a33]">Este curso não exige vacina para estágio</h3>
        <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-relaxed text-slate-500">
          Para ativar, vá em Cadastros, Cursos Técnicos, abra o curso e entre na aba Vacinas.
        </p>
      </div>
    );
  }

  const totalLiberados = studentRows.filter((row) => row.liberado).length;
  const totalPendentes = Math.max(0, studentRows.length - totalLiberados);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Syringe size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Liberação para estágio</p>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">Vacinas da turma</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Aprove ou reprove doses enviadas pelo aluno antes da avaliação de estágio.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Liberados</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{totalLiberados}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Pendentes</p>
              <p className="mt-1 text-2xl font-black text-amber-700">{totalPendentes}</p>
            </div>
          </div>
        </div>
      </div>

      <TurmaVacinasStudentGroups
        turma={turma}
        config={config}
        groups={studentGroups}
        registrosMap={registrosMap}
        isUpdating={statusMutation.isPending}
        onUpdateStatus={(id, status, observacao) => statusMutation.mutate({ id, status, observacao })}
      />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default TurmaVacinas;
