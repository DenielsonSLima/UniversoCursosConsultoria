
import React, { useState } from 'react';
import { Award, Save, Plus } from 'lucide-react';
import DiplomaCard from './components/DiplomaCard';
import DiplomaEditor from './components/DiplomaEditor';

const INITIAL_MODELOS = [
  {
    id: '1',
    nome: 'Diploma - Ensino Superior',
    tipoCurso: 'Ensino Superior',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'MARCA D\'ÁGUA PADRÃO',
    hasValidationQrCode: true,
    textoFrente: 'A Direção da Instituição, no uso de suas atribuições regimentais, confere o presente certificado a <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, por haver concluído em {{data_conclusao}} o curso de Ensino Superior em <strong>{{curso_nome}}</strong>, com carga horária total de {{carga_horaria}} horas.',
    textoVerso: 'Conteúdo Programático:\n\n{{grade_curricular}}\n\nRegistro Acadêmico:\n{{livro_registro}}',
  },
  {
    id: '2',
    nome: 'Certificado Express - Cursos Livres',
    tipoCurso: 'Cursos Livres',
    status: 'ativo',
    hasVerso: false,
    hasWatermark: false,
    watermarkText: '',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos que {{nome_aluno}} concluiu brilhantemente o curso livre de {{curso_nome}} com carga horária de {{carga_horaria}} horas. Parabéns pelo desempenho!',
    textoVerso: '',
  },
  {
    id: '3',
    nome: 'Diploma - Curso Técnico',
    tipoCurso: 'Cursos Técnicos',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'DOCUMENTO OFICIAL',
    hasValidationQrCode: true,
    textoFrente: 'Certificamos para os devidos fins que <strong>{{nome_aluno}}</strong>, portador do CPF {{cpf}}, concluiu com êxito o curso de formação de Técnico em <strong>{{curso_nome}}</strong>, perfazendo um total de {{carga_horaria}} horas-aula, possuindo as competências profissionais requeridas.',
    textoVerso: 'Grade Curricular do Curso Técnico:\n\n{{grade_curricular}}\n\nRegistro Acadêmico:\n{{livro_registro}}',
  },
  {
    id: '4',
    nome: 'Certificado - EAD',
    tipoCurso: 'Educação a Distância (EAD)',
    status: 'ativo',
    hasVerso: true,
    hasWatermark: true,
    watermarkText: 'EAD INSTITUCIONAL',
    hasValidationQrCode: true,
    textoFrente: 'Confere-se o presente certificado a <strong>{{nome_aluno}}</strong> (CPF: {{cpf}}) por concluir o curso na modalidade de Educação a Distância (EAD) em <strong>{{curso_nome}}</strong>, com carga horária de {{carga_horaria}} horas, em {{data_conclusao}}.',
    textoVerso: 'Atividades e Módulos (EAD):\n\n{{grade_curricular}}\n\nCódigo de Autenticidade:\n{{livro_registro}}',
  }
];

const DiplomaPage: React.FC = () => {
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
