import React, { useEffect } from 'react';
import { useLocation } from 'react-router';
import Header from '../components/Header';
import Footer from '../components/Footer';
import UnitsList from './components/UnitsList';

const ContactPage: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      {/* Banner Superior */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-20 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://images.unsplash.com/photo-1423666639041-f56000c27a9a?auto=format&fit=crop&q=80&w=1920" 
            alt="Contact Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter">
            Fale <span className="text-blue-400">Conosco</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light">
            Encontre a unidade mais próxima e consulte os endereços e canais de atendimento cadastrados em cada polo.
          </p>
        </div>
      </div>

      <main className="flex-grow -mt-10 relative z-20 pb-20">
        <div className="container mx-auto px-6 max-w-6xl">
          <UnitsList />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;
