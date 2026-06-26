// File: modules/gestor/cadastros/cursos-ead/components/CursoEadCard.tsx

import React from 'react';
import { Clock, GraduationCap, Copy, Power, PowerOff, Trash2, Edit3, CheckCircle2, CreditCard } from 'lucide-react';
import { Curso, EadConfig } from '../../cadastros.types';

interface CursoEadCardProps {
  curso: Curso;
  onClick?: () => void;
  onDuplicate?: (e: React.MouseEvent) => void;
  onToggleStatus?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  readOnly?: boolean;
}

const CursoEadCard: React.FC<CursoEadCardProps> = ({ curso, onClick, onDuplicate, onToggleStatus, onDelete, readOnly = false }) => {
  const area = curso.area || 'Saúde';
  const descricao = curso.descricao || `Curso livre na modalidade de Educação a Distância em ${curso.nome}.`;

  const config: EadConfig = curso.ead_config || {
    cronograma: [],
    conteudos: [],
    provas: [],
    certificacao: { emitirAutomatico: true, minimoAproveitamento: 70 }
  };

  const videoCount = config.conteudos?.filter(c => c.videoUrl)?.length || 0;
  const questionsCount = config.provas?.reduce((acc, p) => acc + (p.questoes?.length || 0), 0) || 0;

  return (
    <div 
      className="group bg-white rounded-[2rem] border border-slate-200 p-6 hover:shadow-xl hover:shadow-purple-900/10 hover:border-purple-300 transition-all duration-300 flex flex-col h-full relative overflow-hidden"
    >
      {/* Imagem de Capa */}
      <div className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 mb-4 relative z-10">
        {curso.imagem_url ? (
          <img
            src={curso.imagem_url}
            alt={`Capa do curso EAD ${curso.nome}`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full text-purple-600 bg-purple-50 flex items-center justify-center">
            <GraduationCap size={38} />
          </div>
        )}
      </div>

      {/* Badges de Área e Versão */}
      <div className="flex items-center justify-end gap-1.5 mb-4 relative z-10">
        <span className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase px-3 py-1 rounded-full border border-slate-150">
          {area}
        </span>
        <span className="bg-purple-50 text-purple-600 text-[10px] font-bold px-2 py-1 rounded-full border border-purple-100">
          v{curso.versao || '1.0'}
        </span>
      </div>

      {/* Título e Descrição */}
      <h3 className="text-base font-black text-[#001a33] mb-2 group-hover:text-purple-600 transition-colors relative z-10 line-clamp-2">
        {curso.nome}
      </h3>
      <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2 relative z-10 leading-relaxed">
        {descricao}
      </p>

      {/* Carga Horária e Preço */}
      <div className="mt-auto space-y-3 relative z-10">
        <div className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <Clock size={15} className="text-purple-500" />
            <span className="font-bold">{curso.carga_horaria || 0}h EAD</span>
          </div>
          {curso.valor && curso.valor > 0 ? (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md font-black text-[11px]">
              <CreditCard size={12} />
              R$ {curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          ) : (
            <span className="bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-md font-black text-[10px]">
              Sem Valor
            </span>
          )}
        </div>

        {/* Informações de Módulos Configurados */}
        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
          <span>{videoCount} Videoaulas</span>
          <span>{questionsCount} Questões</span>
        </div>

        {/* Ações */}
        {!readOnly && (
        <div className="flex flex-col gap-2 relative z-20 pt-2 border-t border-slate-100">
          <button 
            onClick={onClick}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-purple-700 transition-all shadow-md shadow-purple-600/15"
          >
            <span className="flex items-center gap-1.5">
              <Edit3 size={12} />
              <span>Configurar EAD</span>
            </span>
            <CheckCircle2 size={12} />
          </button>
          
          <div className="flex gap-2">
            <button 
              onClick={onDuplicate}
              title="Copiar / Criar Nova Versão"
              className="flex-1 flex items-center justify-center gap-1 p-2.5 bg-slate-50 text-slate-500 hover:bg-purple-50 hover:text-purple-600 rounded-xl border border-slate-200 transition-colors"
            >
              <Copy size={13} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Copiar</span>
            </button>
            
            <button 
              onClick={onToggleStatus}
              title={curso.status === 'ativo' ? 'Inativar Curso' : 'Ativar Curso'}
              className={`flex-1 flex items-center justify-center gap-1 p-2.5 rounded-xl border border-slate-200 transition-colors ${
                curso.status === 'ativo' 
                  ? 'bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-550' 
                  : 'bg-red-50 text-red-550 hover:bg-purple-50 hover:text-purple-600'
              }`}
            >
              {curso.status === 'ativo' ? (
                <>
                  <Power size={13} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Pausar</span>
                </>
              ) : (
                <>
                  <PowerOff size={13} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Ativar</span>
                </>
              )}
            </button>

            <button 
              onClick={onDelete}
              title="Excluir Curso"
              className="p-2.5 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl border border-slate-200 transition-colors flex items-center justify-center"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Decorative Gradient Glow */}
      <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-50 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur-2xl"></div>
    </div>
  );
};

export default CursoEadCard;
