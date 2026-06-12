
import React from 'react';
import { MapPin, Users, GraduationCap, ArrowRight, Building } from 'lucide-react';

interface Parceiro {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  alunosCount: number;
  professoresCount: number;
  tipo: string; // Ex: Prefeitura, Empresa Privada
}

interface ParceirosCardProps {
  data: Parceiro;
}

const ParceirosCard: React.FC<ParceirosCardProps> = ({ data }) => {
  const isPrefeitura = data.tipo.toLowerCase().includes('prefeitura');
  const themeColor = isPrefeitura ? 'bg-blue-600' : 'bg-slate-800';

  return (
    <div className="group bg-white rounded-[2rem] border border-slate-100 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-900/10 transition-all duration-300 flex flex-col justify-between h-full overflow-hidden relative">
      
      {/* Header Colorido do Card */}
      <div className={`h-24 ${themeColor} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
        {/* Círculo decorativo */}
        <div className="absolute -right-4 -top-8 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
      </div>

      {/* Conteúdo Principal (Sobrepondo o Header) */}
      <div className="px-6 relative -mt-12 flex-1">
        
        {/* Ícone da Entidade */}
        <div className="w-20 h-20 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-4 border-4 border-white">
          <Building size={32} className={isPrefeitura ? 'text-blue-600' : 'text-slate-700'} />
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isPrefeitura ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
              {data.tipo}
            </span>
          </div>

          <h3 className="text-xl font-black text-[#001a33] mb-2 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">
            {data.nome}
          </h3>
          
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
            <MapPin size={14} className="text-slate-400" />
            <span>{data.cidade}, {data.estado}</span>
          </div>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
            <div className="flex items-center gap-2 text-slate-400 mb-1 group-hover:text-blue-400">
              <GraduationCap size={16} />
              <span className="text-[10px] font-black uppercase tracking-wide">Alunos</span>
            </div>
            <p className="text-lg font-black text-slate-700 group-hover:text-blue-700">{data.alunosCount}</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
            <div className="flex items-center gap-2 text-slate-400 mb-1 group-hover:text-blue-400">
              <Users size={16} />
              <span className="text-[10px] font-black uppercase tracking-wide">Profs.</span>
            </div>
            <p className="text-lg font-black text-slate-700 group-hover:text-blue-700">{data.professoresCount}</p>
          </div>
        </div>
      </div>

      {/* Rodapé do Card */}
      <div className="px-6 pb-6 pt-2">
        <button className="w-full flex items-center justify-between p-4 rounded-xl bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-widest group-hover:bg-[#001a33] group-hover:text-white transition-all duration-300">
          <span>Gerenciar</span>
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default ParceirosCard;
