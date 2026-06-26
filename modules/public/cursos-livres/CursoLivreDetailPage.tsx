import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, 
  Clock, 
  Calendar, 
  BookOpen, 
  Briefcase, 
  FileText, 
  Send, 
  Loader2, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import OnlineCheckoutButton from '../components/OnlineCheckoutButton';
import { cadastrosService } from '../../gestor/cadastros/cadastros.service';
import { Curso, Modulo } from '../../gestor/cadastros/cadastros.types';

const CursoLivreDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Query do Curso
  const { data: curso, isLoading: loadingCurso, error: errorCurso } = useQuery<Curso>({
    queryKey: ['cursoLivrePublicDetail', id],
    queryFn: () => cadastrosService.getCursoById(id!),
    enabled: !!id && isDevelopmentMode,
  });

  // Query da Grade Curricular
  const { data: modulos = [], isLoading: loadingGrade } = useQuery<Modulo[]>({
    queryKey: ['cursoLivrePublicGrade', id],
    queryFn: () => cadastrosService.getGrade(id!),
    enabled: !!id && isDevelopmentMode,
  });

  // Estado dos Módulos Expandidos (Accordion)
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  const toggleModule = (moduloId: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduloId]: !prev[moduloId]
    }));
  };

  // Expandir o primeiro módulo por padrão quando carregar os dados
  useEffect(() => {
    if (modulos.length > 0) {
      setExpandedModules(prev => {
        if (Object.keys(prev).length === 0 && modulos[0].id) {
          return { [modulos[0].id]: true };
        }
        return prev;
      });
    }
  }, [modulos]);

  // Form de Lead/Interesse
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [polo, setPolo] = useState('Japoatã (Sede Matriz)');
  const [mensagem, setMensagem] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleWhatsappChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    // Aplica a máscara
    if (value.length > 6) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      value = `(${value}`;
    }
    setWhatsapp(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !whatsapp) {
      alert('Por favor, preencha seu nome e WhatsApp.');
      return;
    }

    setIsSubmitting(true);

    const whatsappLimpo = whatsapp.replace(/\D/g, '');
    const mensagemTexto = `Olá! Meu nome é *${nome}* e tenho interesse no curso livre *${curso?.nome || 'Curso'}* no Polo *${polo}*. \n\n*E-mail:* ${email || 'Não informado'} \n*Mensagem:* ${mensagem || 'Gostaria de saber mais informações sobre matrículas e descontos.'}`;
    
    const whatsappUrl = `https://wa.me/557996028316?text=${encodeURIComponent(mensagemTexto)}`;
    
    setTimeout(() => {
      setIsSubmitting(false);
      window.open(whatsappUrl, '_blank');
    }, 800);
  };

  // Se não estiver em modo de desenvolvimento, renderiza tela "Em Breve"
  if (!isDevelopmentMode) {
    return (
      <div className="flex flex-col min-h-screen bg-white font-sans">
        <Header />

        <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-24 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <img 
              src="https://images.unsplash.com/photo-1423666639041-f56000c27a9a?auto=format&fit=crop&q=80&w=1920" 
              alt="Background" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="container mx-auto px-6 relative z-10 text-center">
            <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter">
              Cursos <span className="text-blue-400">Livres</span>
            </h1>
            <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light leading-relaxed">
              Formações de alto nível para impulsionar a sua carreira no mercado.
            </p>
          </div>
        </div>

        <main className="flex-grow flex items-center justify-center py-20 px-6 bg-slate-50">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Sparkles size={30} />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
              Em Breve!
            </h3>
            <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-4">
              Página de Detalhes
            </p>
            <p className="text-slate-300 text-sm leading-relaxed mb-8 font-light">
              Estamos implementando as subpáginas detalhadas para cada um dos nossos cursos livres. Em breve você poderá conferir o conteúdo completo de cada curso!
            </p>
            <button
              onClick={() => navigate('/cursos-livres')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40 uppercase tracking-widest text-xs hover:scale-[1.02]"
            >
              Voltar para o Catálogo
            </button>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // Loading do Curso
  if (loadingCurso) {
    return (
      <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
        <Header />
        <div className="flex-grow flex flex-col items-center justify-center py-40 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Carregando detalhes do curso livre...</p>
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
            <BookOpen size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Curso Não Encontrado</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            O curso livre solicitado não foi encontrado ou não está disponível para exibição pública no momento.
          </p>
          <button
            onClick={() => navigate('/cursos-livres')}
            className="w-full bg-[#001a33] hover:bg-blue-600 text-white font-bold py-4 rounded-2xl transition-all shadow-lg text-xs uppercase tracking-widest"
          >
            Ver Catálogo de Cursos
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const duracao = curso.duracao_meses || 3;

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] font-sans">
      <Header />

      {/* Banner Principal */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-16 md:py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <img 
            src="https://images.unsplash.com/photo-1423666639041-f56000c27a9a?auto=format&fit=crop&q=80&w=1920" 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>
        
        <div className="container mx-auto px-6 max-w-6xl relative z-10">
          {/* Botão Voltar */}
          <button
            onClick={() => navigate('/cursos-livres')}
            className="inline-flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest mb-8 transition-colors group"
          >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span>Voltar para Cursos Livres</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Informações Textuais */}
            <div className="lg:col-span-7 space-y-6">
              <span className="bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                {curso.area || 'Capacitação'}
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
                    <p className="text-xs font-bold text-white">{curso.carga_horaria} horas</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
                  <Calendar size={16} className="text-blue-400" />
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Duração Estimada</p>
                    <p className="text-xs font-bold text-white">{duracao} Meses</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
                  <BookOpen size={16} className="text-blue-400" />
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Curso Presencial</p>
                    <p className="text-xs font-bold text-white">Capacitação</p>
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
                  />
                ) : (
                  <div className="w-full h-full bg-blue-950/40 rounded-2xl flex flex-col items-center justify-center text-blue-400/60 gap-3">
                    <Briefcase size={48} className="opacity-40" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Matrículas Abertas</span>
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
                  {curso.descricao || 'Este curso livre oferece capacitação prática rápida, preparando o aluno de maneira direta e focada para novos desafios e oportunidades imediatas no mercado de trabalho. Contamos com conteúdo programático qualificado e suporte completo Universo.'}
                </p>
              </div>

              {/* Grade Curricular Dinâmica */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <h2 className="text-xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2.5">
                    <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                    Conteúdo Programático
                  </h2>
                  <span className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold border border-blue-100">
                    {modulos.length} Tópico(s)
                  </span>
                </div>

                {loadingGrade ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 bg-white border border-slate-100 rounded-[2rem]">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando conteúdo do curso...</p>
                  </div>
                ) : modulos.length === 0 ? (
                  <div className="space-y-6">
                    <div className="bg-white border border-slate-100 rounded-[2rem] p-10 text-center shadow-sm">
                      <BookOpen className="text-slate-300 mx-auto mb-3" size={40} />
                      <p className="text-slate-600 text-sm font-bold">Conteúdo em definição.</p>
                      <p className="text-slate-400 text-xs mt-1">O plano detalhado está sendo atualizado. Entre em contato para saber mais sobre as aulas!</p>
                    </div>
                    
                    {(curso.imagem_detalhe_1 || curso.imagem_detalhe_2) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                        {curso.imagem_detalhe_1 && (
                          <div className="bg-white border border-slate-100 p-3 rounded-[2rem] shadow-sm overflow-hidden aspect-[16/10]">
                            <img src={curso.imagem_detalhe_1} alt="Prática do curso" className="w-full h-full object-cover rounded-2xl" />
                          </div>
                        )}
                        {curso.imagem_detalhe_2 && (
                          <div className="bg-white border border-slate-100 p-3 rounded-[2rem] shadow-sm overflow-hidden aspect-[16/10]">
                            <img src={curso.imagem_detalhe_2} alt="Atividade" className="w-full h-full object-cover rounded-2xl" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {modulos.map((modulo, idx) => {
                      const modId = modulo.id || `mod-${idx}`;
                      const isExpanded = !!expandedModules[modId];
                      const totalDisciplinas = modulo.disciplinas?.length || 0;
                      const cargaHorariaModulo = modulo.disciplinas?.reduce((acc, d) => acc + (d.cargaHoraria || 0), 0) || 0;

                      return (
                        <React.Fragment key={modId}>
                          <div 
                            className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                          >
                            {/* Cabeçalho do Módulo */}
                            <button
                              onClick={() => toggleModule(modId)}
                              className="w-full px-6 py-5 flex items-center justify-between text-left gap-4 hover:bg-slate-50/50 transition-colors"
                            >
                              <div className="space-y-1">
                                <h3 className="text-sm font-bold text-[#001a33] uppercase tracking-wide">
                                  {modulo.nome}
                                </h3>
                                <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  <span>{totalDisciplinas} Aulas/Atividades</span>
                                  <span>•</span>
                                  <span>{cargaHorariaModulo} Horas</span>
                                </div>
                              </div>
                              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </div>
                            </button>

                            {/* Lista de Disciplinas (Accordion Content) */}
                            {isExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50/20 divide-y divide-slate-100">
                                {modulo.disciplinas && modulo.disciplinas.length > 0 ? (
                                  modulo.disciplinas.map((disc, dIdx) => (
                                    <div key={disc.id || dIdx} className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                      <div className="space-y-1">
                                        <p className="text-xs font-bold text-[#001a33]">
                                          {disc.nome}
                                        </p>
                                        {disc.descricao && (
                                          <p className="text-[11px] text-slate-500 leading-normal font-medium max-w-lg">
                                            {disc.descricao}
                                          </p>
                                        )}
                                      </div>
                                      <span className="shrink-0 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider self-start md:self-center">
                                        {disc.cargaHoraria}h
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-6 py-4 text-center text-slate-400 text-xs">
                                    Nenhum detalhe cadastrado neste tópico.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Inserir a primeira foto de detalhe após o 2º módulo */}
                          {idx === 1 && curso.imagem_detalhe_1 && (
                            <div className="bg-white border border-slate-100 p-3 rounded-[2rem] shadow-sm overflow-hidden aspect-[16/9] my-6">
                              <img src={curso.imagem_detalhe_1} alt={`${curso.nome} - Prática`} className="w-full h-full object-cover rounded-2xl" />
                            </div>
                          )}

                          {/* Inserir a segunda foto de detalhe */}
                          {((idx === 3 && modulos.length >= 4) || (idx === modulos.length - 1 && modulos.length < 4 && idx !== 1)) && curso.imagem_detalhe_2 && (
                            <div className="bg-white border border-slate-100 p-3 rounded-[2rem] shadow-sm overflow-hidden aspect-[16/9] my-6">
                              <img src={curso.imagem_detalhe_2} alt={`${curso.nome} - Infraestrutura`} className="w-full h-full object-cover rounded-2xl" />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* Caso tenha exatamente 2 módulos, renderizamos a segunda foto após a lista */}
                    {modulos.length === 2 && curso.imagem_detalhe_2 && (
                      <div className="bg-white border border-slate-100 p-3 rounded-[2rem] shadow-sm overflow-hidden aspect-[16/9] mt-6">
                        <img src={curso.imagem_detalhe_2} alt={`${curso.nome} - Infraestrutura`} className="w-full h-full object-cover rounded-2xl" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Diferenciais */}
              <div className="bg-gradient-to-br from-[#001a33] to-[#003366] rounded-[2.5rem] p-8 text-white relative overflow-hidden border border-blue-950/20 shadow-xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-6 flex items-center gap-2">
                  <Sparkles size={20} className="text-blue-400" />
                  Diferenciais do Ensino Universo
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Formação Prática</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">Foco em metodologias ativas e projetos reais de aplicação profissional.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Pólos Equipados</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">Estrutura de apoio completa para práticas pedagógicas e suporte presencial no seu polo.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Suporte Pedagógico</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">Acompanhamento contínuo por tutores e coordenadores da Universo.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-blue-400 shrink-0 mt-0.5" size={18} />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">Certificado Universo</h4>
                      <p className="text-[11px] text-slate-300 font-light mt-1 leading-normal">Certificado reconhecido e com alta credibilidade perante as empresas da região.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* LADO DIREITO: Form de Lead ("Tenho Interesse") */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-[2rem] border border-slate-100 p-8 shadow-lg md:sticky md:top-24">
                <div className="space-y-2 mb-6">
                  <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                    <FileText size={20} className="text-blue-500" />
                    Tenho Interesse
                  </h3>
                  <p className="text-slate-500 text-xs font-medium leading-normal">
                    Preencha o formulário abaixo e um de nossos consultores educacionais entrará em contato para tirar todas as dúvidas.
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

                {curso.valor && curso.valor > 0 && <OnlineCheckoutButton courseId={curso.id} />}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Seu nome completo"
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-semibold text-slate-800 transition-all"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      WhatsApp *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="(79) 99999-9999"
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-semibold text-slate-800 transition-all"
                      value={whatsapp}
                      onChange={handleWhatsappChange}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      E-mail (Opcional)
                    </label>
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-semibold text-slate-800 transition-all"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Polo Mais Próximo *
                    </label>
                    <div className="relative">
                      <select
                        className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-bold text-slate-800 transition-all appearance-none cursor-pointer"
                        value={polo}
                        onChange={e => setPolo(e.target.value)}
                      >
                        <option>Japoatã (Sede Matriz)</option>
                        <option>Aquidabã (Filial)</option>
                        <option>Porto da Folha (Filial)</option>
                      </select>
                      <MapPin className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" size={14} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Mensagem ou Dúvida (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Gostaria de saber o valor da mensalidade e quando iniciam as turmas."
                      className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none font-semibold text-slate-800 transition-all resize-none"
                      value={mensagem}
                      onChange={e => setMensagem(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-black py-4 rounded-xl transition-all shadow-md shadow-blue-500/10 uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                  >
                    <Send size={12} />
                    <span>Falar com Consultor</span>
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CursoLivreDetailPage;
