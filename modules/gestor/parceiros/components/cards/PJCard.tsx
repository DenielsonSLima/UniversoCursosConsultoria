// File: modules/gestor/parceiros/components/cards/PJCard.tsx

import React from 'react';
import { MoreVertical, Building, MapPin, Mail, Phone, FileText, DollarSign, ChevronRight } from 'lucide-react';

interface PJCardProps {
  data: any;
  onClick?: () => void;
}

const PJCard: React.FC<PJCardProps> = ({ data, onClick }) => {
  return (
    <div 
        onClick={onClick} 
        className="bg-white rounded-[24px] border border-slate-200/60 p-6 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-slate-800/40 transition-all duration-300 group relative cursor-pointer flex flex-col h-full overflow-hidden"
    >
      {/* Decorative gradient blur */}
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-slate-100 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      {/* Header Profile */}
      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-[14px] bg-slate-800 text-white flex items-center justify-center overflow-hidden border border-slate-700 shadow-sm shrink-0">
             {data.foto ? (
                 <img src={data.foto} alt={data.nome} className="w-full h-full object-cover" />
             ) : (
                 <Building size={22} className="opacity-80" />
             )}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-slate-900 transition-colors mb-0.5" title={data.nome}>
              {data.nome}
            </h3>
            {data.cnpj && (
              <div className="text-[11px] text-slate-500 font-medium tracking-wide">
                CNPJ: {data.cnpj}
              </div>
            )}
            {data.dataFundacao && (
              <div className="text-[11px] text-slate-500 font-medium">
                Fundação: {data.dataFundacao}
              </div>
            )}
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-700 transition-colors p-1 -mr-1" onClick={(e) => { e.stopPropagation(); /* Menu handler */ }}>
          <MoreVertical size={16} />
        </button>
      </div>

      {/* Info List */}
      <div className="flex-1 space-y-3 relative z-10">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border ${
            data.status === 'inativo' 
            ? 'bg-slate-50 text-slate-500 border-slate-200' 
            : 'bg-emerald-50 text-emerald-600 border-emerald-100/50'
          }`}>
             {data.status === 'inativo' ? 'Inativo' : 'Ativo'}
          </span>

          <span className="px-2.5 py-1 bg-slate-100 text-slate-800 text-[10px] font-bold uppercase tracking-widest rounded-md border border-slate-200">
             {data.tipo || 'Pessoa Jurídica'}
          </span>
          
          {data.roles?.map((role: string) => (
             <span key={role} className="px-2.5 py-1 bg-slate-50 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-md border border-slate-200">
               {role}
             </span>
          ))}
        </div>

        {(data.telefone || data.email) && (
          <div className="space-y-2 text-xs">
            {data.telefone && (
              <div className="flex items-center gap-2.5 text-slate-600">
                <Phone size={14} className="text-slate-400 shrink-0"/>
                <span className="truncate font-medium">{data.telefone}</span>
              </div>
            )}
            {data.email && (
              <div className="flex items-center gap-2.5 text-slate-600">
                <Mail size={14} className="text-slate-400 shrink-0"/>
                <span className="truncate font-medium">{data.email}</span>
              </div>
            )}
          </div>
        )}

        {(data.endereco || data.cidade) && (
          <div className="flex items-start gap-2.5 text-xs text-slate-600 pt-1">
            <MapPin size={14} className="text-slate-400 shrink-0 mt-0.5"/>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="truncate font-medium" title={`${data.endereco || ''} ${data.bairro ? '- ' + data.bairro : ''}`}>{data.endereco || '-'} {data.bairro ? ` - ${data.bairro}` : ''}</span>
              {data.cidade && <span className="text-[11px] text-slate-400 mt-0.5">{data.cidade}/{data.estado || ''}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
            {(data.pendenciasDocs || data.pendenciasFinanceiras) && (
                <div className="flex items-center gap-1.5 pr-2 mr-1">
                    {data.pendenciasDocs && (
                        <div className="text-amber-500 flex items-center justify-center" title="Documentos Pendentes">
                            <FileText size={14} strokeWidth={2.5} />
                        </div>
                    )}
                    {data.pendenciasFinanceiras && (
                        <div className="text-red-500 flex items-center justify-center" title="Pendência Financeira">
                            <DollarSign size={14} strokeWidth={2.5} />
                        </div>
                    )}
                </div>
            )}
        </div>
        
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider group-hover:text-slate-800 transition-colors">
          ID {data.id} <ChevronRight size={14} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
        </div>
      </div>
    </div>
  );
};

export default PJCard;
