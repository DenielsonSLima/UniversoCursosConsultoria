import React from 'react';
import { ChevronLeft, ChevronRight, MapPin, Quote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SlideData {
  image: string;
  title: string;
  subtitle: string;
  locations?: string[];
  supportingPhrase?: string;
  buttons: {
    text: string;
    primary: boolean;
    action: 'cursos' | 'contato';
  }[];
}

const slides: SlideData[] = [
  {
    image: '/banner1.png', // Student split background
    title: 'Sua qualificação começa aqui — e abre portas no mercado.',
    subtitle: 'Desde 2011 formando profissionais em Sergipe. Cursos técnicos e profissionalizantes com certificação reconhecida.',
    locations: ['Japoatã', 'Porto da Folha', 'Aquidabã'],
    buttons: [
      { text: 'Conheça Nossos Cursos', primary: true, action: 'cursos' },
      { text: 'Falar com Consultor', primary: false, action: 'contato' }
    ]
  },
  {
    image: '/banner2.png', // Healthcare/Technical scrubs background
    title: 'Transforme Seu Futuro Profissional Hoje',
    subtitle: 'Cursos práticos e atualizados para quem deseja conquistar novas oportunidades no mercado de trabalho.',
    supportingPhrase: 'Aprenda com quem entende do mercado e prepare-se para o sucesso.',
    buttons: [
      { text: 'Conheça Nossos Cursos', primary: true, action: 'cursos' }
    ]
  },
  {
    image: '/banner3.png', // Graduation success background
    title: 'Invista no seu futuro',
    subtitle: 'Venha fazer parte da Família Universo. Cursos técnicos e profissionalizantes com certificação reconhecida e credenciamento oficial.',
    supportingPhrase: 'Siga nossa instituição no Instagram: @universocursose',
    buttons: [
      { text: 'Conheça Nossos Cursos', primary: true, action: 'cursos' },
      { text: 'Falar com Consultor', primary: false, action: 'contato' }
    ]
  }
];

const HeroSlider: React.FC = () => {
  const [current, setCurrent] = React.useState(0);
  const navigate = useNavigate();

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const next = () => setCurrent((prev) => (prev + 1) % slides.length);
  const prev = () => setCurrent((prev) => (prev - 1 + slides.length) % slides.length);

  const handleAction = (action: 'cursos' | 'contato') => {
    if (action === 'cursos') {
      const element = document.getElementById('cursos');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/#cursos');
      }
    } else if (action === 'contato') {
      navigate('/contato');
    }
  };

  return (
    <div className="relative w-full h-[550px] md:h-[700px] overflow-hidden bg-slate-950">
      {slides.map((slide, index) => (
        <div
          key={index}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          {/* Background image */}
          <img
            src={slide.image}
            alt={slide.title}
            className="w-full h-full object-cover object-center scale-105 transition-transform duration-[6000ms] ease-out"
            style={{ transform: index === current ? 'scale(1)' : 'scale(1.05)' }}
          />
          
          {/* Logo in the top-right corner of the banner (on desktop, overlaying the light image background) */}
          <div className="absolute top-8 right-16 hidden lg:block z-20">
            <img 
              src="/LogoUniverso.png" 
              alt="Logo Universo Cursos e Consultoria" 
              className="h-12 w-auto object-contain transition-transform duration-300 hover:scale-105"
            />
          </div>
          
          {/* Gradient overlay optimized for text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-transparent flex items-center">
            <div className="container mx-auto px-6 md:px-16 w-full text-center md:text-left">
              <div className="max-w-3xl flex flex-col items-center md:items-start">
                
                {/* Polos / Locations list */}
                {slide.locations && (
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-6 animate-slideUp">
                    <span className="text-[10px] uppercase tracking-[0.2em] bg-blue-600/30 text-blue-300 border border-blue-400/20 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                      <MapPin size={12} className="text-blue-400" />
                      Polos em Sergipe:
                    </span>
                    {slide.locations.map((loc) => (
                      <span 
                        key={loc} 
                        className="text-[10px] uppercase tracking-wider bg-white/10 text-white backdrop-blur-md px-3.5 py-1 rounded-full font-semibold border border-white/10"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                )}

                {/* Supporting Phrase */}
                {slide.supportingPhrase && (
                  <div className="flex items-start gap-2.5 mb-6 text-left bg-black/40 border-l-4 border-blue-500 py-2.5 px-4 rounded-r-xl max-w-xl animate-slideUp">
                    <Quote size={18} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs md:text-sm italic text-slate-300 font-medium tracking-wide leading-relaxed">
                      {slide.supportingPhrase}
                    </p>
                  </div>
                )}

                {/* Slogan */}
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black mb-6 text-white leading-tight tracking-tighter uppercase animate-slideUp">
                  {slide.title}
                </h1>

                {/* Description */}
                <p className="text-sm md:text-lg lg:text-xl font-light mb-8 text-slate-200/90 leading-relaxed max-w-2xl animate-slideUp">
                  {slide.subtitle}
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto animate-slideUp">
                  {slide.buttons.map((btn, bIndex) => (
                    <button
                      key={bIndex}
                      onClick={() => handleAction(btn.action)}
                      className={`px-8 py-3.5 rounded-full font-bold text-sm transition-all shadow-xl uppercase tracking-widest hover:scale-105 active:scale-95 ${
                        btn.primary
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/30'
                          : 'bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white'
                      }`}
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>

              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Navigation arrows */}
      <button
        onClick={prev}
        className="absolute left-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all backdrop-blur-sm border border-white/5 shadow-md hidden md:block"
        aria-label="Anterior"
      >
        <ChevronLeft size={24} />
      </button>
      <button
        onClick={next}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/70 hover:text-white transition-all backdrop-blur-sm border border-white/5 shadow-md hidden md:block"
        aria-label="Próximo"
      >
        <ChevronRight size={24} />
      </button>

      {/* Dots navigation */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex space-x-3">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrent(index)}
            className={`h-2 rounded-full transition-all duration-500 ${
              index === current 
                ? 'bg-blue-500 w-10 shadow-lg shadow-blue-500/50' 
                : 'bg-white/30 w-3 hover:bg-white/50'
            }`}
            aria-label={`Ir para slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default HeroSlider;