import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  GraduationCap,
  BookOpen,
  Laptop,
  Award,
  Zap,
  Instagram,
  PhoneCall,
  MessageCircle,
  Share2,
  Copy,
  Check,
  MapPin,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Phone,
  ArrowRight
} from 'lucide-react';

const BioPage: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [showPhoneDrawer, setShowPhoneDrawer] = useState(false);

  const phoneNumbers = [
    { label: "WhatsApp & Atendimento Principal", number: "(79) 99602-8316", raw: "5579996028316" },
    { label: "Telefone de Atendimento", number: "(79) 99861-7614", raw: "79998617614" }
  ];

  const visualCards = [
    {
      id: 'tecnicos',
      title: 'Cursos Técnicos',
      subtitle: 'Enfermagem, Análises Clínicas, Segurança do Trabalho e mais',
      url: '/cursos-tecnicos',
      isExternal: false,
      badge: 'Inscrições Abertas',
      badgeBg: 'bg-blue-600 text-white',
      image: '/banner1.png',
      icon: Zap,
      accentBorder: 'border-l-4 border-blue-600'
    },
    {
      id: 'aluno',
      title: 'Portal do Aluno (Login)',
      subtitle: 'Acesse suas aulas, notas, boletim e ambiente de aprendizado',
      url: '/login',
      isExternal: false,
      badge: 'Ambiente Virtual',
      badgeBg: 'bg-sky-600 text-white',
      image: '/about-alunos.jpeg',
      icon: GraduationCap,
      accentBorder: 'border-l-4 border-sky-600'
    },
    {
      id: 'ead',
      title: 'Cursos EAD Online',
      subtitle: 'Estude de onde quiser com certificado válido em todo o Brasil',
      url: '/ead',
      isExternal: false,
      badge: '100% Online',
      badgeBg: 'bg-emerald-600 text-white',
      image: '/course-covers/ead/atendente-de-farmacia.webp',
      icon: Laptop,
      accentBorder: 'border-l-4 border-emerald-600'
    },
    {
      id: 'especializacao',
      title: 'Pós-Graduação & Especializações',
      subtitle: 'Diferencial competitivo para sua carreira com cursos MEC',
      url: '/especializacao',
      isExternal: false,
      badge: 'Reconhecido MEC',
      badgeBg: 'bg-purple-600 text-white',
      image: '/course-covers/ead/educacao-e-gestao-escolar.webp',
      icon: Award,
      accentBorder: 'border-l-4 border-purple-600'
    },
    {
      id: 'livres',
      title: 'Capacitação Rápida & Cursos Livres',
      subtitle: 'Cuidador de Idosos, Atendente de Farmácia, Operador de Caixa e mais',
      url: '/cursos-livres',
      isExternal: false,
      badge: 'Formação Rápida',
      badgeBg: 'bg-indigo-600 text-white',
      image: '/course-covers/ead/operador-de-caixa.webp',
      icon: BookOpen,
      accentBorder: 'border-l-4 border-indigo-600'
    },
    {
      id: 'site',
      title: 'Nosso Site Institucional',
      subtitle: 'Conheça a história, unidades, estrutura e todos os nossos cursos',
      url: '/',
      isExternal: false,
      badge: 'Site Oficial',
      badgeBg: 'bg-blue-700 text-white',
      image: '/banner3.png',
      icon: Globe,
      accentBorder: 'border-l-4 border-blue-700'
    },
    {
      id: 'instagram',
      title: 'Instagram @universocursoseconsultoria',
      subtitle: 'Acompanhe dicas, fotos das turmas, notícias e eventos',
      url: 'https://www.instagram.com/universocursoseconsultoria/',
      isExternal: true,
      badge: 'Siga no Instagram',
      badgeBg: 'bg-gradient-to-r from-rose-500 to-amber-500 text-white',
      image: '/about-instituicao.jpeg',
      icon: Instagram,
      accentBorder: 'border-l-4 border-rose-500'
    }
  ];

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Universo Cursos e Consultoria',
          text: 'Transformando Vidas Através da Educação!',
          url: window.location.href,
        });
      } catch (err) {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-800 flex flex-col items-center justify-between relative font-sans selection:bg-blue-600 selection:text-white pb-12">
      
      {/* Dynamic Background Image with Immersive Blue Gradient Overlay */}
      <div className="w-full bg-[url('/banner1.png')] bg-cover bg-center text-white pt-6 pb-20 px-4 relative overflow-hidden flex flex-col items-center shadow-2xl">
        
        {/* Layered Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/90 via-blue-900/95 to-slate-900 backdrop-blur-xs"></div>

        {/* Top Header Bar */}
        <div className="w-full max-w-md flex justify-end items-center z-10 mb-6">
          <button
            onClick={handleShare}
            className="flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md p-2.5 rounded-full text-white transition-all active:scale-95 shadow-sm"
            title="Compartilhar ou copiar link"
          >
            <Share2 size={16} />
          </button>
        </div>

        {/* Profile Header Block */}
        <div className="w-full max-w-md flex flex-col items-center text-center space-y-4 z-10">
          
          {/* Logo Card - Crisp Pure White Container */}
          <div className="relative group">
            <div className="w-44 h-24 rounded-2xl bg-white p-3.5 flex items-center justify-center shadow-2xl border-2 border-white/90 transition-transform duration-300 group-hover:scale-105">
              <img
                src="/LogoUniverso.png"
                alt="Universo Cursos e Consultoria"
                className="w-full h-full object-contain"
              />
            </div>
            
            {/* Verified MEC Badge */}
            <div className="absolute -bottom-2.5 -right-2.5 bg-blue-600 text-white p-1.5 rounded-full border-2 border-white shadow-lg flex items-center justify-center" title="Credenciado pelo MEC">
              <ShieldCheck size={17} />
            </div>
          </div>

          {/* Full Institution Name */}
          <div className="space-y-1.5 pt-1">
            <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-md">
              Universo Cursos e Consultoria
            </h1>
            
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                Instituição Credenciada MEC
              </span>
            </div>

            <p className="text-xs text-blue-100/90 font-medium max-w-[320px] leading-relaxed pt-1 drop-shadow-xs">
              Transformando Vidas Através da Educação. Formação técnica, EAD, pós-graduação e capacitação profissional.
            </p>
          </div>

          {/* Location Tag */}
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-950 bg-white/95 backdrop-blur-md px-4 py-1.5 rounded-full shadow-md">
            <MapPin size={13} className="text-rose-600" />
            <span>Japoatã • Aquidabã • Porto da Folha - SE</span>
          </div>

        </div>
      </div>

      {/* Main Content Container Overlapping the Gradient Header */}
      <main className="w-full max-w-md px-4 -mt-10 flex-1 flex flex-col items-center z-20 space-y-4">

        {/* Central Contact Card */}
        <div className="w-full bg-white rounded-2xl p-4 shadow-xl border border-slate-200/90 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
                <MessageCircle size={20} />
              </div>
              <div className="text-left">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Central de Atendimento</h3>
                <p className="text-[11px] text-slate-500 font-medium">Fale com nossos consultores educacionais</p>
              </div>
            </div>
            
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              Online
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://wa.me/5579996028316?text=Ol%C3%A1!%20Vim%20pelo%20Instagram%20e%20gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20os%20cursos."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95"
            >
              <MessageCircle size={16} />
              <span>WhatsApp</span>
            </a>

            <button
              onClick={() => setShowPhoneDrawer(!showPhoneDrawer)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-3 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95"
            >
              <PhoneCall size={16} />
              <span>Ligar Agora</span>
            </button>
          </div>

          {/* Phone Drawer */}
          {showPhoneDrawer && (
            <div className="pt-2 border-t border-slate-100 space-y-2 animate-fadeIn">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Telefones para Ligação:</p>
              {phoneNumbers.map((phone, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                  <div className="text-left">
                    <p className="text-slate-700 font-semibold">{phone.label}</p>
                    <p className="text-blue-700 font-bold">{phone.number}</p>
                  </div>
                  <a
                    href={`tel:${phone.raw}`}
                    className="p-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center shadow-sm"
                    title={`Ligar para ${phone.number}`}
                  >
                    <Phone size={14} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Visual Cards List */}
        <div className="w-full space-y-3.5">
          {visualCards.map((card) => {
            const Icon = card.icon;

            const cardContent = (
              <div className={`group relative w-full bg-white rounded-2xl border border-slate-200/90 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1 ${card.accentBorder}`}>
                
                {/* Visual Image Header */}
                <div className="h-32 w-full relative overflow-hidden bg-slate-100">
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  
                  {/* Gradient Overlay for Text Visibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent"></div>

                  {/* Top Badge */}
                  <div className="absolute top-3 left-3">
                    <span className={`text-[10px] font-extrabold tracking-wider px-3 py-1 rounded-full shadow-md ${card.badgeBg}`}>
                      {card.badge}
                    </span>
                  </div>

                  {/* Bottom Title inside Image */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-white">
                    <h2 className="text-base font-black drop-shadow-md text-left flex items-center gap-2">
                      {card.title}
                    </h2>
                    <div className="p-1.5 rounded-full bg-white/20 backdrop-blur-md text-white group-hover:bg-blue-600 transition-colors">
                      {card.isExternal ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
                    </div>
                  </div>
                </div>

                {/* Card Subtitle & Icon Footer */}
                <div className="p-3.5 bg-white flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-700 shrink-0">
                    <Icon size={18} />
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-snug text-left line-clamp-2">
                    {card.subtitle}
                  </p>
                </div>

              </div>
            );

            return card.isExternal ? (
              <a
                key={card.id}
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                {cardContent}
              </a>
            ) : (
              <Link key={card.id} to={card.url} className="block w-full">
                {cardContent}
              </Link>
            );
          })}
        </div>

        {/* Copy Link Button */}
        <button
          onClick={handleCopyLink}
          className="w-full py-3.5 px-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 shadow-md hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          {copied ? (
            <>
              <Check size={16} className="text-emerald-600" />
              <span className="text-emerald-700 font-bold">Link Copiado para a Bio</span>
            </>
          ) : (
            <>
              <Copy size={16} className="text-blue-600" />
              <span>Copiar Link desta página para o Instagram</span>
            </>
          )}
        </button>

      </main>

      {/* Clean Premium Footer */}
      <footer className="w-full max-w-md px-6 pt-10 text-center space-y-3 text-slate-400 text-xs">
        
        {/* White Logo Container Box */}
        <div className="flex items-center justify-center">
          <div className="bg-white p-2.5 px-4 rounded-2xl shadow-md border border-slate-200/80 inline-flex items-center gap-2">
            <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-6 w-auto object-contain" />
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-slate-300 text-xs">Universo Cursos e Consultoria</p>
          <p className="text-[11px] text-slate-400 font-medium">Transformando Vidas Através da Educação</p>
        </div>

        <p className="text-[10px] text-slate-500 border-t border-slate-800/80 pt-3">
          © {new Date().getFullYear()} Universo Cursos e Consultoria. Todos os direitos reservados.
        </p>
      </footer>

    </div>
  );
};

export default BioPage;
