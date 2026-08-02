import React, { useEffect, useState } from 'react';
import { Inbox, MessageCircle, MessagesSquare, Radio } from 'lucide-react';
import type { PortalAuthProfile } from '../../login/portal-session';
import ComunicacaoPage from './ComunicacaoPage';

interface UnifiedCommunicationPageProps {
  gestorProfile: PortalAuthProfile;
  canAccessInternal: boolean;
  canAccessWhatsApp: boolean;
}

type InboxChannel = 'app' | 'whatsapp';

const UnifiedCommunicationPage: React.FC<UnifiedCommunicationPageProps> = ({
  gestorProfile,
  canAccessInternal,
  canAccessWhatsApp,
}) => {
  const firstChannel: InboxChannel = canAccessInternal ? 'app' : 'whatsapp';
  const [channel, setChannel] = useState<InboxChannel>(firstChannel);

  useEffect(() => {
    if (channel === 'app' && !canAccessInternal && canAccessWhatsApp) {
      setChannel('whatsapp');
      return;
    }
    if (channel === 'whatsapp' && !canAccessWhatsApp && canAccessInternal) {
      setChannel('app');
    }
  }, [canAccessInternal, canAccessWhatsApp, channel]);

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm animate-fadeIn">
      <header className="relative shrink-0 overflow-hidden border-b border-[#173756] bg-[#001a33] px-5 py-5 text-white sm:px-7">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_0%,rgba(47,108,255,.7),transparent_35%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,28px_28px,28px_28px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-950/30"><MessagesSquare size={21} /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-black tracking-tight sm:text-2xl">Central de Atendimento</h1><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20"><Radio size={10} /> Em tempo real</span></div>
              <p className="mt-1 text-xs font-medium text-slate-300">Um único acesso para acompanhar conversas do portal e do WhatsApp.</p>
            </div>
          </div>

          <div className="grid min-w-[280px] grid-cols-2 rounded-2xl bg-white/10 p-1 ring-1 ring-inset ring-white/15" role="tablist" aria-label="Canal de atendimento">
            <button type="button" role="tab" aria-selected={channel === 'app'} disabled={!canAccessInternal} onClick={() => setChannel('app')} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-40 ${channel === 'app' ? 'bg-white text-blue-700 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Inbox size={15} /> Portal e app</button>
            <button type="button" role="tab" aria-selected={channel === 'whatsapp'} disabled={!canAccessWhatsApp} onClick={() => setChannel('whatsapp')} className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-40 ${channel === 'whatsapp' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><MessageCircle size={15} /> WhatsApp</button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1" role="tabpanel">
        {channel === 'app' ? (
          <ComunicacaoPage gestorProfile={gestorProfile} channel="mensagem" embedded />
        ) : (
          <ComunicacaoPage gestorProfile={gestorProfile} channel="whatsapp" embedded whatsappInitialTab="conversas" showWhatsAppModuleTabs={false} />
        )}
      </div>
    </div>
  );
};

export default UnifiedCommunicationPage;
