
// File: modules/gestor/parceiros/components/ParceirosKpis.tsx

import React from 'react';
import TotalParceirosKpi from './kpis/TotalParceirosKpi';
import AlunosKpi from './kpis/AlunosKpi';
import ProfessoresKpi from './kpis/ProfessoresKpi';

interface ParceirosKpisProps {
  totalParceiros: number;
  totalAlunosVinculados: number;
  totalProfessoresVinculados: number;
}

const ParceirosKpis: React.FC<ParceirosKpisProps> = ({ 
  totalParceiros, 
  totalAlunosVinculados, 
  totalProfessoresVinculados 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <TotalParceirosKpi total={totalParceiros} />
      <AlunosKpi total={totalAlunosVinculados} ativos={totalAlunosVinculados} inativos={0} />
      <ProfessoresKpi total={totalProfessoresVinculados} ativos={totalProfessoresVinculados} inativos={0} />
    </div>
  );
};

export default ParceirosKpis;
