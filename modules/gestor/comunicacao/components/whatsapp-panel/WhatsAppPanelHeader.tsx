import React from 'react';
import {
  CalendarClock,
  Bot,
  Cake,
  MessageCircle,
  Settings,
  UserCircle,
  Wallet,
} from 'lucide-react';
import { WhatsAppOpsTab } from './types';

interface WhatsAppPanelHeaderProps {
  activeTab: WhatsAppOpsTab;
  onTabChange: (tab: WhatsAppOpsTab) => void;
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
  onTabChange,
}) => (
  <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-3">
    <nav
      aria-label="Navegação do WhatsApp"
      className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex min-h-[38px] shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wide transition-all xl:flex-1 2xl:px-4 ${
              activeTab === item.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'
            }`}
          >
            <Icon size={14} />
            {item.label}
          </button>
        );
      })}
    </nav>
  </div>
);

export default WhatsAppPanelHeader;
