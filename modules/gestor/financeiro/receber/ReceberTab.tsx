// File: modules/gestor/financeiro/receber/ReceberTab.tsx

import React, { useEffect, useState } from 'react';
import { Award, GraduationCap, Laptop, Landmark } from 'lucide-react';
import LivresReceberTab from './livres/LivresReceberTab';
import EspecializacaoReceberTab from './especializacao/EspecializacaoReceberTab';
import EadReceberTab from './ead/EadReceberTab';
import TecnicoReceberTab from './tecnico/TecnicoReceberTab';
import FinancialUnderlineTabs from '../components/FinancialUnderlineTabs';

type CourseType = 'livres' | 'especializacao' | 'ead' | 'tecnico';

interface ReceberTabProps {
  poloId?: string | null;
  isMatriz: boolean;
}

const ReceberTab: React.FC<ReceberTabProps> = ({ poloId, isMatriz }) => {
  const [activeCourseTab, setActiveCourseTab] = useState<CourseType>('tecnico');

  useEffect(() => {
    if (!isMatriz && activeCourseTab === 'ead') {
      setActiveCourseTab('tecnico');
    }
  }, [activeCourseTab, isMatriz]);

  const subtabs: Array<{ id: CourseType; label: string; icon: React.ReactNode }> = [
    { id: 'tecnico' as const, label: 'Técnico', icon: <Landmark size={14} /> },
    { id: 'livres' as const, label: 'Cursos Livres', icon: <Award size={14} /> },
    { id: 'especializacao' as const, label: 'Especialização', icon: <GraduationCap size={14} /> },
    ...(isMatriz ? [{ id: 'ead' as const, label: 'EAD', icon: <Laptop size={14} /> }] : []),
  ];

  const renderSubTab = () => {
    switch (activeCourseTab) {
      case 'livres':
        return <LivresReceberTab poloId={poloId} />;
      case 'especializacao':
        return <EspecializacaoReceberTab poloId={poloId} />;
      case 'ead':
        return isMatriz ? <EadReceberTab poloId={poloId} /> : null;
      case 'tecnico':
        return <TecnicoReceberTab poloId={poloId} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="mb-4">
        <FinancialUnderlineTabs
          items={subtabs}
          value={activeCourseTab}
          onChange={setActiveCourseTab}
          ariaLabel="Modalidades das contas a receber"
          indicatorClassName="bg-emerald-600"
          activeIconClassName="text-emerald-600"
        />
      </div>

      <div className="mt-4">
        {renderSubTab()}
      </div>
    </div>
  );
};

export default ReceberTab;
