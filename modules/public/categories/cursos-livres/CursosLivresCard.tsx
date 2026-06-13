
import React from 'react';
import { BookOpen } from 'lucide-react';

interface CursosLivresCardProps {
  onClick?: () => void;
}

const CursosLivresCard: React.FC<CursosLivresCardProps> = ({ onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group relative bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl hover:bg-white/20 transition-all duration-500 cursor-pointer overflow-hidden shadow-xl min-h-[220px] flex flex-col justify-between"
    >
      <div className="absolute -right-4 -top-4 text-white/5 group-hover:text-white/10 transition-colors">
        <BookOpen size={100} />
      </div>
      <div>
        <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
          <BookOpen className="text-white" size={22} />
        </div>
        <h3 className="text-lg font-bold text-white mb-1">Cursos Livres</h3>
        <p className="text-blue-50 text-xs font-light leading-snug opacity-90">
          Capacitação rápida e focada em habilidades práticas imediatas.
        </p>
      </div>
      <div className="mt-4 flex items-center text-white font-bold text-[10px] uppercase tracking-widest group-hover:translate-x-2 transition-transform">
        Explorar <span className="ml-2">→</span>
      </div>
    </div>
  );
};

export default CursosLivresCard;
