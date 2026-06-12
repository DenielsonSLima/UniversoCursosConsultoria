
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import FichaCard from './components/FichaCard';
import FichaEditor from './components/FichaEditor';

const INITIAL_FICHAS = [
  {
    id: '1',
    nome: 'Ficha Padrão - Ensino Superior',
    tipoCurso: 'Ensino Superior',
    status: 'ativo',
    requerAssinatura: true,
    textoContrato: 'Declaro para os devidos fins que...',
    camposCount: 2,
    camposCustomizados: [
      { id: 1, label: 'Nome da Mãe' },
      { id: 2, label: 'Histórico Escolar do Ensino Médio' }
    ]
  },
  {
    id: '2',
    nome: 'Matrícula Rápida - Cursos Livres',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    requerAssinatura: false,
    textoContrato: 'Ao me matricular neste curso livre...',
    camposCount: 0,
    camposCustomizados: []
  }
];

const FichaMatriculaPage: React.FC = () => {
  const [fichas, setFichas] = useState(INITIAL_FICHAS);
  const [editingFicha, setEditingFicha] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleEdit = (ficha: any) => {
    setEditingFicha(ficha);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      setFichas(fichas.filter(f => f.id !== id));
    }
  };

  const handleSave = (savedFicha: any) => {
    if (isCreating) {
      setFichas([...fichas, savedFicha]);
    } else {
      setFichas(fichas.map(f => f.id === savedFicha.id ? savedFicha : f));
    }
    setEditingFicha(null);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingFicha(null);
    setIsCreating(false);
  };

  if (editingFicha || isCreating) {
    return (
      <div className="animate-fadeIn">
         <FichaEditor 
           ficha={editingFicha} 
           onSave={handleSave} 
           onCancel={handleCancel} 
         />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
            Ficha de Matrícula
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-1">Configure modelos de fichas de matrícula, termos e campos extras.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Modelo
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
         {fichas.map(ficha => (
           <FichaCard 
             key={ficha.id} 
             ficha={ficha} 
             onEdit={handleEdit} 
             onDelete={handleDelete} 
           />
         ))}
         
         <div 
           onClick={() => setIsCreating(true)}
           className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-all min-h-[220px] group"
         >
           <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 group-hover:text-blue-600 group-hover:scale-110 transition-transform mb-3">
             <Plus size={24} />
           </div>
           <h4 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Criar Novo Modelo</h4>
           <p className="text-xs text-slate-400 mt-2">Clique para configurar</p>
         </div>
      </div>
    </div>
  );
};

export default FichaMatriculaPage;
