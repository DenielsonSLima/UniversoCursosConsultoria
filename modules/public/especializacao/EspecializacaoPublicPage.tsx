import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Award, Calendar, Clock, Loader2, Search, Filter, X, ArrowRight, FileText, CheckCircle2, MapPin } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { supabase } from '../../../lib/supabase';
import { textMatchesSearch } from '../../../lib/search';
import { fetchPublicCoursesWithOpenTurmas, formatPublicTurmaInicio, formatPublicTurmaPolo, getCursoTurmasAbertas } from '../courseAvailability';

const EspecializacaoPublicPage: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Estados de Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('Todos');

  // Força o scroll para o topo ao carregar a página
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  // Inscrição Realtime para atualizações em tempo real da tabela 'cursos'
  useEffect(() => {
    const channel = supabase
      .channel('cursos_especializacao_public_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cursos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['cursosEspecializacaoPublic'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Caching com TanStack Query para carregar os cursos do catálogo público
  const { data: cursos = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['cursosEspecializacaoPublic'],
    queryFn: async () => {
      return fetchPublicCoursesWithOpenTurmas('ESPECIALIZACAO');
    },
    enabled: true,
  });

  // Filtragem combinada
  const filteredCursos = cursos.filter((curso) => {
    const textMatches = textMatchesSearch(searchTerm, [curso.nome, curso.descricao, curso.area]);

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
            Especialização <span className="text-blue-400">Técnica</span>
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mx-auto font-light leading-relaxed">
            Pós-técnicos e especializações direcionadas para aprimorar suas habilidades e impulsionar sua carreira.
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
                    Mostrando <strong className="font-bold">{filteredCursos.length}</strong> de <strong className="font-bold">{cursos.length}</strong> especializações encontradas.
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

          {/* Grid com a Listagem e os Documentos */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LADO ESQUERDO: Catálogo de Cursos (Col span 8 no desktop) */}
            <div className="lg:col-span-8">
              {loading ? (
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 flex flex-col justify-center items-center gap-4">
                  <Loader2 className="animate-spin text-blue-600" size={40} />
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Carregando catálogo...</p>
                </div>
              ) : filteredCursos.length === 0 ? (
                <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-20 text-center animate-fadeIn">
                  <Award className="text-slate-300 mx-auto mb-4 animate-pulse" size={56} />
                  <p className="text-slate-600 font-bold mb-2">Nenhuma especialização corresponde aos filtros selecionados.</p>
                  <p className="text-slate-400 text-sm mb-6">Tente alterar a palavra buscada ou limpar os filtros para ver todo o catálogo.</p>
                  <button 
                    onClick={cleanFilters}
                    className="bg-[#001a33] hover:bg-blue-900 text-white font-bold px-8 py-3 rounded-full text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-950/20"
                  >
                    Limpar Todos os Filtros
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                  {filteredCursos.map((curso) => {
                    const duracao = curso.duracao_meses || 6;
                    const turmasAbertas = getCursoTurmasAbertas(curso);
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
                                <Award size={36} className="opacity-40" />
                                <span className="text-[10px] font-black uppercase tracking-wider opacity-60">Especialização Técnica</span>
                              </div>
                            )}
                            <span className="absolute top-3 right-3 bg-white/95 backdrop-blur shadow-sm text-[8px] font-black text-blue-600 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-wider">
                              {curso.area || 'Saúde'}
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

                          {turmasAbertas.length > 0 ? (
                            <div className="mb-4 space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Turmas abertas por polo</p>
                              {turmasAbertas.slice(0, 3).map((turma: any) => (
                                <div key={turma.id} className="flex items-start gap-2 text-[11px] font-bold text-emerald-900">
                                  <MapPin size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                                  <span>{formatPublicTurmaPolo(turma)} • início {formatPublicTurmaInicio(turma)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[11px] font-bold text-amber-800">
                              Aguardando abertura de turma presencial.
                            </div>
                          )}

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
                          onClick={() => navigate(`/especializacao/detalhes/${curso.id}`)}
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

            {/* LADO DIREITO: Aviso de Pré-requisito Obrigatório */}
            <div className="lg:col-span-4 bg-[#001a33] text-white border border-blue-950 rounded-[2.5rem] p-8 shadow-lg lg:sticky lg:top-24 overflow-hidden relative">
              {/* Círculo decorativo */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

              <h3 className="text-lg font-black uppercase tracking-tight mb-2 flex items-center gap-2 text-blue-400">
                <Award size={22} />
                Pré-requisito
              </h3>
              <p className="text-slate-300 text-xs font-bold uppercase tracking-widest mb-6 border-b border-blue-950/60 pb-3">
                Requisito de Matrícula
              </p>

              <div className="space-y-4">
                <p className="text-xs text-slate-200 leading-relaxed font-light">
                  Diferente dos cursos livres, a <strong className="text-white font-bold">Especialização Técnica (Pós-Técnico)</strong> é uma formação direcionada a quem já possui uma base profissional.
                </p>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-200 font-medium">
                      É necessário estar <strong className="text-white font-bold">cursando a fase final</strong> ou ter <strong className="text-white font-bold">concluído</strong> o curso técnico ou superior correspondente na área do curso desejado.
                    </p>
                  </div>
                  <div className="flex gap-2.5 items-start">
                    <CheckCircle2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-200 font-medium">
                      Exemplo: Para a Especialização em Instrumentação Cirúrgica, é obrigatório possuir formação em Técnico em Enfermagem.
                    </p>
                  </div>
                </div>
              </div>

              {/* Box de Atenção */}
              <div className="mt-8 bg-amber-500/15 border border-amber-500/30 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <span>⚠️</span> Atenção!
                </p>
                <p className="text-[11px] text-amber-200 leading-normal font-light">
                  A comprovação de escolaridade (diploma, histórico ou declaração de matrícula ativa da formação base) será exigida no momento da efetivação de sua inscrição.
                </p>
              </div>
            </div>

          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default EspecializacaoPublicPage;
