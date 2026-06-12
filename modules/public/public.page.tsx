
import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './components/Header';
import HeroSlider from './components/HeroSlider';
import CategoriesSection from './components/CategoriesSection';
import AboutContent from './about/AboutContent';
import MissionVisionValues from './mission/MissionVisionValues';
import ConsultingSection from './consulting/ConsultingSection';
import PortfolioSection from './portfolio/PortfolioSection';
import Footer from './components/Footer';

const PublicPage: React.FC = () => {
  const { hash } = useLocation();

  React.useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [hash]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <section id="inicio">
          <HeroSlider />
        </section>

        {/* Cursos Ofertados */}
        <section id="cursos" className="scroll-mt-24">
          <CategoriesSection />
        </section>

        {/* Quem Somos */}
        <AboutContent />

        {/* Missão, Visão, Valores e Propósito */}
        <MissionVisionValues />

        {/* Serviços de Consultoria Detalhada */}
        <section id="consultoria" className="scroll-mt-24">
          <ConsultingSection />
        </section>

        {/* Trabalhos Realizados / Portfólio */}
        <PortfolioSection />
      </main>

      <Footer />
    </div>
  );
};

export default PublicPage;
