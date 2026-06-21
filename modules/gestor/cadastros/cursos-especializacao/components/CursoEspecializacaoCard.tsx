// File: modules/gestor/cadastros/cursos-especializacao/components/CursoEspecializacaoCard.tsx

import React from 'react';
import { Clock, Calendar, ChevronRight, Award, GraduationCap, Copy, Power, PowerOff, Trash2 } from 'lucide-react';
import { Curso } from '../../cadastros.types';

interface CursoEspecializacaoCardProps {
  curso: Curso;
  onClick: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onToggleStatus: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const CursoEspecializacaoCard: React.FC<CursoEspecializacaoCardProps> = ({ curso, onClick, onDuplicate, onToggleStatus, onDelete }) => {
  const area = curso.area || 'Saúde';
  const requisito = 'Graduação ou Curso Técnico concluído';
  const duracaoMeses = curso.carga_horaria >= 360 ? 12 : 6;
  const descricao = curso.descricao || `Curso de especialização de pós-formação profissional em ${curso.nome}.`;

  const hasGradeConfigured = curso.carga_horaria > 0;

  return (
    <div 
      className="group bg-white rounded-[2rem] border border-slate-100 p-6 hover:shadow-xl hover:shadow-rose-900/10 hover:border-rose-200 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
    >
      <div className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 mb-4 relative z-10">
        {curso.imagem_url ? (
          <img
            src={curso.imagem_url}
            alt={`Capa do curso ${curso.nome}`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <Award size={38} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5 mb-5 relative z-10">
        <span className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase px-3 py-1 rounded-full border border-slate-100">
          {area}
        </span>
        <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-1 rounded-full border border-rose-100">
          v{curso.versao}
        </span>
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

        <div className="flex flex-col gap-2 relative z-20">
          <button 
            onClick={onClick}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#001a33] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-600 transition-colors"
          >
            <span>Ver Grade</span>
            <ChevronRight size={14} />
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={onDuplicate}
              title="Copiar / Criar Nova Versão"
              className="flex-1 flex items-center justify-center gap-1.5 p-2.5 bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-xl border border-slate-100 transition-colors"
            >
              <Copy size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Duplicar</span>
            </button>
            
            <button 
              onClick={onToggleStatus}
              title={curso.status === 'ativo' ? 'Inativar Curso' : 'Ativar Curso'}
              className={`flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-slate-100 transition-colors ${
                curso.status === 'ativo' 
                  ? 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500' 
                  : 'bg-red-50 text-red-500 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
            >
              {curso.status === 'ativo' ? (
                <>
                  <Power size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Inativar</span>
                </>
              ) : (
                <>
                  <PowerOff size={14} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Ativar</span>
                </>
              )}
            </button>

            <button 
              onClick={onDelete}
              title="Excluir Curso"
              className="p-2.5 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl border border-slate-100 transition-colors flex items-center justify-center"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Decorative */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-rose-50 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-2xl"></div>
    </div>
  );
};

export default CursoEspecializacaoCard;
