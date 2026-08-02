import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, NotebookText } from 'lucide-react';
import type { DisciplinaResumoAluno, QueryDisplayState } from '../../turmas.types';
import { asNullableNumber, formatNumeric, groupDisciplineSummaries } from '../../turmas.utils';
import CurriculumModuleSection from './CurriculumModuleSection';
import QueryStateNotice from '../QueryStateNotice';

interface GradesTabProps {
  disciplines: DisciplinaResumoAluno[];
  disciplinesState: QueryDisplayState;
  resultsState: QueryDisplayState;
  sharedQueryState?: boolean;
}

const RESULT_LABELS: Record<string, string> = {
  APROVADO: 'Aprovado', APROVADO_DEPENDENCIA: 'Aprovado em dependência', APROVEITADO: 'Aproveitado',
  EM_RECUPERACAO: 'Em recuperação', REPROVADO: 'Reprovado', REPROVADO_FREQUENCIA: 'Reprovado por frequência',
  REPROVADO_POR_FALTA: 'Reprovado por frequência',
  FREQUENCIA_PENDENTE: 'Frequência pendente', SEM_LANCAMENTO: 'Ainda não lançada',
};

const GRADE_LEGEND = [
  ['P', 'Prova'], ['TI', 'Trabalho individual'], ['TG', 'Trabalho em grupo'], ['S', 'Seminário'],
  ['CQ', 'Critérios qualitativos'], ['O', 'Outros'], ['REC', 'Recuperação'],
];

const hasLaunchedGrade = (discipline: DisciplinaResumoAluno) => {
  const grade = discipline.notas;
  return ['nota_p', 'nota_ti', 'nota_tg', 'nota_s', 'nota_cq', 'nota_o', 'nota_rec', 'media_final']
    .some((field) => asNullableNumber(grade?.[field as keyof typeof grade]) !== null);
};

const getResultKey = (discipline: DisciplinaResumoAluno) =>
  String(discipline.notas?.resultado_final || 'SEM_LANCAMENTO').toUpperCase();

const isPendingRecovery = (discipline: DisciplinaResumoAluno) =>
  getResultKey(discipline) === 'EM_RECUPERACAO';

const hasRecoveryGrade = (discipline: DisciplinaResumoAluno) =>
  asNullableNumber(discipline.notas?.nota_rec) !== null;

const resultStyle = (key: string) => key === 'APROVADO' || key === 'APROVEITADO' || key === 'APROVADO_DEPENDENCIA'
  ? 'bg-emerald-50 text-emerald-700'
  : key === 'REPROVADO' || key === 'REPROVADO_FREQUENCIA' || key === 'REPROVADO_POR_FALTA'
    ? 'bg-rose-50 text-rose-700'
    : key === 'EM_RECUPERACAO'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-slate-100 text-slate-500';

const GradesTab: React.FC<GradesTabProps> = ({ disciplines, disciplinesState, resultsState, sharedQueryState = false }) => {
  const hasError = disciplinesState.isError || resultsState.isError;
  const isLoading = disciplinesState.isLoading || resultsState.isLoading;
  const modules = useMemo(() => groupDisciplineSummaries(disciplines), [disciplines]);
  const pendingRecovery = useMemo(() => disciplines.filter(isPendingRecovery), [disciplines]);
  const recordedRecoveryCount = useMemo(
    () => disciplines.filter(hasRecoveryGrade).length,
    [disciplines],
  );

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><NotebookText size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Notas por módulo</h4></div><div className="flex flex-wrap gap-x-3 gap-y-1">{GRADE_LEGEND.map(([key, label]) => <span key={key} className="text-[9px] font-semibold text-slate-400"><strong className="text-slate-600">{key}</strong> {label}</span>)}</div></div>
      <QueryStateNotice state={disciplinesState} label={sharedQueryState ? 'as disciplinas e os resultados acadêmicos' : 'as disciplinas'} />
      {!sharedQueryState ? <QueryStateNotice state={resultsState} label="os resultados acadêmicos" /> : null}
      {!isLoading && !hasError && disciplines.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada para exibir notas.</div> : null}

      {!isLoading && !hasError && disciplines.length > 0 ? (
        pendingRecovery.length > 0 ? (
          <section role="status" className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <AlertTriangle size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Recuperação pendente</p>
                  <h5 className="mt-1 text-sm font-black text-[#001a33]">
                    {pendingRecovery.length === 1
                      ? '1 disciplina precisa de recuperação'
                      : `${pendingRecovery.length} disciplinas precisam de recuperação`}
                  </h5>
                  <p className="mt-1 max-w-3xl text-[11px] font-semibold leading-relaxed text-slate-600">
                    A nota será exibida na coluna <strong className="text-amber-800">REC</strong>. Depois do lançamento, a média final e o resultado serão atualizados automaticamente.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:max-w-[45%] sm:justify-end">
                {pendingRecovery.map((discipline) => (
                  <span key={discipline.id} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-amber-800">
                    {discipline.nome}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-amber-200/70 bg-white/60 px-4 py-2.5 text-[10px] font-semibold text-slate-500 sm:px-5">
              A média final considera o melhor resultado entre a média parcial e a nota de recuperação.
            </div>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={18} /></span>
              <div>
                <p className="text-xs font-black text-[#001a33]">Nenhuma recuperação pendente</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">Quando houver, a disciplina será destacada aqui e na respectiva linha de notas.</p>
              </div>
            </div>
            {recordedRecoveryCount > 0 ? <span className="w-max rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase text-emerald-700">{recordedRecoveryCount} {recordedRecoveryCount === 1 ? 'recuperação lançada' : 'recuperações lançadas'}</span> : null}
          </section>
        )
      ) : null}

      {!hasError ? modules.map((module, moduleIndex) => {
        const launchedCount = module.itens.filter(hasLaunchedGrade).length;
        return (
          <CurriculumModuleSection
            key={module.id}
            title={module.nome}
            order={module.ordem}
            itemCount={module.itens.length}
            detail={`${launchedCount} de ${module.itens.length} disciplinas com notas lançadas`}
            defaultOpen={moduleIndex === 0}
          >
            <div className="space-y-3 sm:hidden">
              {module.itens.map((discipline, disciplineIndex) => {
                const grade = discipline.notas;
                const resultKey = getResultKey(discipline);
                const recoveryPending = isPendingRecovery(discipline);
                const metrics = [['P', grade?.nota_p], ['TI', grade?.nota_ti], ['TG', grade?.nota_tg], ['S', grade?.nota_s], ['CQ', grade?.nota_cq], ['O', grade?.nota_o], ['Parcial', grade?.media_parcial], ['REC', grade?.nota_rec], ['Final', grade?.media_final]];
                return (
                  <article key={`${discipline.id}-mobile`} className={`rounded-xl border p-4 ${recoveryPending ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100 bg-white'}`}>
                    <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[9px] font-black text-slate-400">{String(disciplineIndex + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><h5 className="break-words text-sm font-black text-[#001a33]">{discipline.nome}</h5><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-black uppercase ${resultStyle(resultKey)}`}>{RESULT_LABELS[resultKey] || resultKey.replaceAll('_', ' ')}</span></div></div>
                    {recoveryPending ? <p className="mt-3 rounded-lg bg-amber-100/70 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-800">Sua média parcial ficou abaixo de 6,0. A nota REC ainda aguarda lançamento.</p> : null}
                    <div className="mt-3 grid grid-cols-3 gap-2">{metrics.map(([label, value]) => <div key={String(label)} className={`rounded-lg px-2 py-2 text-center ${label === 'Final' ? 'bg-blue-50' : label === 'REC' && (recoveryPending || hasRecoveryGrade(discipline)) ? 'bg-amber-100' : 'bg-slate-50'}`}><p className="text-[8px] font-black uppercase text-slate-400">{label}</p><p className={`mt-1 text-xs font-black ${label === 'Final' ? 'text-blue-700' : label === 'REC' && (recoveryPending || hasRecoveryGrade(discipline)) ? 'text-amber-800' : 'text-slate-700'}`}>{formatNumeric(value)}</p></div>)}</div>
                    <p className="mt-3 text-[10px] font-semibold text-slate-500">Frequência: {discipline.frequency === null ? 'não publicada' : `${discipline.frequency}%`}</p>
                  </article>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-100 bg-white sm:block">
              <div className="min-w-[1040px] divide-y divide-slate-100">
                <div className="grid grid-cols-12 gap-2 bg-slate-50 px-4 py-3 text-[9px] font-black uppercase tracking-wider text-slate-400"><span className="col-span-2">Ordem / disciplina</span><span>P</span><span>TI</span><span>TG</span><span>S</span><span>CQ</span><span>O</span><span>Parcial</span><span>REC</span><span>Final</span><span>Resultado</span></div>
                {module.itens.map((discipline, disciplineIndex) => {
                  const grade = discipline.notas;
                  const resultKey = getResultKey(discipline);
                  const recoveryPending = isPendingRecovery(discipline);
                  return (
                    <div key={`${discipline.id}-desktop`} className={`grid grid-cols-12 items-center gap-2 px-4 py-3 text-xs ${recoveryPending ? 'bg-amber-50/40' : ''}`}>
                      <div className="col-span-2 flex min-w-0 items-center gap-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-black ${recoveryPending ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-400'}`}>{String(disciplineIndex + 1).padStart(2, '0')}</span><div className="min-w-0"><p className="break-words font-bold text-[#001a33]">{discipline.nome}</p><p className="mt-1 text-[9px] text-slate-400">Frequência {discipline.frequency === null ? 'não publicada' : `${discipline.frequency}%`}</p>{recoveryPending ? <p className="mt-1 text-[9px] font-black uppercase text-amber-700">Aguardando nota REC</p> : null}</div></div>
                      <span className="text-center">{formatNumeric(grade?.nota_p)}</span><span className="text-center">{formatNumeric(grade?.nota_ti)}</span><span className="text-center">{formatNumeric(grade?.nota_tg)}</span><span className="text-center">{formatNumeric(grade?.nota_s)}</span><span className="text-center">{formatNumeric(grade?.nota_cq)}</span><span className="text-center">{formatNumeric(grade?.nota_o)}</span><span className="text-center font-black text-slate-700">{formatNumeric(grade?.media_parcial)}</span><span className={`rounded-lg py-2 text-center font-black ${recoveryPending || hasRecoveryGrade(discipline) ? 'bg-amber-100 text-amber-800' : ''}`}>{formatNumeric(grade?.nota_rec)}</span><span className="text-center font-black text-blue-600">{formatNumeric(grade?.media_final)}</span><span className={`w-max rounded-full px-2 py-1 text-[8px] font-black uppercase ${resultStyle(resultKey)}`}>{RESULT_LABELS[resultKey] || resultKey.replaceAll('_', ' ')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CurriculumModuleSection>
        );
      }) : null}
    </div>
  );
};

export default GradesTab;
