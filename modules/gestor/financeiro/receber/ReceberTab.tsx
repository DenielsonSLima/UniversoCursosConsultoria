// File: modules/gestor/financeiro/receber/ReceberTab.tsx

import React, { useState } from 'react';
import { Award, GraduationCap, Laptop, Landmark } from 'lucide-react';
import LivresReceberTab from './livres/LivresReceberTab';
import EspecializacaoReceberTab from './especializacao/EspecializacaoReceberTab';
import EadReceberTab from './ead/EadReceberTab';
import TecnicoReceberTab from './tecnico/TecnicoReceberTab';

type CourseType = 'livres' | 'especializacao' | 'ead' | 'tecnico';

const ReceberTab: React.FC = () => {
  const [activeCourseTab, setActiveCourseTab] = useState<CourseType>('tecnico');

  const subtabs = [
    { id: 'livres' as const, label: 'Cursos Livres', icon: <Award size={14} /> },
    { id: 'especializacao' as const, label: 'Especialização', icon: <GraduationCap size={14} /> },
    { id: 'ead' as const, label: 'EAD', icon: <Laptop size={14} /> },
    { id: 'tecnico' as const, label: 'Técnico', icon: <Landmark size={14} /> },
  ];

  const renderSubTab = () => {
    switch (activeCourseTab) {
      case 'livres':
        return <LivresReceberTab />;
      case 'especializacao':
        return <EspecializacaoReceberTab />;
      case 'ead':
        return <EadReceberTab />;
      case 'tecnico':
        return <TecnicoReceberTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCourseTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
              activeCourseTab === tab.id
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'text-slate-500 hover:bg-slate-50 border-transparent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {renderSubTab()}
      </div>
    </div>
  );
};

export default ReceberTab;
