import React from 'react';
import { ChevronDown, Menu, X, User } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import PublicTickerBar from './PublicTickerBar';

const courseLinks = [
  { name: 'Cursos Técnicos', path: '/cursos-tecnicos' },
  { name: 'Cursos EAD', path: '/ead' },
  { name: 'Cursos Livres', path: '/cursos-livres' },
  { name: 'Especializações', path: '/especializacao' },
  { name: 'Ensino Superior', path: '/ensino-superior' },
];

const navLinks = [
  { name: 'Quem somos', id: 'quem-somos', path: '/' },
  { name: 'Consultoria', id: 'consultoria', path: '/' },
  { name: 'Fale Conosco', id: 'contato', path: '/contato' },
  { name: 'FAQ', id: 'faq', path: '/faq' },
];

const normalClick = (event: React.MouseEvent) =>
  event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;

interface CoursesMenuProps {
  mobile?: boolean;
  active: boolean;
  onNavigate: (event: React.MouseEvent, section?: string) => void;
}

const CoursesMenu: React.FC<CoursesMenuProps> = ({ mobile = false, active, onNavigate }) => {
  const menuRef = React.useRef<React.ComponentRef<'details'>>(null);

  React.useEffect(() => {
    const closeOutside = (event: Event) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  const follow = (event: React.MouseEvent, section?: string) => {
    if (!normalClick(event)) return;
    if (menuRef.current) menuRef.current.open = false;
    onNavigate(event, section);
  };

  return (
    <details ref={menuRef} className={`group ${mobile ? 'border-b border-slate-100' : 'relative'}`}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}>
      <summary className={`flex cursor-pointer list-none items-center gap-1.5 uppercase transition-colors hover:text-blue-600 [&::-webkit-details-marker]:hidden ${mobile ? 'py-3 text-lg font-bold tracking-widest' : 'text-[11px] font-black tracking-[0.15em]'} ${active ? 'text-blue-600' : 'text-slate-600'}`}>
        Cursos <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className={mobile ? 'pb-3 pl-3' : 'absolute left-0 top-full mt-3 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg'}>
        <Link to="/#cursos" onClick={(event) => follow(event, 'cursos')}
          className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-500">
          Ver todos os cursos
        </Link>
        {courseLinks.map((link) => (
          <Link key={link.path} to={link.path} onClick={follow}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-500">
            {link.name}
          </Link>
        ))}
      </div>
    </details>
  );
};

const Header: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const location = useLocation();

  const handleNavClick = (event: React.MouseEvent, section?: string) => {
    if (!normalClick(event)) return;
    setIsOpen(false);
    if (section && location.pathname === '/') {
      const element = document.getElementById(section);
      if (element) element.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isLinkActive = (link: { path: string; id: string }) =>
    location.pathname === link.path && (link.path !== '/' || location.hash === `#${link.id}`);
  const coursesActive = courseLinks.some((link) => location.pathname === link.path
    || location.pathname.startsWith(`${link.path}/`)) || location.hash === '#cursos';

  return (
    <header className="sticky top-0 z-50 bg-white text-slate-800 border-b border-slate-200/80 shadow-sm">
      <PublicTickerBar />
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <Link to="/" aria-label="Página inicial da Universo" className="flex items-center group cursor-pointer"
            onClick={handleNavClick}>
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria"
              className="h-10 md:h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105" />
          </Link>

          <nav aria-label="Navegação principal" className="hidden lg:flex items-center space-x-8">
            <CoursesMenu active={coursesActive} onNavigate={handleNavClick} />
            {navLinks.map((link) => (
              <Link key={link.name} to={link.path === '/' ? `/#${link.id}` : link.path}
                onClick={(event) => handleNavClick(event, link.path === '/' ? link.id : undefined)}
                className={`text-[11px] font-black transition-all uppercase tracking-[0.15em] relative after:content-[''] after:absolute after:h-0.5 after:bg-blue-600 after:left-0 after:-bottom-1 hover:after:w-full after:transition-all hover:text-blue-600 ${isLinkActive(link) ? 'text-blue-600 after:w-full' : 'text-slate-600 after:w-0'}`}>
                {link.name}
              </Link>
            ))}
            <div className="h-6 w-px bg-slate-200 ml-2" />
            <Link to="/login" onClick={handleNavClick}
              className="flex items-center space-x-2 bg-blue-600 text-white hover:bg-blue-700 px-5 py-2 rounded-full transition-all shadow-md font-bold uppercase text-[10px] tracking-widest">
              <User size={14} aria-hidden="true" /><span>Login</span>
            </Link>
          </nav>

          <div className="lg:hidden flex items-center">
            <button type="button" aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={isOpen}
              aria-controls="public-mobile-navigation" onClick={() => setIsOpen(!isOpen)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-700">
              {isOpen ? <X size={28} aria-hidden="true" /> : <Menu size={28} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {isOpen && (
          <nav id="public-mobile-navigation" aria-label="Navegação móvel"
            className="lg:hidden mt-4 pb-6 space-y-4 animate-fadeIn border-t border-slate-100 pt-4">
            <CoursesMenu mobile active={coursesActive} onNavigate={handleNavClick} />
            {navLinks.map((link) => (
              <Link key={link.name} to={link.path === '/' ? `/#${link.id}` : link.path}
                onClick={(event) => handleNavClick(event, link.path === '/' ? link.id : undefined)}
                className={`block text-lg font-bold py-3 border-b border-slate-100 uppercase tracking-widest transition-colors ${isLinkActive(link) ? 'text-blue-600 bg-blue-50 px-4 rounded-xl' : 'text-slate-600'}`}>
                {link.name}
              </Link>
            ))}
            <Link to="/login" onClick={handleNavClick}
              className="w-full flex justify-center items-center space-x-2 bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest mt-4">
              <User size={20} aria-hidden="true" /><span>Área de Login</span>
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
