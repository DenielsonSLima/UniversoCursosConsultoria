import React, { useState } from 'react';
import MultichannelAutomationsPanel from './MultichannelAutomationsPanel';
import LegacyWhatsAppAutomationsPanel from './LegacyWhatsAppAutomationsPanel';

interface AutomacoesMulticanalPageProps {
  canAccessLegacyWhatsApp: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

const AutomacoesMulticanalPage: React.FC<AutomacoesMulticanalPageProps> = ({ canAccessLegacyWhatsApp, onDirtyChange }) => {
  const [view, setView] = useState<'central' | 'legacy-whatsapp'>('central');

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm animate-fadeIn">
      {view === 'central' ? (
        <MultichannelAutomationsPanel onOpenLegacyWhatsApp={canAccessLegacyWhatsApp ? () => setView('legacy-whatsapp') : undefined} onDirtyChange={onDirtyChange} />
      ) : (
        canAccessLegacyWhatsApp ? <LegacyWhatsAppAutomationsPanel onBack={() => setView('central')} /> : <MultichannelAutomationsPanel onDirtyChange={onDirtyChange} />
      )}
    </div>
  );
};

export default AutomacoesMulticanalPage;
