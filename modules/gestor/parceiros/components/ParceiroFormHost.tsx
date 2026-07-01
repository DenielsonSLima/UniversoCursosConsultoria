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
}

const formConfig = {
  aluno: {
    accent: 'from-blue-600 to-[#001a33]',
    Component: ParceiroAlunoForm,
  },
  professor: {
    accent: 'from-purple-600 to-[#001a33]',
    Component: ParceiroProfessorForm,
  },
  pf: {
    accent: 'from-amber-600 to-[#001a33]',
    Component: ParceiroPFForm,
  },
  pj: {
    accent: 'from-slate-900 to-[#001a33]',
    Component: ParceiroPJForm,
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
}) => {
  if (!showForm || showForm === 'selection') return null;

  const config = formConfig[showForm];
  const saveByType = {
    aluno: onSaveAluno,
    professor: onSaveProfessor,
    pf: onSavePF,
    pj: onSavePJ,
  };
  const FormComponent = config.Component;

  return (
    <div className="animate-fadeIn">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${config.accent}`} />
        <FormComponent
          onCancel={onCancel}
          onSave={saveByType[showForm]}
          defaultPoloId={showForm === 'aluno' ? defaultPoloId : undefined}
        />
      </div>
    </div>
  );
};

export default ParceiroFormHost;
