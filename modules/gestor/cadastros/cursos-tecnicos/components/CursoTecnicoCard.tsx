
import React from 'react';
import { Clock, Calendar, BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { CursoTecnico } from '../cursos-tecnicos.types';

interface CursoTecnicoCardProps {
  curso: CursoTecnico;
  onClick: () => void;
}

const CursoTecnicoCard: React.FC<CursoTecnicoCardProps> = ({ curso, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group bg-white rounded-[2rem] border border-slate-100 p-6 hover:shadow-xl hover:shadow-blue-900/10 hover:border-blue-200 transition-all duration-300 cursor-pointer flex flex-col h-full relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
          <GraduationCap size={28} />
        </div>
        <span className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase px-3 py-1 rounded-full border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
          {curso.area}
        </span>
      </div>

      <h3 className="text-lg font-black text-[#001a33] mb-2 group-hover:text-blue-600 transition-colors relative z-10">
        {curso.nome}
      </h3>
      <p className="text-xs text-slate-500 font-medium mb-6 line-clamp-2 relative z-10">
        {curso.descricao}
      </p>

      <div className="mt-auto space-y-3 relative z-10">
        <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
          <Clock size={16} className="text-emerald-500" />
          <span className="font-bold">{curso.cargaHorariaTotal}h</span>
          <span className="text-slate-400">|</span>
          <Calendar size={16} className="text-blue-500" />
          <span className="font-bold">{curso.duracaoMeses} Meses</span>
        </div>

        <button className="w-full flex items-center justify-between p-3 rounded-xl bg-[#001a33] text-white text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
          <span>Configurar Grade</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Decorative */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-emerald-50 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-2xl"></div>
    </div>
  );
};

export default CursoTecnicoCard;
