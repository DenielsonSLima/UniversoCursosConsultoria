
import React from 'react';
import { 
  FileCode, 
  MonitorPlay, 
  Briefcase, 
  Zap, 
  Building, 
  Award, 
  ClipboardCheck, 
  FileSignature 
} from 'lucide-react';

interface CadastrosPageProps {
  onNavigate?: (id: string) => void;
}

const CadastrosPage: React.FC<CadastrosPageProps> = ({ onNavigate }) => {
  const hubItems = [
    { id: 'cadastros-checklist', title: 'Check List Estágio', desc: 'Controle de documentos.', icon: <ClipboardCheck size={28} />, color: 'bg-teal-600' },
    { id: 'cadastros-ead', title: 'Cursos EAD', desc: 'Ambiente digital.', icon: <MonitorPlay size={28} />, color: 'bg-purple-600' },
    { id: 'cadastros-especializacao', title: 'Cursos Especialização', desc: 'Foco técnico.', icon: <Award size={28} />, color: 'bg-rose-600' },
    { id: 'cadastros-livres', title: 'Cursos Livres', desc: 'Capacitação rápida.', icon: <Zap size={28} />, color: 'bg-amber-500' },
    { id: 'cadastros-tecnicos', title: 'Cursos Técnicos', desc: 'Formação profissional.', icon: <Briefcase size={28} />, color: 'bg-emerald-600' },
    { id: 'cadastros-superior', title: 'Ensino Superior', desc: 'Graduação e Pós.', icon: <Building size={28} />, color: 'bg-blue-800' },
    { id: 'cadastros-ficha', title: 'Ficha Matrícula', icon: <FileSignature size={28} />, desc: 'Formulários de ingresso.', color: 'bg-slate-800' },
    { id: 'cadastros-modelos', title: 'Modelos Documentos', desc: 'Templates oficiais.', icon: <FileCode size={28} />, color: 'bg-slate-700' },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="mb-10">
        <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">Central de Cadastros</h2>
        <p className="text-slate-500 font-medium">Selecione o módulo para gerenciamento de dados institucionais.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {hubItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate && onNavigate(item.id)}
            className="flex flex-col items-start p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 group text-left h-full"
          >
            <div className={`p-4 rounded-2xl ${item.color} text-white mb-4 shadow-md group-hover:scale-110 transition-transform`}>
              {item.icon}
            </div>
            <h3 className="text-lg font-bold text-[#001a33] mb-1 group-hover:text-blue-600 transition-colors">
              {item.title}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {item.desc}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CadastrosPage;
