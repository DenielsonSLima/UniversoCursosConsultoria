import React, { useMemo } from 'react';
import { CalendarDays, Clock3, Shield } from 'lucide-react';
import type {
  EstagioAluno,
  QueryDisplayState,
  TurmaDisciplinaAluno,
} from '../../turmas.types';
import { asNullableNumber, formatDate, formatNumeric, groupCurriculumDisciplines } from '../../turmas.utils';
import CurriculumModuleSection from './CurriculumModuleSection';
import QueryStateNotice from '../QueryStateNotice';

interface InternshipTabProps {
  disciplines: TurmaDisciplinaAluno[];
  internships: EstagioAluno[];
  state: QueryDisplayState;
}

const PERIOD_LABELS: Record<string, string> = {
  PLANEJADO: 'Planejado',
  ABERTO: 'Em andamento',
  EM_FECHAMENTO: 'Em fechamento',
  FECHADO: 'Encerrado',
};

const PERIOD_STYLES: Record<string, string> = {
  PLANEJADO: 'border-slate-200 bg-slate-50 text-slate-600',
  ABERTO: 'border-blue-100 bg-blue-50 text-blue-700',
  EM_FECHAMENTO: 'border-amber-100 bg-amber-50 text-amber-700',
  FECHADO: 'border-emerald-100 bg-emerald-50 text-emerald-700',
};

const getDisciplineId = (discipline: TurmaDisciplinaAluno) => (
  discipline.disciplinas?.id || discipline.disciplina_id || ''
);

const getPlannedHours = (discipline: TurmaDisciplinaAluno) => {
  const hours = Number(discipline.disciplinas?.carga_horaria_estagio || 0);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
};

const InternshipTab: React.FC<InternshipTabProps> = ({ disciplines, internships, state }) => {
  const evaluationByDiscipline = useMemo(() => {
    const map = new Map<string, EstagioAluno>();
    internships.forEach((evaluation) => {
      // A consulta vem da avaliação mais recente para a mais antiga.
      // Mantemos a primeira para não substituir o resultado atual por um histórico antigo.
      if (evaluation.disciplina_id && !map.has(evaluation.disciplina_id)) {
        map.set(evaluation.disciplina_id, evaluation);
      }
    });
    return map;
  }, [internships]);
  const totalPlannedHours = disciplines.reduce(
    (total, discipline) => total + getPlannedHours(discipline),
    0,
  );
  const modules = useMemo(() => groupCurriculumDisciplines(disciplines), [disciplines]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-blue-500" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Situação do estágio</h4>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              {disciplines.length} {disciplines.length === 1 ? 'disciplina' : 'disciplinas'} · {formatNumeric(totalPlannedHours)}h previstas
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">
          Horas cumpridas ainda não registradas
        </span>
      </div>

      <QueryStateNotice state={state} label="as informações de estágio" />

      {!state.isLoading && !state.isError ? (
        <div className="space-y-4">
          {modules.map((module, moduleIndex) => {
            const moduleHours = module.itens.reduce((total, discipline) => total + getPlannedHours(discipline), 0);
            return (
              <CurriculumModuleSection
                key={module.id}
                title={module.nome}
                order={module.ordem}
                itemCount={module.itens.length}
                detail={`${formatNumeric(moduleHours)}h de estágio previstas neste módulo`}
                defaultOpen={moduleIndex === 0}
              >
                <div className="grid gap-3">
          {module.itens.map((discipline) => {
            const disciplineId = getDisciplineId(discipline);
            const evaluation = evaluationByDiscipline.get(disciplineId);
            const disciplineName = discipline.disciplinas?.nome || 'Disciplina de estágio';
            const plannedHours = getPlannedHours(discipline);
            const period = discipline.periodo_letivo;
            const periodStatus = String(period?.status || 'PLANEJADO').toUpperCase();
            const frequency = asNullableNumber(evaluation?.frequencia_estagio);
            const finalGrade = asNullableNumber(evaluation?.nota_final);
            const approved = finalGrade !== null && frequency !== null
              ? finalGrade >= 6 && frequency >= 75
              : null;

            return (
              <article key={disciplineId} className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[#001a33]">{disciplineName}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
                      <span className="flex items-center gap-1"><Clock3 size={12} /> {formatNumeric(plannedHours)}h previstas</span>
                      <span className="flex items-center gap-1"><CalendarDays size={12} /> {period?.nome || 'Período a definir'}</span>
                    </div>
                    {period?.data_inicio || period?.data_fim ? (
                      <p className="mt-1 text-[10px] text-slate-400">
                        {formatDate(period.data_inicio)} até {formatDate(period.data_fim)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${PERIOD_STYLES[periodStatus] || PERIOD_STYLES.PLANEJADO}`}>
                      {PERIOD_LABELS[periodStatus] || 'Período a definir'}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${approved === null ? 'border-slate-100 bg-slate-50 text-slate-500' : approved ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-rose-100 bg-rose-50 text-rose-600'}`}>
                      {!evaluation ? 'Aguardando avaliação' : approved === null ? 'Avaliação pendente' : approved ? 'Aprovado' : 'Reprovado'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3">
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Carga prevista</p><p className="font-black text-slate-700">{formatNumeric(plannedHours)}h</p></div>
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Horas cumpridas</p><p className="font-black text-slate-500">Não registradas</p></div>
                  <div><p className="text-[9px] font-black uppercase text-slate-400">Progresso de horas</p><p className="font-black text-slate-500">Não disponível</p></div>
                </div>

                {evaluation ? (
                  <>
                    <p className="mt-4 text-xs text-slate-500">
                      Instrutor: <strong>{evaluation.instrutor_nome || 'Não definido'}</strong> · Avaliação: {evaluation.data_avaliacao ? formatDate(evaluation.data_avaliacao) : 'não informada'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
                      {[
                        ['Frequência', `${formatNumeric(evaluation.frequencia_estagio)}%`],
                        ['Comportamento', formatNumeric(evaluation.nota_comportamento)],
                        ['Registros', formatNumeric(evaluation.nota_registros)],
                        ['Técnica', formatNumeric(evaluation.nota_tecnicas)],
                        ['Nota final', formatNumeric(evaluation.nota_final)],
                      ].map(([label, value]) => <div key={label}><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="font-black text-slate-700">{value}</p></div>)}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-3 text-xs font-semibold text-slate-500">
                    Esta disciplina possui estágio previsto, mas ainda não recebeu avaliação. A carga cumprida não pode ser calculada porque o modelo atual não registra horas por aluno.
                  </p>
                )}
              </article>
            );
          })}
                </div>
              </CurriculumModuleSection>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default InternshipTab;
