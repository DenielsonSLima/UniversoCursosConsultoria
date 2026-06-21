import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, Clock, Loader2, Search, Filter, X, Sparkles, ArrowRight, FileText, CheckCircle2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../../../lib/supabase';

const CursosLivresPublicPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

  // Estados de Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('Todos');

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Inscrição Realtime para atualizações em tempo real da tabela 'cursos' (apenas em desenvolvimento)
  useEffect(() => {
    if (!isDevelopmentMode) return;

    const channel = supabase
      .channel('cursos_livres_public_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['cursosLivresPublic'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, isDevelopmentMode]);

  // Caching com TanStack Query para carregar os cursos do catálogo (apenas em desenvolvimento)
  const { data: cursos = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['cursosLivresPublic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select('*')
        .eq('modalidade', 'LIVRE')
        .eq('status', 'ativo')
        .eq('publicar_site', true)
        .order('nome', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: isDevelopmentMode,
  });

  // Se não estiver em modo de desenvolvimento (ex: online no Vercel), exibe o aviso "Em Breve"
  if (!isDevelopmentMode) {
    return (
      <div className="flex flex-col min-h-screen bg-white font-sans">
        <Header />

        {/* Banner Superior */}
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
              Formações dinâmicas, práticas e focadas na capacitação rápida para o mercado de trabalho.
            </p>
          </div>
        </div>

        {/* Central Em Desenvolvimento */}
        <main className="flex-grow flex items-center justify-center py-20 px-6 bg-slate-50">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-blue-500/30 shadow-lg shadow-blue-500/10">
              <Sparkles size={30} />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
              Em Breve!
            </h3>
            <p className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-4">
              Cursos Livres
            </p>
            <p className="text-slate-300 text-sm leading-relaxed mb-8 font-light">
              Estamos preparando uma experiência operacional completa para as páginas de <strong className="text-white font-bold">Cursos Livres</strong>. Em breve, esta seção estará totalmente disponível com matrículas abertas!
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-900/40 uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95"
            >
              Voltar para a Home
            </button>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

  // Filtragem combinada
  const filteredCursos = cursos.filter((curso) => {
    const nameMatch = curso.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const descMatch = (curso.descricao || '').toLowerCase().includes(searchTerm.toLowerCase());
    const textMatches = nameMatch || descMatch;

    let areaMatches = true;
    if (selectedArea !== 'Todos') {
      areaMatches = curso.area === selectedArea;
    }

    return textMatches && areaMatches;
  });

  // Áreas presentes dinamicamente para os botões de filtro
  const areasExistentes = ['Todos', ...Array.from(new Set(cursos.map((c) => c.area).filter(Boolean)))];

  const cleanFilters = () => {
    setSearchTerm('');
    setSelectedArea('Todos');
  };

  const hasActiveFilters = searchTerm !== '' || selectedArea !== 'Todos';

  return (
    <div className="flex flex-col min-h-screen bg-white font-sans">
      <Header />

      {/* Banner Superior */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://images.unsplash.com/photo-1423666639041-f56000c27a9a?auto=format&fit=crop&q=80&w=1920" 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter animate-fadeIn">
            Cursos <span className="text-blue-400">Livres</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light leading-relaxed">
            Formações dinâmicas, práticas e focadas na capacitação rápida para o mercado de trabalho.
          </p>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-grow pb-24 relative z-20">
        <div className="container mx-auto px-6 max-w-6xl">
          
          {/* Card de Busca e Filtros (Flutuante sobre o Banner) */}
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-6 md:p-8 -mt-12 mb-12 relative z-30">
            <div className="flex flex-col gap-6">
              
              {/* Barra de Busca */}
              <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-4 py-3 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <Search className="text-slate-400 shrink-0" size={20} />
                <input
                  type="text"
                  placeholder="Pesquisar curso por nome ou palavras-chave..."
                  className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder-slate-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Filtro de Área */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Filter size={14} /> Filtrar por Área
                </label>
                <div className="flex flex-wrap gap-2">
                  {areasExistentes.map((area) => (
                    <button
                      key={area}
                      onClick={() => setSelectedArea(area)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selectedArea === area
                          ? 'bg-[#001a33] text-white shadow-md'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status de Filtros Ativos */}
              {hasActiveFilters && (
                <div className="flex justify-between items-center bg-blue-50/50 border border-blue-100/60 rounded-xl px-4 py-2.5 text-xs">
                  <div className="text-blue-900 font-medium">
                    Mostrando <strong className="font-bold">{filteredCursos.length}</strong> de <strong className="font-bold">{cursos.length}</strong> cursos livres encontrados.
                  </div>
                  <button 
                    onClick={cleanFilters}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors flex items-center gap-1"
                  >
                    <X size={12} /> Limpar Filtros
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Listagem de Cursos */}
          <div className="w-full">
            {loading ? (
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 flex flex-col justify-center items-center gap-4">
                <Loader2 className="animate-spin text-blue-600" size={40} />
                <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Carregando catálogo de cursos...</p>
              </div>
            ) : filteredCursos.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 text-center animate-fadeIn">
                <BookOpen className="text-slate-300 mx-auto mb-4 animate-pulse" size={56} />
                <p className="text-slate-600 font-bold mb-2">Nenhum curso livre corresponde aos filtros selecionados.</p>
                <p className="text-slate-400 text-sm mb-6">Tente alterar a palavra buscada ou limpar os filtros para ver todo o catálogo.</p>
                <button 
                  onClick={cleanFilters}
                  className="bg-[#001a33] hover:bg-blue-900 text-white font-bold px-8 py-3 rounded-full text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-950/20"
                >
                  Limpar Todos os Filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                {filteredCursos.map((curso) => {
                  const duracao = curso.duracao_meses || 3;
                  return (
                    <div
                      key={curso.id}
                      className="bg-white border border-slate-200 hover:border-blue-500/40 rounded-[2rem] p-6 flex flex-col justify-between min-h-[380px] shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 group"
                    >
                      <div>
                        {/* Imagem de Capa do Curso */}
                        <div className="h-44 w-full bg-slate-50 rounded-2xl overflow-hidden mb-4 border border-slate-100 shrink-0 flex items-center justify-center relative">
                          {curso.imagem_url ? (
                            <img src={curso.imagem_url} alt={curso.nome} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-blue-50/50 flex flex-col items-center justify-center text-blue-600 gap-2">
                              <BookOpen size={36} className="opacity-40" />
                              <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Curso Profissional</span>
                            </div>
                          )}
                          <span className="absolute top-3 right-3 bg-white/95 backdrop-blur shadow-sm text-[8px] font-black text-blue-600 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-wider">
                            {curso.area || 'Capacitação'}
                          </span>
                        </div>

                        {/* Nome do Curso */}
                        <h3 className="text-lg font-black text-[#001a33] leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                          {curso.nome}
                        </h3>

                        {/* Ficha técnica básica */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-bold mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100 w-fit">
                          <span className="flex items-center gap-1"><Clock size={14} className="text-blue-500" /> {curso.carga_horaria}h</span>
                          <span className="text-slate-300">|</span>
                          <span className="flex items-center gap-1"><Calendar size={14} className="text-blue-500" /> {duracao} Meses</span>
                        </div>

                        {/* Descrição */}
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-medium">
                          {curso.descricao || 'Fale com nossa equipe comercial para saber mais detalhes sobre este curso e a grade curricular.'}
                        </p>

                        {/* Preço (se cadastrado) */}
                        {curso.valor && curso.valor > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between items-center animate-fadeIn">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investimento</span>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
                              <span className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider">A partir de</span>
                              <span className="text-sm font-black text-emerald-600">
                                R$ {curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CTA Button */}
                      <button
                        onClick={() => navigate(`/cursos-livres/detalhes/${curso.id}`)}
                        className="w-full mt-6 bg-[#001a33] hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest hover:scale-[1.01] shadow-lg shadow-blue-500/10"
                      >
                        <span>Ver Detalhes do Curso</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CursosLivresPublicPage;
