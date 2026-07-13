import React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Bot,
  Cake,
  MessageCircle,
  Send,
  Settings,
  UserCircle,
  Wallet,
} from 'lucide-react';
import { WhatsAppOpsTab } from './types';

interface WhatsAppPanelHeaderProps {
  activeTab: WhatsAppOpsTab;
  apiReady: boolean;
  onTabChange: (tab: WhatsAppOpsTab) => void;
  onOpenStartModal: () => void;
}

const tabs = [
  { id: 'conversas', label: 'Conversas', icon: MessageCircle },
  { id: 'atrasados', label: 'Atrasados', icon: Wallet },
  { id: 'automacoes', label: 'Automações', icon: CalendarClock },
  { id: 'fluxos', label: 'Fluxos', icon: Bot },
  { id: 'agentes', label: 'Agentes', icon: Cake },
  { id: 'perfil', label: 'Perfil', icon: UserCircle },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
] as const;

const WhatsAppPanelHeader: React.FC<WhatsAppPanelHeaderProps> = ({
  activeTab,
  apiReady,
  onTabChange,
  onOpenStartModal,
}) => (
  <div className="flex min-h-[64px] flex-col gap-3 border-b border-slate-100 bg-white px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
    <div className="flex w-full flex-wrap gap-1 rounded-2xl bg-slate-50 p-1 xl:w-auto">
      {tabs.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex min-h-[38px] shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wide transition-all 2xl:px-4 ${
              activeTab === item.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
            }`}
          >
            <Icon size={14} />
            {item.label}
          </button>
        );
      })}
    </div>

    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className={`inline-flex min-h-[34px] items-center gap-2 rounded-xl px-3 text-xs font-bold ${
        apiReady ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
      }`}>
        {apiReady ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
        {apiReady ? 'API configurada' : 'Aguardando API'}
      </span>
      <button
        onClick={onOpenStartModal}
        className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        <Send size={14} />
        Iniciar conversa
      </button>
    </div>
  </div>
);

export default WhatsAppPanelHeader;
