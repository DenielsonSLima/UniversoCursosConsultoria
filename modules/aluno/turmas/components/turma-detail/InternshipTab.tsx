import React from 'react';
import { Shield } from 'lucide-react';
import type { EstagioAluno, QueryDisplayState } from '../../turmas.types';
import { asNullableNumber, formatDate, formatNumeric } from '../../turmas.utils';
import QueryStateNotice from '../QueryStateNotice';

interface InternshipTabProps { internships: EstagioAluno[]; state: QueryDisplayState }

const InternshipTab: React.FC<InternshipTabProps> = ({ internships, state }) => (
  <div className="space-y-4 pt-4">
    <div className="flex items-center gap-2"><Shield size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Situação do estágio</h4></div>
    <QueryStateNotice state={state} label="as informações de estágio" />
    {!state.isLoading && !state.isError && internships.length === 0 ? <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma informação de estágio disponível.</div> : null}
    {!state.isError && internships.length > 0 ? <div className="grid gap-3">{internships.map((evaluation) => {
      const disciplineName = evaluation.disciplinas?.nome || 'Estágio';
      const frequency = asNullableNumber(evaluation.frequencia_estagio);
      const finalGrade = asNullableNumber(evaluation.nota_final);
      const approved = finalGrade !== null && frequency !== null ? finalGrade >= 6 && frequency >= 75 : null;
      return (
        <div key={evaluation.id || `${disciplineName}-${evaluation.created_at}`} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-[#001a33]">{disciplineName}</p><p className="mt-1 text-xs text-slate-500">Instrutor: {evaluation.instrutor_nome || 'Não definido'}</p><p className="mt-1 text-[10px] text-slate-500">Data: {evaluation.data_avaliacao ? formatDate(evaluation.data_avaliacao) : 'não informada'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${approved === null ? 'border-slate-100 bg-slate-50 text-slate-500' : approved ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : 'border-rose-100 bg-rose-50 text-rose-600'}`}>{approved === null ? 'Pendente' : approved ? 'Aprovado' : 'Reprovado'}</span></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">{[['Frequência', `${formatNumeric(evaluation.frequencia_estagio)}%`], ['Comportamento', formatNumeric(evaluation.nota_comportamento)], ['Registros', formatNumeric(evaluation.nota_registros)], ['Técnica', formatNumeric(evaluation.nota_tecnicas)]].map(([label, value]) => <div key={label}><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="font-black text-slate-700">{value}</p></div>)}</div>
        </div>
      );
    })}</div> : null}
  </div>
);

export default InternshipTab;
