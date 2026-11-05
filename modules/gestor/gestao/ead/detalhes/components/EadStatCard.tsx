import React from 'react';

const EadStatCard = ({ label, value, icon, tone = 'slate' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'slate' | 'purple' | 'emerald' | 'amber' | 'blue' }) => {
  const tones = {
    slate: 'bg-white border-slate-200 text-slate-500',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-black text-[#001a33]">{value}</p>
    </div>
  );
};

export default EadStatCard;
