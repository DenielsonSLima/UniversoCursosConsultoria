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
import { GESTOR_CADASTRO_NAVIGATION } from '../gestor-navigation.config';
import './formacoes-hub.css';

interface CadastrosPageProps {
  onNavigate?: (id: string) => void;
  readOnly?: boolean;
  allowedTabs?: string[];
}

const CadastrosPage: React.FC<CadastrosPageProps> = ({ onNavigate, readOnly = false, allowedTabs }) => {
  const hubItemDetails = {
    'cadastros-tecnicos': { desc: 'Formação profissional.', icon: <Briefcase size={28} />, color: 'bg-emerald-600' },
    'cadastros-livres': { desc: 'Capacitação rápida.', icon: <Zap size={28} />, color: 'bg-amber-500' },
    'cadastros-especializacao': { desc: 'Foco técnico.', icon: <Award size={28} />, color: 'bg-rose-600' },
    'cadastros-ead': { desc: 'Ambiente digital.', icon: <MonitorPlay size={28} />, color: 'bg-purple-600' },
    'cadastros-superior': { desc: 'Graduação e Pós.', icon: <Building size={28} />, color: 'bg-blue-800' },
    'cadastros-ficha': { desc: 'Modelos cadastrais do aluno.', icon: <FileSignature size={28} />, color: 'bg-slate-800' },
    'cadastros-checklist': { desc: 'Controle de documentos.', icon: <ClipboardCheck size={28} />, color: 'bg-teal-600' },
    'cadastros-modelos': { desc: 'Templates oficiais.', icon: <FileCode size={28} />, color: 'bg-slate-700' },
  };
  const hubItems = GESTOR_CADASTRO_NAVIGATION.map(item => ({
    ...item,
    title: item.label,
    ...hubItemDetails[item.id],
  }));

  const visibleItems = (readOnly
    ? hubItems.filter(item => ['cadastros-especializacao', 'cadastros-livres', 'cadastros-superior'].includes(item.id))
    : hubItems
  ).filter(item => !allowedTabs || allowedTabs.includes(item.id));

  return (
    <div className="formacoes-hub">
      <div className="formacoes-hub__header">
        <h2 className="formacoes-hub__title">Central de Formações</h2>
        <p className="formacoes-hub__description">
          {readOnly
            ? 'Consulte os cursos disponíveis para esta unidade. Alterações são realizadas exclusivamente pela Matriz.'
            : 'Selecione uma formação ou recurso institucional para gerenciar.'}
        </p>
      </div>

      <div className="formacoes-hub__grid">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate && onNavigate(item.id)}
            className="formacoes-hub__item"
          >
            <div className="formacoes-hub__icon">
              {item.icon}
            </div>
            <div className="formacoes-hub__copy">
            <h3 className="formacoes-hub__item-title">
              {item.title}
            </h3>
            <p className="formacoes-hub__item-description">
              {item.desc}
            </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CadastrosPage;
