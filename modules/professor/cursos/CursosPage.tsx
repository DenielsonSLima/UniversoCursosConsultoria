import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { BookOpen, MonitorPlay, Zap, Award, Clock, Search } from 'lucide-react';

const CursosPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ead' | 'live' | 'especializacao'>('ead');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all active courses
  const { data: courses = [], isLoading, isError } = useQuery<any[]>({
    queryKey: ['professor-cursos-disponiveis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cursos')
        .select('*')
        .eq('status', 'ativo')
        .order('nome', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  const getFilteredCourses = () => {
    let typeFilter = 'EAD';
    if (activeTab === 'live') typeFilter = 'LIVRE';
    if (activeTab === 'especializacao') typeFilter = 'ESPECIALIZACAO';

    return courses.filter(c => {
      const matchesType = c.modalidade?.toUpperCase() === typeFilter;
      const matchesSearch = c.nome?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.descricao?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  };

  const filtered = getFilteredCourses();

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="text-purple-600" />
            Catálogo Acadêmico
          </h2>
          <p className="text-xs text-slate-450 font-medium">Consulte a ementa de cursos e especializações da instituição</p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input 
            type="text" 
            placeholder="Pesquisar ementas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 focus:border-purple-500 outline-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-max">
        <button
          onClick={() => setActiveTab('ead')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'ead' 
              ? 'bg-white text-purple-600 shadow-sm' 
              : 'text-slate-500 hover:text-purple-600'
          }`}
        >
          <MonitorPlay size={15} />
          <span>Cursos EAD</span>
        </button>

        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'live' 
              ? 'bg-white text-purple-600 shadow-sm' 
              : 'text-slate-500 hover:text-purple-600'
          }`}
        >
          <Zap size={15} />
          <span>Aulas Lives</span>
        </button>

        <button
          onClick={() => setActiveTab('especializacao')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'especializacao' 
              ? 'bg-white text-purple-600 shadow-sm' 
              : 'text-slate-500 hover:text-purple-600'
          }`}
        >
          <Award size={15} />
          <span>Especializações</span>
        </button>
      </div>

      {/* Content grid */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : isError ? (
        <div className="p-6 bg-red-50 text-red-700 rounded-2xl text-xs font-bold border border-red-100">
          Falha ao carregar catálogo de cursos.
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
          <p className="text-slate-450 font-bold text-xs">Nenhum curso encontrado nesta modalidade.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(course => (
            <div 
              key={course.id}
              className="bg-white rounded-[2.5rem] border border-slate-100 hover:border-purple-500 shadow-sm p-6 flex flex-col justify-between group transition-all"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    activeTab === 'ead' ? 'bg-blue-50 text-blue-650' :
                    activeTab === 'live' ? 'bg-amber-50 text-amber-650' : 'bg-purple-50 text-purple-650'
                  }`}>
                    {activeTab === 'ead' ? <MonitorPlay size={18} /> :
                     activeTab === 'live' ? <Zap size={18} /> : <Award size={18} />}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                    {course.area || 'Saúde'}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#001a33] leading-tight line-clamp-2 group-hover:text-purple-600 transition-colors">
                    {course.nome}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium line-clamp-3 mt-2 leading-relaxed">
                    {course.descricao || 'Sem descrição cadastrada para este curso. Entre em contato com a secretaria pedagógica.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold">
                  <Clock size={14} />
                  <span>{course.carga_horaria || 80}h</span>
                </div>

                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Cadastrado
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CursosPage;
