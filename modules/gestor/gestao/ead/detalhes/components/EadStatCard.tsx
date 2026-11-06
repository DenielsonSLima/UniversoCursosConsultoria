import React from 'react';

const EadStatCard = ({ label, value, icon, tone = 'slate' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'slate' | 'purple' | 'emerald' | 'amber' | 'blue' }) => {
  const tones = {
    slate: 'text-slate-500',
    purple: 'text-slate-500',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };

  return (
    <div className="turma-summary-metric">
      <p className="turma-summary-metric-label">
        <span className={tones[tone]}>{icon}</span>
        {label}
      </p>
      <p className="turma-summary-metric-value">{value}</p>
    </div>
  );
};

export default EadStatCard;
