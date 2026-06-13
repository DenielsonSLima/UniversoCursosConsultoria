
// File: modules/gestor/parceiros/components/ParceirosKpis.tsx

import React from 'react';
import TotalParceirosKpi from './kpis/TotalParceirosKpi';
import AlunosKpi from './kpis/AlunosKpi';
import ProfessoresKpi from './kpis/ProfessoresKpi';

interface ParceirosKpisProps {
  totalParceiros: number;
  totalParceirosAtivos: number;
  totalAlunos: number;
  totalAlunosAtivos: number;
  totalAlunosInativos: number;
  totalProfessores: number;
  totalProfessoresAtivos: number;
  totalProfessoresInativos: number;
}

const ParceirosKpis: React.FC<ParceirosKpisProps> = ({ 
  totalParceiros, 
  totalParceirosAtivos,
  totalAlunos, 
  totalAlunosAtivos,
  totalAlunosInativos,
  totalProfessores, 
  totalProfessoresAtivos,
  totalProfessoresInativos 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <TotalParceirosKpi total={totalParceiros} ativos={totalParceirosAtivos} />
      <AlunosKpi total={totalAlunos} ativos={totalAlunosAtivos} inativos={totalAlunosInativos} />
      <ProfessoresKpi total={totalProfessores} ativos={totalProfessoresAtivos} inativos={totalProfessoresInativos} />
    </div>
  );
};

export default ParceirosKpis;
