import type React from 'react';

interface DisplayFieldProps {
  label: string;
  value?: string;
}

const ParceiroAlunoDisplayField: React.FC<DisplayFieldProps> = ({ label, value }) => (
  <div className="min-w-0 py-2">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    <span className="block text-sm leading-5 text-slate-800 break-words">{value || 'Não informado'}</span>
  </div>
);

export default ParceiroAlunoDisplayField;
