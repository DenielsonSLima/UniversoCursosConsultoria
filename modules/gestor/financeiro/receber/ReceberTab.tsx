// File: modules/gestor/financeiro/receber/ReceberTab.tsx

import React, { useState } from 'react';
import { Award, GraduationCap, Laptop, Landmark } from 'lucide-react';
import LivresReceberTab from './livres/LivresReceberTab';
import EspecializacaoReceberTab from './especializacao/EspecializacaoReceberTab';
import EadReceberTab from './ead/EadReceberTab';
import TecnicoReceberTab from './tecnico/TecnicoReceberTab';

type CourseType = 'livres' | 'especializacao' | 'ead' | 'tecnico';

interface ReceberTabProps {
  poloId?: string | null;
}

const ReceberTab: React.FC<ReceberTabProps> = ({ poloId }) => {
  const [activeCourseTab, setActiveCourseTab] = useState<CourseType>('tecnico');

  const subtabs = [
    { id: 'tecnico' as const, label: 'Técnico', icon: <Landmark size={14} /> },
    { id: 'livres' as const, label: 'Cursos Livres', icon: <Award size={14} /> },
    { id: 'especializacao' as const, label: 'Especialização', icon: <GraduationCap size={14} /> },
    { id: 'ead' as const, label: 'EAD', icon: <Laptop size={14} /> },
  ];

  const renderSubTab = () => {
    switch (activeCourseTab) {
      case 'livres':
        return <LivresReceberTab poloId={poloId} />;
      case 'especializacao':
        return <EspecializacaoReceberTab poloId={poloId} />;
      case 'ead':
        return <EadReceberTab poloId={poloId} />;
      case 'tecnico':
        return <TecnicoReceberTab poloId={poloId} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="border-b border-slate-200 mb-4">
        <div className="flex gap-6 overflow-x-auto pb-px">
          {subtabs.map((tab) => {
            const isActive = activeCourseTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCourseTab(tab.id)}
                className={`flex items-center gap-2 pb-3 text-xs font-bold uppercase tracking-wider transition-all relative shrink-0 ${
                  isActive
                    ? 'text-[#001a33] font-extrabold'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span className={isActive ? 'text-emerald-600' : 'text-slate-400'}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {renderSubTab()}
      </div>
    </div>
  );
};

export default ReceberTab;
