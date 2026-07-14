import type { ReactNode } from 'react';
import systemVersion from '../../../internal/versioning/system-version.json';

interface VersionedPortalProps {
  children: ReactNode;
}

const publicVersion = systemVersion.version.split('-')[0];

const VersionedPortal = ({ children }: VersionedPortalProps) => (
  <>
    {children}
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-20 print:hidden"
      aria-label={`Versão do sistema: ${systemVersion.version}`}
      title={`Sistema ${systemVersion.version} — ${systemVersion.summary}`}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/70 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm backdrop-blur-md">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
        {systemVersion.display} · v{publicVersion}
      </span>
    </div>
  </>
);

export default VersionedPortal;
