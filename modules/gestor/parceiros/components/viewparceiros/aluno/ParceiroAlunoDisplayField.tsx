import type React from 'react';

interface DisplayFieldProps {
  label: string;
  value?: string;
}

const ParceiroAlunoDisplayField: React.FC<DisplayFieldProps> = ({ label, value }) => (
  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
    <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</span>
    <span className="block text-slate-800 font-medium">{value || '-'}</span>
  </div>
);

export default ParceiroAlunoDisplayField;
