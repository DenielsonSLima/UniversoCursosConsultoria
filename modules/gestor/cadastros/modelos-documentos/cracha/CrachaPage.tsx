import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import CrachaCard from './components/CrachaCard';
import CrachaEditor from './components/CrachaEditor';
import { crachaService } from './cracha.service';

const INITIAL_MODELOS = [
  {
    id: 'cracha',
    nome: 'Crachá de Estágio',
    cargoPadrao: 'ESTAGIÁRIO',
    status: 'ativo',
    hasVerso: true,
    corPrimaria: '#0f172a',
    corSecundaria: '#10b981', // Emerald 500
    textoFrente: 'ESTAGIÁRIO',
    textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal, intransferível e obrigatório nas dependências da instituição e no local do estágio.\n2. Mantenha-o sempre visível.\n3. Em caso de perda, comunique imediatamente a Universo Cursos e Consultoria.',
  }
];

const CrachaPage: React.FC = () => {
  const [modelos, setModelos] = useState(INITIAL_MODELOS);
  const [editingModelo, setEditingModelo] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const loadPersisted = async () => {
      try {
        const persisted = await crachaService.getTemplate();
        if (persisted) {
          const merged = { ...INITIAL_MODELOS[0], ...persisted, id: 'cracha' };
          setModelos([merged]);
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

  const handleSave = async (savedModelo: any) => {
    try {
      await crachaService.saveTemplate(savedModelo);
      setModelos([savedModelo]);
      showToast('Modelo de crachá de estágio salvo com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao salvar template de crachá:', err);
      showToast('Erro ao salvar o modelo de crachá.', 'error');
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
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Crachá de Identificação de Estágio</h3>
          <p className="text-slate-500 text-sm mt-1">Configuração do modelo oficial de crachá de estágio para alunos de cursos técnicos.</p>
        </div>
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
            onDelete={undefined as any} 
          />
        ))}
      </div>

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 bg-emerald-500/95 border-emerald-400 text-white`}>
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrachaPage;
