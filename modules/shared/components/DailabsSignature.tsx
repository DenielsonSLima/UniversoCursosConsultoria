import React from 'react';

interface DailabsSignatureProps {
  tone?: 'light' | 'dark';
  className?: string;
}

const DailabsSignature: React.FC<DailabsSignatureProps> = ({ tone = 'light', className = '' }) => {
  const isLight = tone === 'light';

  return (
    <div
      className={`inline-flex items-center gap-2.5 ${isLight ? 'text-white/70' : 'text-slate-500'} ${className}`}
    >
      <img
        src={isLight ? '/dailabs-light.png' : '/dailabs-dark.png'}
        alt="DAILABS"
        className="h-7 w-7 object-contain opacity-70"
      />
      <div className="leading-none">
        <p className={`text-[9px] font-black uppercase tracking-[0.22em] ${isLight ? 'text-white/75' : 'text-slate-500'}`}>
          DAILABS
        </p>
        <p className={`mt-1 text-[6.5px] font-black uppercase tracking-[0.16em] ${isLight ? 'text-blue-100/45' : 'text-slate-400'}`}>
          Creative AI & Softwares
        </p>
      </div>
    </div>
  );
};

export default DailabsSignature;
