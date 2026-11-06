
import React, { useState } from 'react';
import { Users, Calendar, Clock, MoreVertical, GraduationCap, CheckCircle2, TrendingUp, BookOpen, PlayCircle, Trash2 } from 'lucide-react';
import { Turma } from '../gestao.types';
import { formatCivilDate } from '../gestao-date.utils';

interface TurmaCardProps {
  turma: Turma;
  colorTheme: string; // 'emerald' | 'amber' | 'rose' | 'purple'
  showDisciplineProgress?: boolean;
  onClick?: () => void;
  onDelete?: React.Dispatch<Turma>;
}

const TurmaCard: React.FC<TurmaCardProps> = ({
  turma,
  colorTheme,
  showDisciplineProgress = false,
  onClick,
  onDelete,
}) => {
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  
  // Mapeamento de cores baseado no tema passado
  const getColors = () => {
    switch(colorTheme) {
      case 'emerald': return { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', fill: 'bg-emerald-500', subtle: 'bg-emerald-500/10' };
      case 'amber': return { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', fill: 'bg-amber-500', subtle: 'bg-amber-500/10' };
      case 'rose': return { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', fill: 'bg-rose-500', subtle: 'bg-rose-500/10' };
      case 'purple': return { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', fill: 'bg-purple-500', subtle: 'bg-purple-500/10' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-100', fill: 'bg-slate-500', subtle: 'bg-slate-500/10' };
    }
  };

  const colors = getColors();
  const percentualOcupacao = turma.vagasTotais > 0
    ? Math.min(100, Math.max(0, (turma.alunosMatriculados / turma.vagasTotais) * 100))
    : 0;
  const disciplinasConcluidas = turma.disciplinasConcluidas;
  const totalDisciplinas = turma.totalDisciplinas;
  const hasDisciplineCounts = disciplinasConcluidas !== undefined && totalDisciplinas !== undefined;
  const progressoDisciplinas = hasDisciplineCounts
    ? `${disciplinasConcluidas}/${totalDisciplinas}`
    : '—/—';
  const progressoDisciplinasLabel = !hasDisciplineCounts
    ? 'Progresso de disciplinas indisponível'
    : totalDisciplinas === 1
      ? `${disciplinasConcluidas} de 1 disciplina concluída`
      : `${disciplinasConcluidas} de ${totalDisciplinas} disciplinas concluídas`;

  return (
    <div
      onClick={onClick}
      className={`gestao-catalog-card bg-white rounded-xl p-4 border border-slate-200 hover:border-slate-300 transition-colors relative group flex flex-col h-full min-w-0 ${onClick ? 'cursor-pointer' : ''}`}
    >
      

      <div className="flex justify-between items-center gap-2 mb-3 relative z-10">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-2">
             <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md w-fit ${colors.subtle} ${colors.text} border ${colors.border}`}>
               {turma.codigo}
             </span>
             {turma.status === 'FINALIZADA' && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1 bg-slate-100 text-slate-500">
                  <CheckCircle2 size={10} /> Finalizada
                </span>
             )}
          </div>
          <h3 className="text-[13px] font-medium text-[#122b42] leading-5 group-hover:text-blue-600 transition-colors mb-1 break-words">
            {onClick ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onClick();
                }}
                className="w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {turma.nome}
              </button>
            ) : turma.nome}
          </h3>
          <p className="text-[11px] text-[#607286] font-normal flex items-center gap-1.5" title={turma.cursoNome}>
            <GraduationCap size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
            <span className="min-w-0 break-words">{turma.cursoNome}</span>
          </p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsActionsOpen((current) => !current);
            }}
            className="flex min-h-9 min-w-9 items-center justify-center text-slate-400 hover:text-slate-700 bg-white rounded-lg hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            title="Ações da turma"
            aria-label={`Ações da turma ${turma.codigo}`}
            aria-expanded={isActionsOpen}
          >
            <MoreVertical size={16} />
          </button>

          {isActionsOpen && onDelete && (
            <div
              className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-lg border border-slate-100 bg-white p-1 shadow-xl shadow-slate-900/10"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsActionsOpen(false);
                  onDelete(turma);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50"
              >
                <Trash2 size={14} />
                Excluir turma
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-3 relative z-10 flex-1">
        <div className="flex items-center justify-between gap-3 text-[11px] font-normal text-[#607286] py-1">
           <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <span>Período Previsto</span>
           </div>
           <span className="font-medium text-[#122b42]">{formatCivilDate(turma.dataInicio)} - {formatCivilDate(turma.dataPrevisaoTermino)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] font-normal text-[#607286] py-1">
           <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <span>Turno de Aulas</span>
           </div>
           <span className="font-medium text-[#122b42] uppercase">{turma.turno}</span>
        </div>

        {showDisciplineProgress && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                <BookOpen size={13} className={colors.text} />
                Disciplinas
              </span>
              <span aria-label={progressoDisciplinasLabel} className={`text-[13px] font-medium ${colors.text}`}>
                {progressoDisciplinas}
              </span>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200/60 pt-2">
              <PlayCircle size={14} className={`${colors.text} shrink-0`} />
              <div className="min-w-0 flex-1">
                {turma.moduloAtual && (
                  <div className="mb-2">
                    <p className="text-[11px] font-normal text-[#738498]">
                      Módulo atual{turma.moduloAtualOrdem ? ` ${turma.moduloAtualOrdem}` : ''}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] font-normal text-slate-600 break-words"
                      title={turma.moduloAtual}
                    >
                      {turma.moduloAtual}
                    </p>
                  </div>
                )}
                <p className="text-[11px] font-normal text-[#738498]">
                  {turma.progressoAcademicoDisponivel !== true
                    ? 'Progresso indisponível'
                    : turma.totalDisciplinas === 0
                    ? 'Grade não configurada'
                    : turma.disciplinaAtual
                      ? `Disciplina atual ${turma.disciplinaAtualOrdem}/${turma.totalDisciplinas}`
                      : turma.gradeConcluida === true
                        ? 'Grade concluída'
                        : 'Progresso indisponível'}
                </p>
                {turma.disciplinaAtual && (
                  <p
                    className="mt-0.5 text-[12px] font-medium text-[#122b42] break-words"
                    title={turma.disciplinaAtual}
                  >
                    {turma.disciplinaAtual}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra de Progresso / Alunos */}
      <div className="mt-auto relative z-10 pt-3 border-t border-slate-100">
        <div className="flex justify-between items-center gap-3 mb-2">
          <div className="flex flex-col">
            <span className="text-[11px] font-normal text-[#738498] mb-1">Ocupação da Turma</span>
            <span className="font-medium text-[#122b42] flex flex-wrap items-center gap-1.5 text-[13px]">
              <Users size={16} className={colors.text} /> {turma.alunosMatriculados} <span className="text-slate-400 font-medium">/ {turma.vagasTotais} vagas</span>
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {turma.alunosAtivos !== undefined && (
                 <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                   Ativos: {turma.alunosAtivos}
                 </span>
              )}
              {turma.alunosPendentes !== undefined && turma.alunosPendentes > 0 && (
                 <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                   Pendentes: {turma.alunosPendentes}
                 </span>
              )}
              {turma.alunosSaidas !== undefined && turma.alunosSaidas > 0 && (
                 <span className="text-[10px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                   Saídas: {turma.alunosSaidas}
                 </span>
              )}
            </div>
          </div>
          <div className={`flex flex-col items-end ${colors.text}`}>
            <span className="text-[10px] font-normal flex items-center gap-1">
               <TrendingUp size={10} /> Ocupação
            </span>
            <span className="font-medium text-[22px] leading-tight">{Math.round(percentualOcupacao)}%</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${colors.fill}`} 
            style={{ width: `${percentualOcupacao}%` }}
          ></div>
        </div>
      </div>

    </div>
  );
};

export default TurmaCard;
