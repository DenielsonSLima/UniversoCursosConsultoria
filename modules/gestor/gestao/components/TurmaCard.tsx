
import React from 'react';
import { Users, Calendar, Clock, MoreVertical, GraduationCap, MapPin, ChevronRight, CheckCircle2, TrendingUp } from 'lucide-react';
import { Turma } from '../gestao.types';

interface TurmaCardProps {
  turma: Turma;
  colorTheme: string; // 'emerald' | 'amber' | 'rose' | 'purple'
}

const TurmaCard: React.FC<TurmaCardProps> = ({ turma, colorTheme }) => {
  
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
  const percentualOcupacao = (turma.alunosMatriculados / turma.vagasTotais) * 100;

  return (
    <div className={`bg-white rounded-[2rem] p-6 border ${colors.border} shadow-sm hover:shadow-2xl transition-all duration-300 relative overflow-hidden group flex flex-col h-full`}>
      
      {/* Background Gradient Effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 -mr-10 -mt-10 blur-3xl rounded-full transition-transform duration-700 group-hover:scale-150 ${colors.fill}`}></div>

      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-3">
             <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg w-fit ${colors.subtle} ${colors.text} border ${colors.border}`}>
               {turma.codigo}
             </span>
             {turma.status === 'FINALIZADA' && (
                <span className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded uppercase flex items-center gap-1 bg-slate-100 text-slate-500">
                  <CheckCircle2 size={10} /> Finalizada
                </span>
             )}
          </div>
          <h3 className="text-xl font-black text-[#001a33] leading-tight group-hover:text-blue-600 transition-colors mb-1 pr-4 line-clamp-2">
            {turma.nome}
          </h3>
          <p className="text-xs text-slate-500 font-bold flex items-center gap-1.5 truncate max-w-[220px]" title={turma.cursoNome}>
            <GraduationCap size={14} className={colors.text} />
            {turma.cursoNome}
          </p>
        </div>
        <button className="text-slate-300 hover:text-slate-600 p-1 bg-white rounded-full shadow-sm border border-slate-100 shrink-0">
          <MoreVertical size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-6 relative z-10 flex-1">
        {turma.poloNome && (
           <div className="flex items-center justify-between text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-xl">
             <div className="flex items-center gap-2">
                <MapPin size={14} className="text-slate-400" />
                <span>Polo / Unidade</span>
             </div>
             <span className="font-bold text-[#001a33]">{turma.poloNome}</span>
           </div>
        )}
        
        <div className="flex items-center justify-between text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-xl">
           <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <span>Período Previsto</span>
           </div>
           <span className="font-bold text-[#001a33]">{new Date(turma.dataInicio).toLocaleDateString('pt-BR')} - {new Date(turma.dataPrevisaoTermino).toLocaleDateString('pt-BR')}</span>
        </div>

        <div className="flex items-center justify-between text-xs font-medium text-slate-600 bg-slate-50 p-2 rounded-xl">
           <div className="flex items-center gap-2">
              <Clock size={14} className="text-slate-400" />
              <span>Turno de Aulas</span>
           </div>
           <span className="font-bold text-[#001a33] uppercase">{turma.turno}</span>
        </div>
      </div>

      {/* Barra de Progresso / Alunos */}
      <div className="mt-auto relative z-10 pt-4 border-t border-slate-100">
        <div className="flex justify-between items-end mb-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ocupação da Turma</span>
            <span className="font-black text-slate-700 flex items-center gap-1.5 text-sm">
              <Users size={16} className={colors.text} /> {turma.alunosMatriculados} <span className="text-slate-400 font-medium">/ {turma.vagasTotais} vagas</span>
            </span>
            <div className="flex items-center gap-2 mt-1">
              {turma.alunosAtivos !== undefined && (
                 <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                   Ocupados: {turma.alunosAtivos}
                 </span>
              )}
              {turma.alunosInativos !== undefined && turma.alunosInativos > 0 && (
                 <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                   Inativos: {turma.alunosInativos}
                 </span>
              )}
            </div>
          </div>
          <div className={`flex flex-col items-end ${colors.text}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
               <TrendingUp size={10} /> Ocupação
            </span>
            <span className="font-black text-lg">{Math.round(percentualOcupacao)}%</span>
          </div>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-1000 ease-out ${colors.fill}`} 
            style={{ width: `${percentualOcupacao}%` }}
          ></div>
        </div>
      </div>

    </div>
  );
};

export default TurmaCard;
