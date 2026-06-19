import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Building, Phone, ArrowUpRight, Loader2, Search, Filter, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../../../lib/supabase';

const EnsinoSuperiorPublicPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

  // Estados de Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrau, setSelectedGrau] = useState<string>('Todos'); // 'Todos', 'Bacharelado', 'Licenciatura', 'Tecnologia'
  const [selectedModalidade, setSelectedModalidade] = useState<string>('Todos'); // 'Todos', 'Semipresencial', '100% Online'

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Inscrição Realtime para atualizações em tempo real da tabela 'cursos' (apenas em desenvolvimento)
  useEffect(() => {
    if (!isDevelopmentMode) return;

    const channel = supabase
      .channel('cursos_superior_public_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['cursosSuperiorPublic'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, isDevelopmentMode]);

  // Caching com TanStack Query para carregar os cursos do catálogo público.
  const { data: cursos = [], isLoading: loading, isError } = useQuery<any[]>({
    queryKey: ['cursosSuperiorPublic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select('*')
        .eq('modalidade', 'SUPERIOR')
        .eq('status', 'ativo')
        .order('nome', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });

  // Lógica de filtragem combinada
  const filteredCursos = cursos.filter((curso) => {
    // 1. Filtro de Busca por Texto
    const nameMatch = curso.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const descMatch = (curso.descricao || '').toLowerCase().includes(searchTerm.toLowerCase());
    const textMatches = nameMatch || descMatch;

    // 2. Filtro de Grau Acadêmico
    let grauMatches = true;
    const currentArea = curso.area || '';
    if (selectedGrau === 'Bacharelado') {
      grauMatches = currentArea.startsWith('BACHARELADOS');
    } else if (selectedGrau === 'Licenciatura') {
      grauMatches = currentArea.startsWith('LICENCIATURAS');
    } else if (selectedGrau === 'Tecnologia') {
      grauMatches = currentArea === 'CURSOS SUPERIORES DE TECNOLOGIA';
    }

    // 3. Filtro de Modalidade
    let modMatches = true;
    if (selectedModalidade === 'Semipresencial') {
      modMatches = currentArea.includes('SEMIPRESENCIAL');
    } else if (selectedModalidade === '100% Online') {
      modMatches = currentArea.includes('100% ONLINE') || currentArea === 'CURSOS SUPERIORES DE TECNOLOGIA';
    }

    return textMatches && grauMatches && modMatches;
  });

  // Agrupamento por Categoria/Área dos cursos filtrados
  const groupedCursos: Record<string, any[]> = {};
  filteredCursos.forEach((curso) => {
    const cat = curso.area || 'Outros';
    if (!groupedCursos[cat]) {
      groupedCursos[cat] = [];
    }
    groupedCursos[cat].push(curso);
  });

  const categoryOrder = [
    'BACHARELADOS - SEMIPRESENCIAL',
    'BACHARELADOS - 100% ONLINE',
    'LICENCIATURAS - SEMIPRESENCIAL',
    'CURSOS SUPERIORES DE TECNOLOGIA',
  ];

  const sortedCategories = Object.keys(groupedCursos).sort((a, b) => {
    const idxA = categoryOrder.indexOf(a);
    const idxB = categoryOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const cleanFilters = () => {
    setSearchTerm('');
    setSelectedGrau('Todos');
    setSelectedModalidade('Todos');
  };

  const hasActiveFilters = searchTerm !== '' || selectedGrau !== 'Todos' || selectedModalidade !== 'Todos';

  return (
    <div className="flex flex-col min-h-screen bg-white font-sans">
      <Header />

      {/* Banner Superior */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src="/ensino-superior-bg.png"
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter">
            Ensino <span className="text-blue-400">Superior</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light leading-relaxed">
            Graduações e pós-graduações com qualidade, flexibilidade e diploma reconhecido pelo MEC, oferecidas em parceria com a Anhanguera.
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

              {/* Botões de Filtro */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
                
                {/* Filtro de Grau Acadêmico */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <GraduationCap size={14} /> Grau Acadêmico
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Todos', 'Bacharelado', 'Licenciatura', 'Tecnologia'].map((grau) => (
                      <button
                        key={grau}
                        onClick={() => setSelectedGrau(grau)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          selectedGrau === grau
                            ? 'bg-[#001a33] text-white shadow-md'
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {grau === 'Tecnologia' ? 'Tecnólogos' : grau === 'Todos' ? 'Todos' : grau + 's'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filtro de Modalidade */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Filter size={14} /> Modalidade
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['Todos', 'Semipresencial', '100% Online'].map((mod) => (
                      <button
                        key={mod}
                        onClick={() => setSelectedModalidade(mod)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          selectedModalidade === mod
                            ? 'bg-[#001a33] text-white shadow-md'
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {mod}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Status de Filtros Ativos */}
              {hasActiveFilters && (
                <div className="flex justify-between items-center bg-blue-50/50 border border-blue-100/60 rounded-xl px-4 py-2.5 text-xs">
                  <div className="text-blue-900 font-medium">
                    Mostrando <strong className="font-bold">{filteredCursos.length}</strong> de <strong className="font-bold">{cursos.length}</strong> cursos encontrados.
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
          {loading ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 flex flex-col justify-center items-center gap-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Carregando catálogo de cursos...</p>
            </div>
          ) : isError ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 text-center animate-fadeIn">
              <X className="text-red-500 mx-auto mb-4" size={56} />
              <p className="text-slate-600 font-bold mb-2">Erro ao carregar o catálogo de cursos.</p>
              <p className="text-slate-400 text-sm mb-6">
                Não foi possível obter os dados do servidor. Por favor, verifique a conexão ou tente novamente mais tarde.
              </p>
            </div>
          ) : filteredCursos.length === 0 ? (
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 text-center">
              <GraduationCap className="text-slate-300 mx-auto mb-4 animate-pulse" size={56} />
              <p className="text-slate-600 font-bold mb-2">Nenhum curso corresponde aos filtros selecionados.</p>
              <p className="text-slate-400 text-sm mb-6">Tente alterar o termo buscado ou limpar os filtros para ver todo o catálogo.</p>
              <button 
                onClick={cleanFilters}
                className="bg-[#001a33] hover:bg-blue-900 text-white font-bold px-8 py-3 rounded-full text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-950/20"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          ) : (
            <div className="space-y-16">
              {sortedCategories.map((categoria) => (
                <div key={categoria} className="space-y-6 animate-fadeIn">
                  {/* Título da Categoria */}
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="w-1 bg-blue-600 h-6 rounded-full"></div>
                    <h2 className="text-sm font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
                      <span>{categoria}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full font-bold">
                        {groupedCursos[categoria].length}
                      </span>
                    </h2>
                  </div>

                  {/* Grid de Cursos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {groupedCursos[categoria].map((curso) => {
                      const whatsappText = encodeURIComponent(
                        `Olá! Acessei o site da Universo e gostaria de obter mais informações sobre a matrícula para o curso de ${curso.nome} oferecido em parceria com a ${curso.parceiro_instituicao}.`
                      );
                      const whatsappUrl = `https://wa.me/557996028316?text=${whatsappText}`;

                      return (
                        <div
                          key={curso.id}
                          className="bg-white border border-slate-200 hover:border-blue-500/40 rounded-[2rem] p-6 flex flex-col justify-between min-h-[350px] shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 group"
                        >
                          <div>
                            {/* Imagem de Capa do Curso */}
                            {curso.imagem_url && (
                              <div className="h-40 w-full bg-slate-50 rounded-2xl overflow-hidden mb-4 border border-slate-100 shrink-0">
                                <img 
                                  src={curso.imagem_url} 
                                  alt={curso.nome} 
                                  className="w-full h-full object-cover" 
                                  loading="lazy" 
                                  decoding="async" 
                                />
                              </div>
                            )}

                            {/* Logo do Parceiro e Badge */}
                            <div className="flex justify-between items-center gap-4 mb-4">
                              <div className="h-9 w-24 bg-slate-50 border border-slate-100 rounded-xl p-1.5 flex items-center justify-center overflow-hidden shrink-0">
                                {curso.parceiro_logo_url ? (
                                  <img
                                    src={curso.parceiro_logo_url}
                                    alt={curso.parceiro_instituicao}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <Building className="text-slate-400" size={16} />
                                )}
                              </div>
                              <span className="text-[9px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-wider">
                                {curso.area?.split(' - ').pop() || 'EAD'}
                              </span>
                            </div>

                            {/* Nome do Curso */}
                            <h3 className="text-base font-black text-[#001a33] leading-snug mb-1 group-hover:text-blue-600 transition-colors line-clamp-2">
                              {curso.nome}
                            </h3>

                            {/* Nome do Parceiro */}
                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
                              Faculdade {curso.parceiro_instituicao}
                            </p>

                            {/* Descrição */}
                            <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-medium">
                              {curso.descricao || 'Fale com nossa equipe comercial para saber mais detalhes sobre este curso e o plano de estudos.'}
                            </p>
                          </div>

                          {/* CTA Button */}
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest hover:scale-[1.01] shadow-lg shadow-blue-500/10"
                          >
                            <Phone size={14} />
                            <span>Quero me Matricular</span>
                            <ArrowUpRight size={14} className="opacity-70" />
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Seção Central de Atendimento */}
          <div className="mt-20 text-center p-12 bg-slate-50 rounded-[40px] border border-slate-200">
            <h3 className="text-2xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">Dúvidas sobre o Ensino Superior?</h3>
            <p className="text-slate-600 mb-8 max-w-xl mx-auto leading-relaxed">
              Nossos consultores estão prontos para ajudar você a escolher o melhor curso, analisar descontos e iniciar sua inscrição.
            </p>
            <div className="flex justify-center">
              <a
                href="https://wa.me/557996028316"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-600 hover:bg-green-700 text-white font-black px-10 py-4 rounded-full transition-all shadow-xl shadow-green-900/20 uppercase tracking-widest transform hover:scale-105 inline-block"
              >
                Atendimento WhatsApp
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EnsinoSuperiorPublicPage;
