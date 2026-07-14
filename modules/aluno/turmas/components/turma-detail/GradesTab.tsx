import React from 'react';
import { NotebookText } from 'lucide-react';
import type { DisciplinaResumoAluno, QueryDisplayState } from '../../turmas.types';
import { asNullableNumber, formatNumeric } from '../../turmas.utils';
import QueryStateNotice from '../QueryStateNotice';

interface GradesTabProps {
  disciplines: DisciplinaResumoAluno[];
  disciplinesState: QueryDisplayState;
  resultsState: QueryDisplayState;
  sharedQueryState?: boolean;
}

const RESULT_LABELS: Record<string, string> = {
  APROVADO: 'Aprovado',
  APROVEITADO: 'Aproveitado',
  EM_RECUPERACAO: 'Em recuperação',
  REPROVADO: 'Reprovado',
  REPROVADO_FREQUENCIA: 'Reprovado por frequência',
  FREQUENCIA_PENDENTE: 'Frequência pendente',
  SEM_LANCAMENTO: 'Sem lançamento',
};

const GradesTab: React.FC<GradesTabProps> = ({ disciplines, disciplinesState, resultsState, sharedQueryState = false }) => {
  const hasError = disciplinesState.isError || resultsState.isError;
  const isLoading = disciplinesState.isLoading || resultsState.isLoading;
  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2"><NotebookText size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Notas por disciplina</h4></div>
      <QueryStateNotice state={disciplinesState} label={sharedQueryState ? 'as disciplinas e os resultados acadêmicos' : 'as disciplinas'} />
      {!sharedQueryState ? <QueryStateNotice state={resultsState} label="os resultados acadêmicos" /> : null}
      {!isLoading && !hasError && disciplines.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma disciplina vinculada para exibir notas.</div> : null}
      {!hasError && disciplines.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
          <div className="min-w-[780px] divide-y divide-slate-100">
            <div className="grid grid-cols-9 gap-2 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><span className="col-span-2">Disciplina</span><span>P</span><span>TI</span><span>TG</span><span>S</span><span>CQ</span><span>O</span><span>Final</span></div>
            {disciplines.map((discipline) => {
              const grade = discipline.notas;
              const recovery = asNullableNumber(grade?.nota_rec);
              const finalGrade = asNullableNumber(grade?.media_final);
              const resultKey = String(grade?.resultado_final || 'SEM_LANCAMENTO').toUpperCase();
              return (
                <div key={`${discipline.id}-notas`} className="grid grid-cols-9 items-center gap-2 p-3 text-xs">
                  <p className="col-span-2 font-bold text-[#001a33]">{discipline.nome}</p>
                  <span className="text-center">{formatNumeric(grade?.nota_p)}</span><span className="text-center">{formatNumeric(grade?.nota_ti)}</span><span className="text-center">{formatNumeric(grade?.nota_tg)}</span><span className="text-center">{formatNumeric(grade?.nota_s)}</span><span className="text-center">{formatNumeric(grade?.nota_cq)}</span><span className="text-center">{formatNumeric(grade?.nota_o)}</span><span className="text-center font-black text-blue-600">{formatNumeric(finalGrade)}</span>
                  <span className="col-span-9 mt-1 text-[10px] text-slate-500">{recovery === null ? 'REC: não lançada' : `REC: ${formatNumeric(recovery)}`} | frequência: {discipline.frequency ?? '--'}% | resultado: {RESULT_LABELS[resultKey] || resultKey.replaceAll('_', ' ').toLowerCase()}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GradesTab;
