
// File: modules/public/components/Footer.tsx

import React from 'react';
import { Facebook, Instagram, Phone, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Validador de documentos fica visível apenas em modo de desenvolvimento (local)
const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

const Footer: React.FC = () => {
  const navigate = useNavigate();

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
              Referência em ensino profissional (presencial e EAD) e consultoria estratégica com alcance nacional. Transformando vidas através da educação desde 2011.
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
              <li><a href="/" className="hover:text-white transition-colors">Início</a></li>
              <li><a href="/ead" className="hover:text-white transition-colors">Cursos EAD</a></li>
              <li><a href="/cursos-tecnicos" className="hover:text-white transition-colors">Cursos Técnicos</a></li>
              <li><a href="/ensino-superior" className="hover:text-white transition-colors">Ensino Superior</a></li>
              <li><a href="/login" className="hover:text-white transition-colors">Login do Aluno</a></li>
              <li><a href="/contato" className="hover:text-white transition-colors">Fale Conosco</a></li>
              <li><a href="/faq" className="hover:text-white transition-colors">FAQ</a></li>
              {/* Validador de Documentos: apenas em modo desenvolvimento (local) */}
              {isDevelopmentMode && (
                <li>
                  <button
                    onClick={() => navigate('/validador')}
                    className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <ShieldCheck size={14} />
                    Validador de Docs
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Contato Rápido */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 mb-8">Atendimento</h4>
            <ul className="space-y-6 text-sm">
              <li className="flex items-start gap-4">
                <Phone size={18} className="text-blue-500 mt-1 shrink-0" />
                <div>
                  <p className="font-bold text-white text-[10px] uppercase tracking-widest mb-1">Central de Vendas</p>
                  <div className="space-y-1">
                    <a 
                      href="https://wa.me/557996028316" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-slate-400 hover:text-white transition-colors"
                    >
                      +55 (79) 99602-8316
                    </a>
                    <a 
                      href="https://wa.me/5579998617614" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="block text-slate-400 hover:text-white transition-colors"
                    >
                      +55 (79) 99861-7614
                    </a>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-4 group">
                <a 
                  href="mailto:universo.cursoseconsultoria@gmail.com" 
                  className="flex items-start gap-4"
                >
                  <Mail size={18} className="text-blue-500 mt-1 shrink-0" />
                  <div className="text-slate-400 group-hover:text-white transition-colors">
                    <p className="font-bold text-white text-[10px] uppercase tracking-widest mb-1">E-mail</p>
                    <p className="break-all">universo.cursoseconsultoria@gmail.com</p>
                  </div>
                </a>
              </li>
              <li className="flex items-start gap-4 group">
                <div className="flex items-start gap-4">
                  <MapPin size={18} className="text-blue-500 mt-1 shrink-0" />
                  <div className="text-slate-400">
                    <p className="font-bold text-white text-[10px] uppercase tracking-widest mb-1">Endereço</p>
                    <p className="text-xs leading-relaxed max-w-[200px]">R. V, nº 56 - Lot. São José, Japoatã - SE, 49950-000</p>
                  </div>
                </div>
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
