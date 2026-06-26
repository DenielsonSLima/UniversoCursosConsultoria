import React, { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, 
  Clock, 
  BookOpen, 
  Laptop, 
  CreditCard,
  Loader2, 
  CheckCircle2,
  Sparkles,
  ListChecks,
  Lock,
  UserPlus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { cadastrosService } from '../../gestor/cadastros/cadastros.service';
import { Curso } from '../../gestor/cadastros/cadastros.types';
import OnlineCheckoutButton from '../components/OnlineCheckoutButton';
import { buildEadCoursePath, EAD_SITE_URL } from './eadCourseLinks';

const setMetaContent = (selector: string, content: string) => {
  const element = document.head.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
};

const normalizeDescription = (value: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const EadDetailPage: React.FC = () => {
  const params = useParams<{ slug?: string; id?: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cursoId = params.id;

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Query do Curso EAD
  const { data: curso, isLoading: loadingCurso, error: errorCurso } = useQuery<Curso>({
    queryKey: ['cursoEadPublicDetail', cursoId],
    queryFn: () => cadastrosService.getCursoById(cursoId!),
    enabled: !!cursoId,
  });

  const eadConfigPagePath = curso ? buildEadCoursePath(curso.id, curso.nome) : null;

  useEffect(() => {
    if (!curso || !eadConfigPagePath) return;

    const title = `${curso.nome} | Curso EAD | Universo Cursos e Consultoria`;
    const descricaoBase = curso.ead_config?.pagina?.subtitulo || curso.descricao || 'Curso EAD completo com conteúdo em vídeo, apostila e certificação da Universo Cursos e Consultoria.';
    const description = normalizeDescription(`${descricaoBase} ${curso.area ? `Área: ${curso.area}.` : ''} Carga horária de ${curso.carga_horaria || 80} horas.`);
    const canonical = `${EAD_SITE_URL}${eadConfigPagePath}`;

    document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[name="keywords"]', `${curso.nome}, curso EAD, Universo Cursos e Consultoria`);
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);
    setMetaContent('meta[property="og:url"]', canonical);
    setMetaContent('meta[name="twitter:title"]', title);
    setMetaContent('meta[name="twitter:description"]', description);
    setMetaContent('meta[name="twitter:card"]', 'summary_large_image');

    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;

    const carga = curso.carga_horaria || 80;
    const jsonLdPayload = {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: curso.nome,
      description,
      provider: {
        '@type': 'Organization',
        name: 'Universo Cursos e Consultoria',
        sameAs: EAD_SITE_URL,
      },
      inLanguage: 'pt-BR',
      hasCourseInstance: {
        '@type': 'CourseInstance',
        courseMode: 'online',
        courseWorkload: `P${carga}H`,
      },
      offers: curso.valor && curso.valor > 0
        ? {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            priceCurrency: 'BRL',
            price: String(curso.valor.toFixed(2)),
            url: canonical,
          }
        : undefined,
    };

    let jsonLd = document.getElementById('ead-course-jsonld') as HTMLScriptElement | null;
    if (!jsonLd) {
      jsonLd = document.createElement('script');
      jsonLd.type = 'application/ld+json';
      jsonLd.id = 'ead-course-jsonld';
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(jsonLdPayload);
  }, [curso, eadConfigPagePath]);

  // Loading do Curso
  if (loadingCurso) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
        <Header />
        <div className="flex-grow flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Carregando detalhes do curso...</p>
        </div>
        <Footer />
      </div>
    );
  }

  // Erro ou Curso Não Encontrado
  if (errorCurso || !curso) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
        <Header />
        <div className="flex-grow flex flex-col items-center justify-center py-32 px-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
            <Laptop size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Curso Não Encontrado</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            O curso EAD solicitado não foi encontrado ou não está disponível para exibição pública no momento.
          </p>
          <button
            onClick={() => navigate('/ead')}
            className="w-full bg-[#001a33] hover:bg-blue-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-xs uppercase tracking-widest"
          >
            Ver Catálogo de Cursos EAD
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  // Obtém cronograma cadastrado a partir de ead_config
  const cronograma = curso.ead_config?.cronograma || [];
  const conteudos = curso.ead_config?.conteudos || [];
  const atividades = curso.ead_config?.atividades || [];
  const pagina = curso.ead_config?.pagina;
  const regras = curso.ead_config?.regras;
  const eadCarga = curso.carga_horaria || 80;
  const detailPath = eadConfigPagePath || `/ead/${curso.id}`;

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] font-sans">
      <Header />

      {/* Banner Principal */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-16 md:py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <img 
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1920" 
            alt="EAD Banner Background" 
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="container mx-auto px-6 max-w-6xl relative z-10">
          {/* Botão Voltar */}
          <button
            onClick={() => navigate('/ead')}
            className="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest mb-8 transition-colors group"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span>Voltar para Cursos EAD</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Informações Textuais */}
            <div className="lg:col-span-7 space-y-6">
              <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                {curso.area || 'EAD'}
              </span>

              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-tight text-white">
                {curso.nome}
              </h1>

              {/* Informações Técnicas */}
              <div className="flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
                  <Clock size={16} className="text-blue-400" />
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Carga Horária</p>
                    <p className="text-xs font-bold text-white">{eadCarga} horas</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
                  <Laptop size={16} className="text-blue-400" />
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Modalidade</p>
                    <p className="text-xs font-bold text-white">100% Online</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
                  <BookOpen size={16} className="text-purple-400" />
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Certificado</p>
                    <p className="text-xs font-bold text-white">Incluso</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Imagem de Capa do Curso */}
            <div className="lg:col-span-5">
              <div className="bg-white/5 border border-white/10 p-2 rounded-3xl backdrop-blur-sm shadow-2xl aspect-[16/10] md:aspect-video lg:aspect-auto lg:h-72 overflow-hidden flex items-center justify-center">
                {curso.imagem_url ? (
                  <img 
                    src={curso.imagem_url} 
                    alt={curso.nome} 
                    className="w-full h-full object-cover rounded-2xl" 
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full bg-blue-950/40 rounded-2xl flex flex-col items-center justify-center text-blue-400/60 gap-3">
                    <Laptop size={48} className="opacity-40" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Ensino a Distância</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Técnico */}
      <main className="flex-grow py-16 relative z-20">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* LADO ESQUERDO: Sobre o Curso + Grade Curricular */}
            <div className="lg:col-span-7 space-y-12">
              
              {/* Sobre o Curso */}
              <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2.5">
                  <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                  Sobre o Curso
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line font-medium">
                  {pagina?.subtitulo || curso.descricao || 'Este curso oferece uma formação completa na modalidade Educação a Distância (EAD), permitindo flexibilidade total para que você monte seu cronograma e assista às aulas de onde desejar. A grade curricular é elaborada por especialistas focando no mercado profissional, permitindo que você adquira novas competências de forma eficiente e certificada.'}
                </p>
                {curso.descricao && pagina?.subtitulo && (
                  <p className="text-slate-500 text-xs leading-relaxed whitespace-pre-line font-medium">{curso.descricao}</p>
                )}
                {pagina?.objetivos && pagina.objetivos.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {pagina.objetivos.map((objetivo, idx) => (
                      <div key={`${objetivo}-${idx}`} className="flex gap-2 rounded-2xl bg-blue-50/60 border border-blue-100 p-3">
                        <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
                        <span className="text-xs font-bold text-slate-700 leading-relaxed">{objetivo}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grade Curricular / Cronograma */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2.5">
                    <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                    Cronograma de Matérias
                  </h2>
                  <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold border border-blue-100">
                    {cronograma.length} Conteúdo(s)
                  </span>
                </div>

                {cronograma.length === 0 ? (
                  <div className="bg-white border border-slate-100 rounded-[2rem] p-10 text-center shadow-sm">
                    <BookOpen className="text-slate-300 mx-auto mb-3" size={40} />
                    <p className="text-slate-600 text-sm font-bold">Cronograma em definição.</p>
                    <p className="text-slate-400 text-xs mt-1">
                      As matérias e módulos estão sendo finalizados pela nossa equipe pedagógica. Fale conosco para saber mais!
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm divide-y divide-slate-100">
                    {cronograma.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs border border-blue-100">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                        </div>
                        <span className="bg-slate-105 border border-slate-200 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {item.cargaHoraria || item.carga_horaria}h
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Jornada de Aprendizagem */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2.5">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    Jornada do Curso
                  </h2>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold border border-emerald-100">
                    {conteudos.length} Etapa(s)
                  </span>
                </div>

                {conteudos.length === 0 ? (
                  <div className="bg-white border border-slate-100 rounded-[2rem] p-10 text-center shadow-sm">
                    <BookOpen className="text-slate-300 mx-auto mb-3" size={40} />
                    <p className="text-slate-600 text-sm font-bold">Etapas em preparação.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conteudos.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex gap-3">
                            <span className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xs border border-emerald-100 shrink-0">
                              {item.etapa || idx + 1}
                            </span>
                            <div>
                              <h3 className="font-black text-sm text-[#001a33] leading-snug">{item.titulo}</h3>
                              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">{item.descricao}</p>
                              {item.objetivos && item.objetivos.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                  {item.objetivos.map((objetivo: string, objIdx: number) => (
                                    <span key={`${item.id}-obj-${objIdx}`} className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-150 px-2 py-1 rounded-lg">
                                      {objetivo}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            {item.videoUrl && <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg">Vídeo</span>}
                            {item.textoHtml && <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">Página</span>}
                            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-lg">{item.duracaoMinutos || 0} min</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2 mb-4">
                    <ListChecks size={18} className="text-emerald-600" />
                    Atividades
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {atividades.length > 0
                      ? `${atividades.length} atividade(s) de fixação antes da prova, vinculadas às etapas do curso.`
                      : 'Atividades de fixação serão disponibilizadas conforme a organização pedagógica do curso.'}
                  </p>
                </div>
                <div className="bg-white rounded-[2rem] border border-slate-100 p-6 shadow-sm">
                  <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2 mb-4">
                    <Lock size={18} className="text-amber-600" />
                    Liberação
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Tempo mínimo de estudo: <strong>{regras?.tempoMinimoMinutos || 0} min</strong>. As etapas são liberadas progressivamente, com marcação de conclusão e atividades antes da avaliação final.
                  </p>
                </div>
              </div>

              {/* Diferenciais */}
              <div className="bg-gradient-to-br from-[#001a33] to-[#003366] rounded-[2.5rem] p-8 text-white relative overflow-hidden border border-blue-950/20 shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Sparkles size={20} className="text-blue-400" />
                  Diferenciais do Ensino EAD Universo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Estude no seu Tempo</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        Acesso ilimitado 24 horas por dia, 7 dias por semana, adaptando-se completamente à sua rotina.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Material Didático Completo</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        Videoaulas dinâmicas, apostilas digitais e atividades focadas no aprendizado contínuo.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Tutoria e Suporte</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        Esclareça suas dúvidas e conte com apoio pedagógico durante toda a sua formação.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Certificado Reconhecido</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">
                        Validação nacional para turbinar seu currículo e apresentar em processos seletivos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* LADO DIREITO: Compra online */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-lg md:sticky md:top-24">
                <div className="space-y-2 mb-6">
                  <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                    <CreditCard size={20} className="text-emerald-600" />
                    Matrícula Online
                  </h3>
                  <p className="text-slate-500 text-xs font-medium leading-normal">
                    Cadastre-se ou entre como aluno, realize o pagamento e acompanhe a liberação do curso no portal.
                  </p>
                </div>

                {curso.valor && curso.valor > 0 && (
                  <div className="mb-6 p-5 bg-gradient-to-br from-emerald-50 to-emerald-100/30 border border-emerald-150 rounded-[1.5rem] flex items-center justify-between animate-fadeIn shadow-sm">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">Valor do Curso</span>
                      <span className="text-[11px] text-slate-500 font-bold block">A partir de</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-emerald-600 block">
                        R$ {curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {curso.valor && curso.valor > 0 ? (
                  <OnlineCheckoutButton courseId={curso.id} />
                ) : (
                  <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-relaxed text-amber-800">
                    O valor deste curso ainda não foi configurado para compra online.
                  </div>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                  {[
                    { icon: UserPlus, text: 'Cadastro rápido com nome, CPF, WhatsApp, e-mail e senha.' },
                    { icon: CreditCard, text: 'Pagamento online disponível para EAD, livres e especializações.' },
                    { icon: Lock, text: 'Cursos técnicos continuam com atendimento e ficha completa.' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-start gap-3 text-xs font-bold leading-relaxed text-slate-600">
                      <Icon className="mt-0.5 shrink-0 text-blue-500" size={16} />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>

                <a
                  href={`/login?mode=cadastro&redirect=${encodeURIComponent(detailPath)}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 py-3.5 text-[10px] font-black uppercase tracking-widest text-blue-700 transition hover:border-blue-200 hover:bg-blue-100"
                >
                  <UserPlus size={14} />
                  Criar cadastro de aluno
                </a>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EadDetailPage;
