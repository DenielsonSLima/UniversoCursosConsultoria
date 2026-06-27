
// File: modules/public/components/CategoriesSection.tsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import CursosLivresCard from '../categories/cursos-livres/CursosLivresCard';
import CursosEadCard from '../categories/cursos-ead/CursosEadCard';
import EspecializacaoTecnicaCard from '../categories/especializacao-tecnica/EspecializacaoTecnicaCard';
import CursosTecnicosCard from '../categories/cursos-tecnicos/CursosTecnicosCard';
import EnsinoSuperiorCard from '../categories/ensino-superior/EnsinoSuperiorCard';

const CategoriesSection: React.FC = () => {
  const navigate = useNavigate();

  const handleOpenSuperior = () => {
    navigate('/ensino-superior');
  };

  const handleOpenTecnicos = () => {
    navigate('/cursos-tecnicos');
  };

  const handleOpenLivres = () => {
    navigate('/cursos-livres');
  };

  const handleOpenEspecializacao = () => {
    navigate('/especializacao');
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
          <CursosLivresCard onClick={handleOpenLivres} />
          <CursosEadCard />
          <EspecializacaoTecnicaCard onClick={handleOpenEspecializacao} />
          <CursosTecnicosCard onClick={handleOpenTecnicos} />
          <EnsinoSuperiorCard onClick={handleOpenSuperior} />
        </div>
      </div>

    </section>
  );
};

export default CategoriesSection;
