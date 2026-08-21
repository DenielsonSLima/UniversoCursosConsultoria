import React from 'react';
import ParceiroAlunoForm from './formularioparceiros/aluno/ParceiroAlunoForm';
import ParceiroProfessorForm from './formularioparceiros/professor/ParceiroProfessorForm';
import ParceiroPFForm from './formularioparceiros/pf/ParceiroPFForm';
import ParceiroPJForm from './formularioparceiros/pj/ParceiroPJForm';

type FormType = 'aluno' | 'professor' | 'selection' | 'pf' | 'pj' | null;

interface ParceiroFormHostProps {
  showForm: FormType;
  onCancel: () => void;
  onSaveAluno: (data: any) => void;
  onSaveProfessor: (data: any) => void;
  onSavePF: (data: any) => void;
  onSavePJ: (data: any) => void;
  defaultPoloId?: string | null;
  canAssociateAllPolos?: boolean;
  onScopeError: (message: string) => void;
}

const formConfig = {
  aluno: {
    accent: 'from-blue-600 to-[#001a33]',
  },
  professor: {
    accent: 'from-purple-600 to-[#001a33]',
  },
  pf: {
    accent: 'from-amber-600 to-[#001a33]',
  },
  pj: {
    accent: 'from-slate-900 to-[#001a33]',
  },
};

const ParceiroFormHost: React.FC<ParceiroFormHostProps> = ({
  showForm,
  onCancel,
  onSaveAluno,
  onSaveProfessor,
  onSavePF,
  onSavePJ,
  defaultPoloId,
  canAssociateAllPolos = false,
  onScopeError,
}) => {
  if (!showForm || showForm === 'selection') return null;

  const config = formConfig[showForm];
  const form = (() => {
    switch (showForm) {
      case 'aluno':
        return (
          <ParceiroAlunoForm
            onCancel={onCancel}
            onSave={onSaveAluno}
            defaultPoloId={defaultPoloId}
            onScopeError={onScopeError}
          />
        );
      case 'professor':
        return <ParceiroProfessorForm onCancel={onCancel} onSave={onSaveProfessor} />;
      case 'pf':
        return (
          <ParceiroPFForm
            onCancel={onCancel}
            onSave={onSavePF}
            defaultPoloId={defaultPoloId}
            onScopeError={onScopeError}
          />
        );
      case 'pj':
        return (
          <ParceiroPJForm
            onCancel={onCancel}
            onSave={onSavePJ}
            defaultPoloId={defaultPoloId}
            canAssociateAllPolos={canAssociateAllPolos}
            onScopeError={onScopeError}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className="">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${config.accent}`} />
        {form}
      </div>
    </div>
  );
};

export default ParceiroFormHost;
