
// File: modules/public/components/CategoriesSection.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles } from 'lucide-react';
import CursosLivresCard from '../categories/cursos-livres/CursosLivresCard';
import CursosEadCard from '../categories/cursos-ead/CursosEadCard';
import EspecializacaoTecnicaCard from '../categories/especializacao-tecnica/EspecializacaoTecnicaCard';
import CursosTecnicosCard from '../categories/cursos-tecnicos/CursosTecnicosCard';
import EnsinoSuperiorCard from '../categories/ensino-superior/EnsinoSuperiorCard';

const CategoriesSection: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const navigate = useNavigate();

  const openModal = (name: string) => {
    setCategoryName(name);
    setIsOpen(true);
  };

  const handleOpenSuperior = () => {
    const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';
    if (isDevelopmentMode) {
      navigate('/ensino-superior');
    } else {
      openModal('Ensino Superior');
    }
  };

  return (
    <section className="relative py-16 overflow-hidden">
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scaleIn {
          animation: scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {/* Background with Image and professional Blue Gradient */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920" 
          alt="Ambiente profissional" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#001a33]/85 via-[#002b55]/90 to-black/95"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3 uppercase tracking-tighter">
            Cursos <span className="text-blue-400">Ofertados</span>
          </h2>
          <p className="text-blue-100 text-base max-w-2xl mx-auto font-light">
            Soluções completas em ensino e capacitação para impulsionar seu sucesso profissional com a qualidade Universo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 max-w-7xl mx-auto">
          <CursosLivresCard onClick={() => openModal('Cursos Livres')} />
          <CursosEadCard />
          <EspecializacaoTecnicaCard onClick={() => openModal('Especialização Técnica')} />
          <CursosTecnicosCard onClick={() => openModal('Cursos Técnicos')} />
          <EnsinoSuperiorCard onClick={handleOpenSuperior} />
        </div>
      </div>

      {/* Custom 'Em Desenvolvimento' Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          {/* Click outside to close */}
          <div className="absolute inset-0" onClick={() => setIsOpen(false)}></div>
          
          {/* Modal Content */}
          <div className="relative w-full max-w-md overflow-hidden bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center z-10 animate-scaleIn">
            {/* Close Button */}
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
            
            {/* Header Icon */}
            <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Sparkles size={30} />
            </div>

            {/* Title */}
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
              Em Breve!
            </h3>

            {/* Subtitle */}
            <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-4">
              {categoryName}
            </p>

            {/* Description */}
            <p className="text-slate-300 text-sm leading-relaxed mb-8 font-light">
              Estamos preparando uma experiência completa de ensino para a área de <strong className="text-white font-bold">{categoryName}</strong>. Em breve, esta seção estará totalmente disponível com matrículas abertas e certificação reconhecida!
            </p>

            {/* Action Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40 uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default CategoriesSection;
