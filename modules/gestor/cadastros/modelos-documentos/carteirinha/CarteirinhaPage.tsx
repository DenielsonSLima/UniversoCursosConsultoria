import React, { useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import CarteirinhaCard from './components/CarteirinhaCard';
import CarteirinhaEditor from './components/CarteirinhaEditor';

const INITIAL_MODELOS = [
  {
    id: '1',
    nome: 'Carteira de Identificação Estudantil (CIE) - Lei 12.933',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#0284c7', // Sky 600
    corSecundaria: '#e0f2fe',
    textoFrente: 'DOCUMENTO DO ESTUDANTE',
    textoVerso: 'Este documento é padronizado nacionalmente nos termos da Lei nº 12.933/2013 e garante o direito de meia-entrada em eventos artísticos-culturais e esportivos.\\n\\nUso pessoal e intransferível.\\nVerifique a validade via QR Code.',
  },
  {
    id: '2',
    nome: 'Carteirinha Superior',
    tipoCurso: 'Ensino Superior',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#7c3aed', // Violet 600
    corSecundaria: '#ede9fe',
    textoFrente: 'C. I. E. UNIVERSITÁRIA',
    textoVerso: 'Válido em todo território nacional para estudantes de graduação e pós-graduação.\\nLei da Meia-Entrada - 12.933/13.',
  },
  {
    id: '3',
    nome: 'Identificação Interna - Cursos Livres',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#475569', // Slate 600
    corSecundaria: '#f1f5f9',
    textoFrente: 'IDENTIFICAÇÃO DE ACESSO',
    textoVerso: 'ATENÇÃO: Este documento é para uso exclusivamente interno da instituição para controle de acessos corporativos, biblioteca e laboratórios.\\n\\nNão possui validade como Documento do Estudante (CIE) nos termos da legislação federal de meia-entrada.',
  }
];

const CarteirinhaPage: React.FC = () => {
  const [modelos, setModelos] = useState(INITIAL_MODELOS);
  const [editingModelo, setEditingModelo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleEdit = (modelo: any) => {
    setEditingModelo(modelo);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo?')) {
      setModelos(modelos.filter(m => m.id !== id));
    }
  };

  const handleSave = (savedModelo: any) => {
    if (isCreating) {
      setModelos([...modelos, savedModelo]);
    } else {
      setModelos(modelos.map(m => m.id === savedModelo.id ? savedModelo : m));
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
      <CarteirinhaEditor 
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
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">CIE / Carteirinha</h3>
          <p className="text-slate-500 text-sm mt-1">Configuração da Identidade Estudantil CR80 baseada na Lei 12.933/2013.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Modelo
        </button>
      </div>

      {/* Info Notice about Lei da Meia Entrada */}
      <div className="bg-sky-50 border border-sky-100 p-4 rounded-2xl mb-8 flex items-start gap-4">
        <div className="p-2 bg-sky-100 text-sky-600 rounded-lg shrink-0 mt-0.5">
          <CreditCard size={20} />
        </div>
        <div>
          <h4 className="text-sm font-black text-sky-900 uppercase tracking-tight mb-1">Sobre a Emissão</h4>
          <p className="text-xs text-sky-800 leading-relaxed font-medium">
            Segundo a regulamentação, têm direito ao Documento do Estudante (CIE) com meia-entrada os matriculados na educação infantil, ensino fundamental, médio, <strong>técnico</strong> e <strong>superior</strong>. Estudantes de <span className="font-bold underline">Cursos Livres</span> não estão amparados, mas você pode criar um modelo de uso interno.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modelos.map(modelo => (
          <CarteirinhaCard 
            key={modelo.id} 
            modelo={modelo} 
            onEdit={handleEdit} 
            onDelete={handleDelete} 
          />
        ))}
        
        <div 
          onClick={() => setIsCreating(true)}
          className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-pink-300 hover:shadow-lg transition-all min-h-[220px] group"
        >
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 group-hover:text-pink-600 group-hover:scale-110 transition-transform mb-3">
            <Plus size={24} />
          </div>
          <h4 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Criar Novo Modelo</h4>
          <p className="text-xs text-slate-400 mt-2">Clique para configurar</p>
        </div>
      </div>
    </div>
  );
};

export default CarteirinhaPage;
