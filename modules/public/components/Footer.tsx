
// File: modules/public/components/Footer.tsx

import React from 'react';
import { Facebook, Instagram, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Footer: React.FC = () => {
  const navigate = useNavigate();

  const handleLink = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    navigate(`/#${id}`);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-[#001a33] text-white pt-20 pb-8 border-t border-white/5">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-16">
          
          {/* Logo e Sobre */}
          <div className="space-y-6">
            <div 
              className="inline-block bg-white p-3 rounded-2xl cursor-pointer max-w-[200px] shadow-lg transition-transform duration-300 hover:scale-105" 
              onClick={() => navigate('/')}
            >
              <img 
                src="/LogoUniverso.png" 
                alt="Universo Cursos e Consultoria" 
                className="h-10 w-auto object-contain"
              />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              Referência em ensino profissional e consultoria estratégica no Sertão Sergipano. Transformando vidas através da educação desde 2011.
            </p>
            <div className="flex space-x-4">
              <a 
                href="https://www.instagram.com/universocursoseconsultoria/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 bg-white/5 rounded-lg hover:bg-blue-600 transition-colors cursor-pointer text-white flex items-center justify-center"
              >
                <Instagram size={20} />
              </a>
              <a 
                href="https://www.facebook.com/universocursoseconsultoria/?locale=pt_BR" 
                target="_blank" 
                rel="noopener noreferrer"
                className="p-2 bg-white/5 rounded-lg hover:bg-blue-600 transition-colors cursor-pointer text-white flex items-center justify-center"
              >
                <Facebook size={20} />
              </a>
            </div>
          </div>

          {/* Links Rápidos */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 mb-8">Navegação</h4>
            <ul className="space-y-4 text-slate-400 text-sm font-bold uppercase tracking-widest">
              <li><button onClick={(e) => handleLink(e, 'inicio')} className="hover:text-white transition-colors">Início</button></li>
              <li><button onClick={(e) => handleLink(e, 'cursos')} className="hover:text-white transition-colors">Cursos</button></li>
              <li><button onClick={(e) => handleLink(e, 'quem-somos')} className="hover:text-white transition-colors">Quem Somos</button></li>
              <li><button onClick={() => navigate('/contato')} className="hover:text-white transition-colors">Fale Conosco</button></li>
              <li><button onClick={() => navigate('/faq')} className="hover:text-white transition-colors">FAQ</button></li>
            </ul>
          </div>

          {/* Contato Rápido */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 mb-8">Atendimento</h4>
            <ul className="space-y-6 text-sm">
              <li className="flex items-start gap-4 group">
                <a 
                  href="https://wa.me/557996028316" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-start gap-4"
                >
                  <Phone size={18} className="text-blue-500 mt-1" />
                  <div className="text-slate-400 group-hover:text-white transition-colors">
                    <p className="font-bold text-white text-[10px] uppercase tracking-widest mb-1">Central de Vendas</p>
                    <p>(79) 99602-8316</p>
                  </div>
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Footer */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold text-center md:text-left gap-4">
          <div className="flex flex-col gap-1">
            <p>@2026 Universos Cursos e Consultoria.</p>
            <p>Todos os Direitos Reservados.</p>
          </div>
          <div className="flex space-x-8">
            <button onClick={() => navigate('/privacidade')} className="hover:text-white transition-colors">Privacidade</button>
            <button onClick={() => navigate('/termos')} className="hover:text-white transition-colors">Termos</button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
