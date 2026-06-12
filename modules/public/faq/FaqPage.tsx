
import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import FaqAccordion from './components/FaqAccordion';

const FaqPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const { pathname } = useLocation();

  // Força o scroll para o topo sempre que entrar nesta página ou clicar no link novamente
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      {/* Banner Superior da Página FAQ */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-20 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1920" 
            alt="FAQ Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter">
            Perguntas <span className="text-blue-400">Frequentes</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light">
            Encontre respostas rápidas para as principais dúvidas sobre nossos cursos, matrículas e consultoria.
          </p>
        </div>
      </div>

      <main className="flex-grow -mt-10 relative z-20 pb-20">
        <div className="container mx-auto px-6 max-w-4xl">
          
          {/* Barra de Busca */}
          <div className="bg-white rounded-3xl shadow-2xl p-4 mb-12 border border-slate-100 flex items-center gap-4 group focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-focus-within:bg-blue-600 group-focus-within:text-white transition-colors">
              <Search size={24} />
            </div>
            <input 
              type="text" 
              placeholder="Digite sua dúvida aqui (ex: matrícula, valores, localização...)"
              className="flex-grow bg-[#FFFFFF] text-[#111827] text-lg font-medium outline-none py-2 placeholder-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-blue-600 font-bold px-4"
              >
                Limpar
              </button>
            )}
          </div>

          <FaqAccordion searchTerm={searchTerm} />
          
          {/* CTA Caso não encontre a resposta */}
          <div className="mt-20 text-center p-12 bg-slate-50 rounded-[40px] border border-slate-200">
            <h3 className="text-2xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">Não encontrou o que procurava?</h3>
            <p className="text-slate-600 mb-8">Nossa equipe está pronta para te atender de forma personalizada via WhatsApp ou telefone.</p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white font-black px-10 py-4 rounded-full transition-all shadow-xl shadow-blue-900/20 uppercase tracking-widest transform hover:scale-105">
              Falar com Atendente
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FaqPage;
