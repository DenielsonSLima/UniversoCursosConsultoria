import React from 'react';
import arkhenLogo from '../../../arkhen.png';

interface ArkhenSignatureProps {
  tone?: 'light' | 'dark';
  className?: string;
}

const ArkhenSignature: React.FC<ArkhenSignatureProps> = ({ tone = 'light', className = '' }) => {
  const isLight = tone === 'light';

  return (
    <div
      className={`inline-flex items-center gap-2.5 ${isLight ? 'text-white/80' : 'text-slate-600'} ${className}`}
    >
      <img
        src={arkhenLogo}
        alt="Arkhen"
        className={`h-8 w-8 object-contain ${isLight ? 'opacity-85' : 'brightness-0 opacity-65'}`}
      />
      <div className="leading-none">
        <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isLight ? 'text-white/85' : 'text-slate-600'}`}>
          ARKHEN
        </p>
        <p className={`mt-1 text-[7px] font-bold uppercase tracking-[0.14em] ${isLight ? 'text-blue-100/55' : 'text-slate-400'}`}>
          Creative AI & Softwares
        </p>
      </div>
    </div>
  );
};

export default ArkhenSignature;
