
// File: modules/gestor/parceiros/components/ParceirosKpis.tsx

import React from 'react';
import { Building2, GraduationCap, Users } from 'lucide-react';

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
  const metrics = [
    { label: 'Total de Parceiros', total: totalParceiros, ativos: totalParceirosAtivos, inativos: null, icon: Building2 },
    { label: 'Cadastros de alunos', total: totalAlunos, ativos: totalAlunosAtivos, inativos: totalAlunosInativos, icon: GraduationCap },
    { label: 'Professores', total: totalProfessores, ativos: totalProfessoresAtivos, inativos: totalProfessoresInativos, icon: Users },
  ];

  return (
    <section aria-label="Indicadores de parceiros" className="partner-metrics">
      {metrics.map(({ label, total, ativos, inativos, icon: Icon }) => (
        <div key={label} className="partner-metric">
          <p className="partner-metric-label"><Icon size={15} strokeWidth={1.65} aria-hidden="true" />{label}</p>
          <div className="partner-metric-values">
            <strong>{total}</strong>
            <div className="partner-metric-status">
              <span className="text-emerald-700">{ativos} Ativos</span>
              {inativos !== null && <span className="text-slate-500">{inativos} Inativos</span>}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
};

export default ParceirosKpis;
