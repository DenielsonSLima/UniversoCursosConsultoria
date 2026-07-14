import React from 'react';
import { BookOpen } from 'lucide-react';
import type { MatriculaAluno } from '../../turmas.types';
import { getEadConteudos, getFormattedDuration, getProgressPercent, getQuizScore } from '../../turmas.utils';

interface EadSummaryTabProps {
  matricula: MatriculaAluno;
  progress: Record<string, any> | null;
  onOpenCourse: () => void;
}

const EadSummaryTab: React.FC<EadSummaryTabProps> = ({ matricula, progress, onOpenCourse }) => {
  const course = matricula.turmas?.cursos;
  const contents = getEadConteudos(course as Record<string, any> | null);
  const completedIds = Array.isArray(progress?.progress?.completedContentIds)
    ? progress.progress.completedContentIds
    : Array.isArray(progress?.completedContentIds) ? progress.completedContentIds : [];
  const percent = getProgressPercent(progress);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1 rounded-2xl border border-blue-50 bg-blue-50/40 p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conclusão</p><p className="text-2xl font-black text-blue-700">{percent}%</p><div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div></div>
        <div className="space-y-1 rounded-2xl border border-emerald-50 bg-emerald-50/40 p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nota EAD</p><p className="text-2xl font-black text-emerald-700">{getQuizScore(progress) ?? '--'} <span className="text-xs font-normal text-slate-400">/ 100</span></p><p className="mt-2 text-[9px] font-medium text-slate-500">A prova final libera o certificado.</p></div>
        <div className="space-y-1 rounded-2xl border border-slate-100 bg-slate-50 p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Aulas concluídas</p><p className="text-2xl font-black text-slate-700">{completedIds.length} / {contents.length}</p><p className="mt-2 text-[9px] font-medium text-slate-500">Conteúdos marcados como lidos.</p></div>
      </div>
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2"><BookOpen size={16} className="text-blue-500" /><h4 className="text-xs font-bold uppercase tracking-wider text-[#001a33]">Aulas do curso</h4></div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
          {contents.length === 0 ? <div className="bg-slate-50/50 p-5 text-xs font-bold text-slate-500">Nenhuma aula cadastrada neste curso.</div> : contents.map((content: Record<string, any>, index: number) => {
            const done = completedIds.includes(content.id);
            return <button key={content.id || index} type="button" onClick={onOpenCourse} className="flex w-full flex-col gap-3 bg-slate-50/50 p-4 text-left text-xs font-medium transition-colors hover:bg-blue-50/60 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[#001a33]">{index + 1}. {content.titulo || `Aula ${index + 1}`}</p><p className="text-[10px] text-slate-400">{content.etapa || 'Módulo'} | {content.duracaoMinutos ? getFormattedDuration(content.duracaoMinutos) : content.duracao || 'Carga não informada'}</p></div><span className={`text-[10px] font-black uppercase tracking-widest ${done ? 'text-emerald-600' : 'text-slate-400'}`}>{done ? 'Concluída' : 'Pendente'}</span></button>;
          })}
        </div>
      </div>
    </div>
  );
};

export default EadSummaryTab;
