import React from 'react';
import { FileSignature, Edit, Trash2, FileText, CheckCircle2 } from 'lucide-react';

interface FichaCardProps {
  ficha: any;
  onEdit: (ficha: any) => void;
  onDelete: (id: string) => void;
}

const FichaCard: React.FC<FichaCardProps> = ({ ficha, onEdit, onDelete }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Editar modelo ${ficha.nome}`}
      className="group flex h-full cursor-pointer flex-col rounded-3xl border border-slate-200 bg-white p-5 transition-all animate-fadeIn hover:border-blue-400 hover:shadow-lg focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      onClick={() => onEdit(ficha)}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onEdit(ficha);
      }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
          <FileSignature size={24} />
        </div>
        <div className="flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(ficha); }}
            aria-label={`Editar ${ficha.nome}`}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
          >
            <Edit size={16} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(ficha.id); }}
            aria-label={`Excluir ${ficha.nome}`}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1">
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-tight mb-1 line-clamp-2">
          {ficha.nome}
        </h4>
        <div className="flex flex-col gap-2 mt-3">
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
             <FileText size={12} className="text-slate-400" /> 
             {ficha.tipoCurso}
           </span>
           <span className={`text-[9px] font-bold uppercase tracking-widest self-start px-2 py-0.5 rounded-md ${
             ficha.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
           }`}>
             {ficha.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
           </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
          {ficha.requerAssinatura ? (
            <><CheckCircle2 size={12} className="text-emerald-500" /> Exige Assinatura</>
          ) : (
            'Sem Assinatura'
          )}
        </span>
        <span className="text-[10px] font-bold text-slate-400">
           {ficha.camposCount} CAMPOS
        </span>
      </div>
    </div>
  );
};

export default FichaCard;
