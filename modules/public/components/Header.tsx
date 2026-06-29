import React from 'react';
import { Menu, X, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import PublicTickerBar from './PublicTickerBar';

const Header: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { name: 'Cursos', id: 'cursos', path: '/' },
    { name: 'Quem somos', id: 'quem-somos', path: '/' },
    { name: 'Consultoria', id: 'consultoria', path: '/' },
    { name: 'Fale Conosco', id: 'contato', path: '/contato' },
    { name: 'FAQ', id: 'faq', path: '/faq' },
  ];

  const handleNavClick = (e: React.MouseEvent, link: { name: string, id: string, path: string }) => {
    e.preventDefault();
    setIsOpen(false);
    
    // Se for um link de seção na Home
    if (link.path === '/') {
      if (location.pathname !== '/') {
        // Se não estiver na home, navega com o hash
        navigate(`/#${link.id}`);
      } else {
        // Se já estiver na home, apenas scrolla
        const element = document.getElementById(link.id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } else {
      // Se for uma página separada (como FAQ ou Contato)
      navigate(link.path);
    }
  };

  /**
   * Verifica se o link está ativo comparando a rota e o hash (ID da seção)
   */
  const isLinkActive = (link: { path: string, id: string }) => {
    // Se a rota principal for diferente, não está ativo
    if (location.pathname !== link.path) return false;
    
    // Se estiver na Home (/), precisamos verificar qual seção (hash) está ativa
    if (link.path === '/') {
      if (!link.id) return location.hash === '';
      return location.hash === `#${link.id}`;
    }
    
    // Para rotas fixas como /faq ou /contato
    return true;
  };

  return (
    <header className="sticky top-0 z-50 bg-white text-slate-800 border-b border-slate-200/80 shadow-sm">
      <PublicTickerBar />
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div 
            className="flex items-center group cursor-pointer" 
            onClick={() => navigate('/')}
          >
            <img 
              src="/LogoUniverso.png" 
              alt="Universo Cursos e Consultoria" 
              className="h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navLinks.map((link) => {
              const active = isLinkActive(link);
              return (
                <a
                  key={link.name}
                  href={link.path === '/' ? `#${link.id}` : link.path}
                  onClick={(e) => handleNavClick(e, link)}
                  className={`text-[11px] font-black transition-all uppercase tracking-[0.15em] relative after:content-[''] after:absolute after:h-0.5 after:bg-blue-600 after:left-0 after:-bottom-1 hover:after:w-full after:transition-all hover:text-blue-600 ${
                    active 
                      ? 'text-blue-600 after:w-full' 
                      : 'text-slate-600 after:w-0'
                  }`}
                >
                  {link.name}
                </a>
              );
            })}
            <div className="h-6 w-px bg-slate-200 ml-2"></div>
            <button 
              onClick={() => navigate('/login')}
              className="flex items-center space-x-2 bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-full transition-all shadow-md font-bold uppercase text-[10px] tracking-widest"
            >
              <User size={14} />
              <span>Login</span>
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <div className="lg:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-700"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="lg:hidden mt-4 pb-6 space-y-4 animate-fadeIn border-t border-slate-100 pt-4">
            {navLinks.map((link) => {
              const active = isLinkActive(link);
              return (
                <a
                  key={link.name}
                  href={link.path === '/' ? `#${link.id}` : link.path}
                  onClick={(e) => handleNavClick(e, link)}
                  className={`block text-lg font-bold py-3 border-b border-slate-100 uppercase tracking-widest transition-colors ${
                    active ? 'text-blue-600 bg-blue-50 px-4 rounded-xl' : 'text-slate-600'
                  }`}
                >
                  {link.name}
                </a>
              );
            })}
            <button 
              onClick={() => {
                setIsOpen(false);
                navigate('/login');
              }}
              className="w-full flex justify-center items-center space-x-2 bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest mt-4"
            >
              <User size={20} />
              <span>Área de Login</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
