
import React, { useState, useEffect } from 'react';
import { Zap, Plus, Loader2 } from 'lucide-react';
import CursoLivreCard from './components/CursoLivreCard';
import CursoLivreDetails from './components/CursoLivreDetails';
import { cursosLivresService } from './cursos-livres.service';
import { CursoLivre } from './cursos-livres.types';

const CursosLivresPage: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [cursos, setCursos] = useState<CursoLivre[]>([]);
  const [selectedCurso, setSelectedCurso] = useState<CursoLivre | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCursos();
  }, []);

  const loadCursos = async () => {
    setLoading(true);
    const data = await cursosLivresService.getAll();
    setCursos(data);
    setLoading(false);
  };

  const handleSelectCurso = (curso: CursoLivre) => {
    setSelectedCurso(curso);
    setViewState('details');
  };

  const handleBack = () => {
    setSelectedCurso(null);
    setViewState('list');
    loadCursos();
  };

  if (viewState === 'details' && selectedCurso) {
    return (
      <CursoLivreDetails 
        curso={selectedCurso} 
        onBack={handleBack} 
        onUpdate={loadCursos}
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Cursos Livres
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Gestão de cursos de curta duração e capacitação rápida.
          </p>
        </div>
        
        <button className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-amber-600 transition-colors shadow-lg shadow-amber-900/20">
          <Plus size={16} /> Novo Curso
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-amber-600" size={32} />
        </div>
      ) : cursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
           <Zap className="text-slate-300 mx-auto mb-4" size={48} />
           <p className="text-slate-500 font-medium">Nenhum curso livre cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cursos.map((curso) => (
            <CursoLivreCard 
              key={curso.id} 
              curso={curso} 
              onClick={() => handleSelectCurso(curso)} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CursosLivresPage;
