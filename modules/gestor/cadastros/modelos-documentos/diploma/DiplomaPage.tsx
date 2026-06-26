// File: modules/gestor/cadastros/modelos-documentos/diploma/DiplomaPage.tsx

import React, { useState, useEffect } from 'react';
import DiplomaCard from './components/DiplomaCard';
import DiplomaEditor from './components/DiplomaEditor';
import { diplomaService } from './diploma.service';

const DiplomaPage: React.FC = () => {
  const [modelos, setModelos] = useState<any[]>([]);
  const [editingModelo, setEditingModelo] = useState<any>(null);

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
  };

  const handleSave = async (savedModelo: any) => {
    const updated = modelos.map(m => m.id === savedModelo.id ? savedModelo : m);
    try {
      const saved = await diplomaService.saveTemplates(updated);
      if (!saved) {
        throw new Error('Falha ao persistir o modelo de certificado.');
      }
      setModelos(updated);
      setEditingModelo(null);
    } catch (err) {
      console.error('Erro ao salvar template:', err);
      alert('Erro ao salvar o modelo.');
    }
  };

  const handleCancel = () => {
    setEditingModelo(null);
  };

  if (editingModelo) {
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
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Modelos de Certificado</h3>
          <p className="text-slate-500 text-sm">Quatro modelos fixos para emissão: técnicos, EAD, livres e especialização.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modelos.map(modelo => (
          <DiplomaCard 
            key={modelo.id} 
            modelo={modelo} 
            onEdit={handleEdit} 
          />
        ))}
      </div>
    </div>
  );
};

export default DiplomaPage;
