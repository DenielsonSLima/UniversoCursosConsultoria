import React, { useEffect, useState } from 'react';
import { Building } from 'lucide-react';

export const Field: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-semibold text-[#001a33] ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-slate-300 italic font-normal">Não informado</span>}
    </p>
  </div>
);

export const PartnerLogo: React.FC<{
  src?: string | null;
  alt: string;
  className: string;
  iconSize?: number;
}> = ({ src, alt, className, iconSize = 24 }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} flex items-center justify-center text-slate-400`}>
      <Building size={iconSize} />
    </div>
  );
};

export const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
export const labelCls = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5';

