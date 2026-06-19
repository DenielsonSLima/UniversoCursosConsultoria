import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Shield } from 'lucide-react';
import CrachaCard from './components/CrachaCard';
import CrachaEditor from './components/CrachaEditor';
import { crachaService } from './cracha.service';

const INITIAL_MODELOS = [
  {
    id: '1',
    nome: 'Crachá de Docente / Professor',
    cargoPadrao: 'DOCENTE / PROFESSOR',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#0f172a', // Slate 900
    corSecundaria: '#38bdf8', // Sky 400
    textoFrente: 'DOCENTE',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição.\n2. Mantenha-o sempre visível em local adequado com cordão de segurança.\n3. Em caso de perda, roubo ou extravio, comunique imediatamente o setor administrativo.\n4. Se encontrado, favor devolver à Universo Cursos e Consultoria.',
  },
  {
    id: '2',
    nome: 'Crachá Técnico / Administrativo',
    cargoPadrao: 'AUXILIAR ADMINISTRATIVO',
    status: 'inativo',
    hasVerso: true,
    corPrimaria: '#1e3a8a', // Blue 900
    corSecundaria: '#60a5fa', // Blue 400
    textoFrente: 'TÉCNICO / ADM',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição.\n2. Mantenha-o sempre visível em local adequado com cordão de segurança.\n3. Em caso de perda, roubo ou extravio, comunique imediatamente o setor administrativo.\n4. Se encontrado, favor devolver à Universo Cursos e Consultoria.',
  },
  {
    id: '3',
    nome: 'Crachá de Supervisor / Direção',
    cargoPadrao: 'COORDENADOR GERAL',
    status: 'inativo',
    hasVerso: true,
    corPrimaria: '#111827', // Gray 900
    corSecundaria: '#fbbf24', // Amber 400
    textoFrente: 'DIRETORIA',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição.\n2. Mantenha-o sempre visível em local adequado com cordão de segurança.\n3. Em caso de perda, roubo ou extravio, comunique imediatamente o setor administrativo.\n4. Se encontrado, favor devolver à Universo Cursos e Consultoria.',
  }
];

const CrachaPage: React.FC = () => {
  const [modelos, setModelos] = useState(INITIAL_MODELOS);
  const [editingModelo, setEditingModelo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const loadPersisted = async () => {
      try {
        const persisted = await crachaService.getTemplate();
        if (persisted && persisted.id) {
          setModelos(prev => prev.map(m => m.id === persisted.id ? persisted : m));
        }
      } catch (err) {
        console.error('Erro ao carregar template de crachá persistido:', err);
      }
    };
    loadPersisted();
  }, []);

  const handleEdit = (modelo: any) => {
    setEditingModelo(modelo);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este modelo de crachá?')) {
      setModelos(modelos.filter(m => m.id !== id));
    }
  };

  const handleSave = async (savedModelo: any) => {
    try {
      await crachaService.saveTemplate(savedModelo);
      if (isCreating) {
        setModelos([...modelos, savedModelo]);
      } else {
        setModelos(modelos.map(m => m.id === savedModelo.id ? savedModelo : m));
      }
    } catch (err) {
      console.error('Erro ao salvar template de crachá:', err);
      alert('Erro ao salvar o modelo de crachá.');
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
      <CrachaEditor 
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
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Crachás de Identificação</h3>
          <p className="text-slate-500 text-sm mt-1">Configuração de crachás de identificação corporativos para colaboradores e docentes.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Modelo
        </button>
      </div>

      {/* Info Notice about Crachás */}
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-8 flex items-start gap-4">
        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0 mt-0.5">
          <Shield size={20} />
        </div>
        <div>
          <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight mb-1">Políticas de Segurança Escolar</h4>
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            O crachá corporativo no padrão vertical (CR80 Vertical) é recomendado para todos os colaboradores, técnicos administrativos e docentes em atividades escolares e externas (ex: supervisão de estágio). A sua personalização ajuda a diferenciar cargos e níveis de acesso nos polos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modelos.map(modelo => (
          <CrachaCard 
            key={modelo.id} 
            modelo={modelo} 
            onEdit={handleEdit} 
            onDelete={handleDelete} 
          />
        ))}
        
        <div 
          onClick={() => setIsCreating(true)}
          className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-blue-300 hover:shadow-lg transition-all min-h-[220px] group"
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

export default CrachaPage;
