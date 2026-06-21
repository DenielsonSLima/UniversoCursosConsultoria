// File: modules/gestor/cadastros/modelos-documentos/diploma/DiplomaPage.tsx

import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import DiplomaCard from './components/DiplomaCard';
import DiplomaEditor from './components/DiplomaEditor';
import { diplomaService } from './diploma.service';

const DiplomaPage: React.FC = () => {
  const [modelos, setModelos] = useState<any[]>([]);
  const [editingModelo, setEditingModelo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadPersisted = async () => {
      try {
        const persisted = await diplomaService.getTemplates();
        if (persisted && persisted.length > 0) {
          setModelos(persisted);
        }
      } catch (err) {
        console.error('Erro ao carregar templates de diplomas:', err);
      }
    };
    loadPersisted();
  }, []);

  const handleEdit = (modelo: any) => {
    setEditingModelo(modelo);
    setIsCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      const updated = modelos.filter(m => m.id !== id);
      setModelos(updated);
      try {
        await diplomaService.saveTemplates(updated);
      } catch (err) {
        console.error('Erro ao excluir template:', err);
        alert('Erro ao excluir o modelo.');
      }
    }
  };

  const handleSave = async (savedModelo: any) => {
    let updated = [];
    if (isCreating) {
      updated = [...modelos, savedModelo];
    } else {
      updated = modelos.map(m => m.id === savedModelo.id ? savedModelo : m);
    }
    setModelos(updated);
    try {
      await diplomaService.saveTemplates(updated);
    } catch (err) {
      console.error('Erro ao salvar template:', err);
      alert('Erro ao salvar o modelo.');
    }
    setEditingModelo(null);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setEditingModelo(null);
    setIsCreating(false);
  };

  if (editingModelo || isCreating) {
    return (
      <DiplomaEditor 
        modelo={editingModelo} 
        onSave={handleSave} 
        onCancel={handleCancel} 
      />
    );
  }

  return (
    <div className="animate-fadeIn max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Modelo Diploma</h3>
          <p className="text-slate-500 text-sm">Design e dados do certificado de conclusão.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Modelo
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modelos.map(modelo => (
          <DiplomaCard 
            key={modelo.id} 
            modelo={modelo} 
            onEdit={handleEdit} 
            onDelete={handleDelete} 
          />
        ))}
        
        <div 
          onClick={() => setIsCreating(true)}
          className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-purple-300 hover:shadow-lg transition-all min-h-[220px] group"
        >
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 group-hover:text-purple-600 group-hover:scale-110 transition-transform mb-3">
            <Plus size={24} />
          </div>
          <h4 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Criar Novo Modelo</h4>
          <p className="text-xs text-slate-400 mt-2">Clique para configurar</p>
        </div>
      </div>
    </div>
  );
};

export default DiplomaPage;
