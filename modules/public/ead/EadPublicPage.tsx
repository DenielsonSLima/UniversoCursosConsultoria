import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Laptop, Clock, Loader2, Search, Filter, X, ArrowRight, BookOpen } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../../../lib/supabase';
import { textMatchesSearch } from '../../../lib/search';
import { buildEadCoursePath } from './eadCourseLinks';

const PUBLIC_EAD_COURSE_COLUMNS = 'id, nome, modalidade, carga_horaria, status, area, descricao, parceiro_instituicao, parceiro_logo_url, imagem_url, duracao_meses, publicar_site, imagem_detalhe_1, imagem_detalhe_2, valor, asaas_payment_link_url';

const PUBLIC_EAD_CATEGORIES = [
  'Administração e Gestão',
  'Educação',
  'Saúde',
  'Tecnologia e Comunicação',
  'Comércio e Vendas',
  'Segurança e Operações',
  'Beleza e Bem-estar',
  'Serviços e Finanças',
];

const PUBLIC_AREA_ALIASES: Record<string, string> = {
  'Educação': 'Educação',
  'Educação Social': 'Educação',
  'Educação Física': 'Educação',
  'Administração Escolar': 'Educação',
  'Gestão Escolar': 'Educação',
  'Matemática': 'Educação',
  'Educação Inclusiva': 'Educação',
  'Tecnologia Kids': 'Educação',
  'Saúde': 'Saúde',
  'Saúde e Atendimento': 'Saúde',
  'Saúde e Cuidado': 'Saúde',
  'Saúde e Diagnóstico': 'Saúde',
  'Saúde Animal': 'Saúde',
  'Administração e Gestão': 'Administração e Gestão',
  'Administração e Operações': 'Administração e Gestão',
  'Tecnologia e Produtividade': 'Tecnologia e Comunicação',
  'Comunicação Digital': 'Tecnologia e Comunicação',
  'Comunicação e Linguagens': 'Tecnologia e Comunicação',
  'Tecnologia e Vendas': 'Tecnologia e Comunicação',
  'Atendimento e Vendas': 'Comércio e Vendas',
  'Comércio e Varejo': 'Comércio e Vendas',
  'Negócios e Vendas': 'Comércio e Vendas',
  'Segurança Operacional': 'Segurança e Operações',
  'Segurança Patrimonial': 'Segurança e Operações',
  'Transporte Escolar': 'Segurança e Operações',
  'Logística e Operações': 'Segurança e Operações',
  'Comércio e Segurança': 'Segurança e Operações',
  'Elétrica e Segurança': 'Segurança e Operações',
  'Segurança do Trabalho': 'Segurança e Operações',
  'Máquinas Pesadas': 'Segurança e Operações',
  'Beleza e Estética': 'Beleza e Bem-estar',
  'Serviço Social': 'Serviços e Finanças',
  'Alimentação': 'Serviços e Finanças',
  'Finanças e Bancos': 'Serviços e Finanças',
};

const normalizePublicArea = (area?: string | null) => {
  const cleanArea = String(area || '').trim();
  return PUBLIC_AREA_ALIASES[cleanArea] || (cleanArea && PUBLIC_EAD_CATEGORIES.includes(cleanArea) ? cleanArea : 'Administração e Gestão');
};

const EadPublicPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isDevelopmentMode = import.meta.env.VITE_APP_MODE === 'development';

  // Estados de Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('Todos');
  const [groupMode, setGroupMode] = useState<'area' | 'none'>('area');
  const [sortMode, setSortMode] = useState<'nome-asc' | 'nome-desc' | 'valor-asc' | 'valor-desc' | 'carga-desc'>('nome-asc');

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Inscrição Realtime para atualizações em tempo real da tabela 'cursos' (apenas em desenvolvimento)
  useEffect(() => {
    if (!isDevelopmentMode) return;

    const channel = supabase
      .channel('cursos_ead_public_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['cursosEadPublic'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, isDevelopmentMode]);

  // Caching com TanStack Query para carregar os cursos do catálogo público EAD.
  const { data: cursos = [], isLoading: loading, isError } = useQuery<any[]>({
    queryKey: ['cursosEadPublic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select(PUBLIC_EAD_COURSE_COLUMNS)
        .eq('modalidade', 'EAD')
        .eq('status', 'ativo')
        .eq('publicar_site', true)
        .order('nome', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });

  // Filtragem combinada
  const filteredCursos = cursos.filter((curso) => {
    const textMatches = textMatchesSearch(searchTerm, [curso.nome, curso.descricao, curso.area]);

    let areaMatches = true;
    if (selectedArea !== 'Todos') {
      areaMatches = normalizePublicArea(curso.area) === selectedArea;
    }

    return textMatches && areaMatches;
  });

  const sortedCursos = [...filteredCursos].sort((a, b) => {
    const nomeA = String(a.nome || '');
    const nomeB = String(b.nome || '');
    const valorA = Number(a.valor || 0);
    const valorB = Number(b.valor || 0);
    const cargaA = Number(a.carga_horaria || 0);
    const cargaB = Number(b.carga_horaria || 0);

    if (sortMode === 'nome-desc') return nomeB.localeCompare(nomeA, 'pt-BR');
    if (sortMode === 'valor-asc') return valorA - valorB || nomeA.localeCompare(nomeB, 'pt-BR');
    if (sortMode === 'valor-desc') return valorB - valorA || nomeA.localeCompare(nomeB, 'pt-BR');
    if (sortMode === 'carga-desc') return cargaB - cargaA || nomeA.localeCompare(nomeB, 'pt-BR');
    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  const groupedCursos = groupMode === 'area'
    ? Array.from(sortedCursos.reduce((groups, curso) => {
        const area = normalizePublicArea(curso.area);
        const current = groups.get(area) || [];
        current.push(curso);
        groups.set(area, current);
        return groups;
      }, new Map<string, any[]>()).entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    : [['Todos os cursos', sortedCursos] as [string, any[]]];

  // Áreas presentes dinamicamente para os filtros
  const areaSet = new Set(cursos.map((c) => normalizePublicArea(c.area)));
  const areasExistentes = ['Todos', ...PUBLIC_EAD_CATEGORIES.filter((area) => areaSet.has(area))];

  const cleanFilters = () => {
    setSearchTerm('');
    setSelectedArea('Todos');
    setGroupMode('area');
    setSortMode('nome-asc');
  };

  const hasActiveFilters = searchTerm !== '' || selectedArea !== 'Todos' || groupMode !== 'area' || sortMode !== 'nome-asc';

  return (
    <div className="flex flex-col min-h-screen bg-white font-sans">
      <Header />

      {/* Banner Superior */}
      <div className="bg-gradient-to-b from-[#001a33] to-[#003366] py-24 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1920" 
            alt="EAD Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container mx-auto px-6 relative z-10 text-center">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300">
            <Laptop size={14} /> Educação a distância
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-4 uppercase tracking-tighter animate-fadeIn">
            Cursos <span className="text-blue-400">EAD</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light leading-relaxed">
            Formações on-line flexíveis, completas e interativas para você estudar no seu ritmo e impulsionar a sua carreira com certificação garantida.
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
                  placeholder="Pesquisar curso EAD por nome ou palavras-chave..."
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

              {/* Filtros e ordenação */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <label className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Filter size={14} /> Categoria
                  </span>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  >
                    {areasExistentes.map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Agrupamento</span>
                  <select
                    value={groupMode}
                    onChange={(e) => setGroupMode(e.target.value as 'area' | 'none')}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="area">Agrupar por categoria</option>
                    <option value="none">Sem agrupamento</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ordenação</span>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="nome-asc">Ordem alfabética A-Z</option>
                    <option value="nome-desc">Ordem alfabética Z-A</option>
                    <option value="valor-asc">Menor valor</option>
                    <option value="valor-desc">Maior valor</option>
                    <option value="carga-desc">Maior carga horária</option>
                  </select>
                </label>
              </div>

              {/* Status de Filtros Ativos */}
              {hasActiveFilters && (
                <div className="flex justify-between items-center bg-blue-50/50 border border-blue-100/60 rounded-xl px-4 py-2.5 text-xs">
                  <div className="text-blue-900 font-medium">
                    Mostrando <strong className="font-bold">{sortedCursos.length}</strong> de <strong className="font-bold">{cursos.length}</strong> cursos EAD encontrados.
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

          {/* Listagem de Cursos EAD (Largura total, Grid 3 colunas) */}
          <div className="w-full">
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
            ) : sortedCursos.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 text-center animate-fadeIn">
                <BookOpen className="text-slate-300 mx-auto mb-4 animate-pulse" size={56} />
                <p className="text-slate-600 font-bold mb-2">Nenhum curso EAD corresponde aos filtros selecionados.</p>
                <p className="text-slate-400 text-sm mb-6">Tente alterar a palavra buscada ou limpar os filtros para ver todo o catálogo.</p>
                <button 
                  onClick={cleanFilters}
                  className="bg-[#001a33] hover:bg-blue-900 text-white font-bold px-8 py-3 rounded-full text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-950/20"
                >
                  Limpar Todos os Filtros
                </button>
              </div>
            ) : (
              <div className="space-y-12 animate-fadeIn">
                {groupedCursos.map(([groupName, groupCursos]) => (
                  <section key={groupName} className="space-y-5">
                    {groupMode === 'area' && (
                      <div className="flex items-center gap-3">
                        <span className="h-8 w-1 rounded-full bg-blue-500"></span>
                        <h2 className="text-lg font-black text-[#001a33] uppercase tracking-[0.18em]">{groupName}</h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 border border-blue-100">
                          {groupCursos.length}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {groupCursos.map((curso) => {
                        const eadCarga = curso.carga_horaria || 80;
                        const cursoArea = normalizePublicArea(curso.area);
                        return (
                          <div
                            key={curso.id}
                            className="bg-white border border-slate-200 hover:border-blue-500/40 rounded-[2rem] p-6 flex flex-col justify-between min-h-[380px] shadow-sm hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 group"
                          >
                      <div>
                        {/* Imagem de Capa do Curso */}
                        <div className="h-44 w-full bg-slate-50 rounded-2xl overflow-hidden mb-4 border border-slate-100 shrink-0 flex items-center justify-center relative">
                          {curso.imagem_url ? (
                            <img 
                              src={curso.imagem_url} 
                              alt={curso.nome} 
                              className="w-full h-full object-cover" 
                              loading="lazy" 
                              decoding="async" 
                            />
                          ) : (
                            <div className="w-full h-full bg-blue-50/50 flex flex-col items-center justify-center text-blue-600 gap-2">
                              <Laptop size={36} className="opacity-40" />
                              <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Curso Online</span>
                            </div>
                          )}
                          <span className="absolute top-3 right-3 bg-white/95 backdrop-blur shadow-sm text-[8px] font-black text-blue-600 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-wider">
                            {cursoArea}
                          </span>
                        </div>

                        {/* Nome do Curso */}
                        <h3 className="text-lg font-black text-[#001a33] leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                          {curso.nome}
                        </h3>

                        {/* Ficha técnica básica */}
                        <div className="flex items-center gap-3 text-xs text-slate-500 font-bold mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100 w-fit">
                          <span className="flex items-center gap-1"><Clock size={14} className="text-blue-500" /> {eadCarga}h</span>
                          <span className="text-slate-300">|</span>
                          <span className="flex items-center gap-1"><Laptop size={14} className="text-blue-500" /> 100% Online</span>
                        </div>

                        {/* Descrição */}
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-medium">
                          {curso.descricao || 'Estude de forma totalmente digital com materiais atualizados, suporte e certificação garantida pela Universo.'}
                        </p>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between animate-fadeIn">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investimento</span>
                          <div className={`rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm border ${
                            curso.valor && curso.valor > 0
                              ? 'bg-emerald-50 border-emerald-100'
                              : 'bg-red-50 border-red-100'
                          }`}>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${
                              curso.valor && curso.valor > 0 ? 'text-emerald-800' : 'text-red-700'
                            }`}>
                              {curso.valor && curso.valor > 0 ? 'A partir de' : 'Valor pendente'}
                            </span>
                            <span className={`text-sm font-black ${
                              curso.valor && curso.valor > 0 ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {curso.valor && curso.valor > 0
                                ? `R$ ${curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                : 'Obrigatório'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <button
                        onClick={() => navigate(buildEadCoursePath(curso.id, curso.nome))}
                        className="w-full mt-6 bg-[#001a33] hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest hover:scale-[1.01] shadow-lg shadow-blue-500/10"
                      >
                        <span>Ver Detalhes do Curso</span>
                        <ArrowRight size={14} />
                      </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EadPublicPage;
