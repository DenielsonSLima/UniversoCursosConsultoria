import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
            Estamos presentes em diversas unidades para melhor atendê-lo. Confira nossos endereços, telefones e horários.
          </p>
        </div>
      </div>

      <main className="flex-grow -mt-10 relative z-20 pb-20">
        <div className="container mx-auto px-6 max-w-6xl">
          <UnitsList />
          
          {/* Seção de Contato Direto (opcional, replicando o FAQ) */}
          <div className="mt-20 text-center p-12 bg-slate-50 rounded-[40px] border border-slate-200">
            <h3 className="text-2xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">Prefere enviar uma mensagem?</h3>
            <p className="text-slate-600 mb-8">Nossa central de atendimento responde em até 24 horas úteis.</p>
            <div className="flex justify-center">
               <a 
                href="https://wa.me/557996028316" 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-700 text-white font-black px-10 py-4 rounded-full transition-all shadow-xl shadow-green-900/20 uppercase tracking-widest transform hover:scale-105 inline-block"
              >
                WhatsApp Central
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;