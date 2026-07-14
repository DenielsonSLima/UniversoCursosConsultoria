import React from 'react';

const Field = ({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) => (
  <label className="space-y-2">
    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
      <Icon size={14} />
      {label}
    </span>
    {children}
  </label>
);

export default Field;
