
import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Loader2 } from 'lucide-react';
import CursoTecnicoCard from './components/CursoTecnicoCard';
import CursoTecnicoDetails from './components/CursoTecnicoDetails';
import { cursosTecnicosService } from './cursos-tecnicos.service';
import { CursoTecnico } from './cursos-tecnicos.types';

const CursosTecnicosPage: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [cursos, setCursos] = useState<CursoTecnico[]>([]);
  const [selectedCurso, setSelectedCurso] = useState<CursoTecnico | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCursos();
  }, []);

  const loadCursos = async () => {
    setLoading(true);
    const data = await cursosTecnicosService.getAll();
    setCursos(data);
    setLoading(false);
  };

  const handleSelectCurso = (curso: CursoTecnico) => {
    setSelectedCurso(curso);
    setViewState('details');
  };

  const handleBack = () => {
    setSelectedCurso(null);
    setViewState('list');
    loadCursos(); // Recarrega para refletir mudanças de carga horária, etc.
  };

  if (viewState === 'details' && selectedCurso) {
    return (
      <CursoTecnicoDetails 
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
            Cursos Técnicos
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Gerenciamento de grade curricular e ofertas de cursos técnicos.
          </p>
        </div>
        
        <button className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20">
          <Plus size={16} /> Novo Curso
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : cursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
           <Briefcase className="text-slate-300 mx-auto mb-4" size={48} />
           <p className="text-slate-500 font-medium">Nenhum curso técnico cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cursos.map((curso) => (
            <CursoTecnicoCard 
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

export default CursosTecnicosPage;
