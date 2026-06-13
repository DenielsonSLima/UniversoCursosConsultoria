// File: modules/gestor/cadastros/cursos-especializacao/components/CursoEspecializacaoCard.tsx

import React from 'react';
import { Clock, Calendar, ChevronRight, Award, GraduationCap, Copy, Power, PowerOff } from 'lucide-react';
import { Curso } from '../../cadastros.types';

interface CursoEspecializacaoCardProps {
  curso: Curso;
  onClick: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onToggleStatus: (e: React.MouseEvent) => void;
}

const CursoEspecializacaoCard: React.FC<CursoEspecializacaoCardProps> = ({ curso, onClick, onDuplicate, onToggleStatus }) => {
  const area = curso.area || 'Saúde';
  const requisito = 'Graduação ou Curso Técnico concluído';
  const duracaoMeses = curso.carga_horaria >= 360 ? 12 : 6;
  const descricao = curso.descricao || `Curso de especialização de pós-formação profissional em ${curso.nome}.`;

  const hasGradeConfigured = curso.carga_horaria > 0;

  return (
    <div 
      className="group bg-white rounded-[2rem] border border-slate-100 p-6 hover:shadow-xl hover:shadow-rose-900/10 hover:border-rose-200 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
    >
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-colors">
          <Award size={28} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase px-3 py-1 rounded-full border border-slate-100">
            {area}
          </span>
          <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-1 rounded-full border border-rose-100">
            v{curso.versao}
          </span>
        </div>
      </div>

      <h3 className="text-lg font-black text-[#001a33] mb-2 group-hover:text-rose-600 transition-colors relative z-10">
        {curso.nome}
      </h3>
      
      <div className="flex items-center gap-2 mb-4 text-xs text-slate-400 font-medium">
         <GraduationCap size={14} />
         <span>Req: {requisito}</span>
      </div>

      <p className="text-xs text-slate-500 font-medium mb-6 line-clamp-2 relative z-10">
        {descricao}
      </p>

      <div className="mt-auto space-y-3 relative z-10">
        {hasGradeConfigured ? (
          <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
            <Clock size={16} className="text-rose-500" />
            <span className="font-bold">{curso.carga_horaria}h</span>
            <span className="text-slate-400">|</span>
            <Calendar size={16} className="text-blue-500" />
            <span className="font-bold">{duracaoMeses} Meses</span>
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-bold bg-slate-50 p-3 rounded-xl text-center uppercase tracking-wider">
            Grade não configurada
          </div>
        )}

        <div className="flex gap-2 relative z-20">
          <button 
            onClick={onClick}
            className="flex-1 flex items-center justify-between p-3 rounded-xl bg-[#001a33] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-600 transition-colors"
          >
            <span>Ver Grade</span>
            <ChevronRight size={14} />
          </button>
          
          <button 
            onClick={onDuplicate}
            title="Copiar / Criar Nova Versão"
            className="p-3 bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-100 transition-colors"
          >
            <Copy size={14} />
          </button>
          
          <button 
            onClick={onToggleStatus}
            title={curso.status === 'ativo' ? 'Inativar Curso' : 'Ativar Curso'}
            className={`p-3 rounded-xl border border-slate-100 transition-colors ${
              curso.status === 'ativo' 
                ? 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500' 
                : 'bg-red-50 text-red-500 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
          >
            {curso.status === 'ativo' ? <Power size={14} /> : <PowerOff size={14} />}
          </button>
        </div>
      </div>

      {/* Decorative */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-rose-50 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-2xl"></div>
    </div>
  );
};

export default CursoEspecializacaoCard;
