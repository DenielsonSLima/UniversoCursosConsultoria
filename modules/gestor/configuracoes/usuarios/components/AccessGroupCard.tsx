
import React from 'react';
import { Users, Building2, ShieldCheck, ArrowRight, Lock } from 'lucide-react';

interface AccessGroupCardProps {
  title: string;
  description: string;
  type: 'global' | 'company';
  userCount: number;
  onClick: () => void;
}

const AccessGroupCard: React.FC<AccessGroupCardProps> = ({ title, description, type, userCount, onClick }) => {
  const isGlobal = type === 'global';

  return (
    <div 
      onClick={onClick}
      className={`relative group rounded-[2rem] p-6 cursor-pointer transition-all duration-300 overflow-hidden flex flex-col justify-between h-64 border ${
        isGlobal 
          ? 'bg-[#001a33] border-[#001a33] text-white shadow-xl shadow-blue-900/20' 
          : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10'
      }`}
    >
      {/* Background Decorativo */}
      {isGlobal ? (
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
      ) : (
        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-blue-50 transition-colors"></div>
      )}

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-colors ${
            isGlobal 
              ? 'bg-white/10 border-white/10 text-blue-300' 
              : 'bg-slate-50 border-slate-100 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'
          }`}>
            {isGlobal ? <ShieldCheck size={28} /> : <Building2 size={28} />}
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
            isGlobal ? 'bg-blue-500/20 text-blue-200' : 'bg-slate-100 text-slate-500'
          }`}>
            {userCount} Usuários
          </div>
        </div>

        <h3 className={`text-xl font-black mb-2 leading-tight ${
          isGlobal ? 'text-white' : 'text-[#001a33]'
        }`}>
          {title}
        </h3>
        <p className={`text-xs font-medium leading-relaxed ${
          isGlobal ? 'text-blue-200/70' : 'text-slate-500'
        }`}>
          {description}
        </p>
      </div>

      <div className={`relative z-10 pt-4 mt-auto border-t flex items-center justify-between ${
        isGlobal ? 'border-white/10 text-blue-300' : 'border-slate-100 text-slate-400 group-hover:text-blue-600'
      }`}>
        <span className="text-[10px] font-bold uppercase tracking-widest">
          Gerenciar Acessos
        </span>
        <div className={`p-2 rounded-full transition-transform group-hover:translate-x-1 ${
           isGlobal ? 'bg-white/10' : 'bg-slate-50 group-hover:bg-blue-50'
        }`}>
          <ArrowRight size={16} />
        </div>
      </div>
    </div>
  );
};

export default AccessGroupCard;
