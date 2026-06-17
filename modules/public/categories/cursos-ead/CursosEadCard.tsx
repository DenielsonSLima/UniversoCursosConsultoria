
import React from 'react';
import { MonitorPlay } from 'lucide-react';

const CursosEadCard: React.FC = () => {
  const handleClick = () => {
    window.location.href = 'https://universocursos.curso.study/loja_virtual/index.php';
  };

  return (
    <div 
      onClick={handleClick}
      className="group relative bg-gradient-to-br from-emerald-600/90 to-teal-850/95 border border-emerald-500/40 p-6 rounded-2xl hover:from-emerald-500 hover:to-teal-700 transition-all duration-500 cursor-pointer overflow-hidden shadow-2xl shadow-emerald-950/40 min-h-[220px] flex flex-col justify-between scale-105 hover:scale-[1.08] ring-4 ring-emerald-500/10 hover:ring-emerald-400/30"
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
      
      <div className="absolute -right-4 -top-4 text-white/5 group-hover:text-white/10 transition-colors">
        <MonitorPlay size={100} />
      </div>
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="w-11 h-11 bg-white text-emerald-700 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <MonitorPlay size={22} />
          </div>
          <span className="flex items-center gap-1.5 bg-emerald-400/20 border border-emerald-400/40 px-2.5 py-1 rounded-full text-[8px] font-black text-emerald-200 uppercase tracking-widest animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Matrículas Abertas
          </span>
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Cursos EAD</h3>
        <p className="text-emerald-100/90 text-xs font-light leading-snug">
          Estude onde e quando quiser com nossa plataforma online. Acesso imediato!
        </p>
      </div>
      <div className="mt-4 flex items-center text-white font-black text-[9px] uppercase tracking-widest group-hover:translate-x-2 transition-transform">
        Entrar na Plataforma <span className="ml-2">→</span>
      </div>
    </div>
  );
};

export default CursosEadCard;
