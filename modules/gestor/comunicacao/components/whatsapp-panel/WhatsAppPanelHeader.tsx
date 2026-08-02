import React from 'react';
import {
  Bot,
  Cake,
  CalendarClock,
  MessageCircle,
  Settings,
  UserCircle,
  Wallet,
} from 'lucide-react';
import { WhatsAppOpsTab } from './types';

interface WhatsAppPanelHeaderProps {
  activeTab: WhatsAppOpsTab;
  isFinancialLine: boolean;
  onTabChange: (tab: WhatsAppOpsTab) => void;
}

const tabs = [
  { id: 'conversas', label: 'Conversas', icon: MessageCircle },
  { id: 'atrasados', label: 'Atrasados', icon: Wallet },
  { id: 'automacoes', label: 'Automações atuais', icon: CalendarClock },
  { id: 'fluxos', label: 'Fluxos', icon: Bot },
  { id: 'agentes', label: 'Agentes', icon: Cake },
  { id: 'perfil', label: 'Perfil', icon: UserCircle },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
] as const;

const WhatsAppPanelHeader: React.FC<WhatsAppPanelHeaderProps> = ({
  activeTab,
  isFinancialLine,
  onTabChange,
}) => (
  <div className="shrink-0 border-b border-slate-200 bg-white px-5">
    <nav
      aria-label="Navegação da central de comunicação"
      className="flex w-fit max-w-full flex-nowrap items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.filter((item) => isFinancialLine || (item.id !== 'atrasados' && item.id !== 'automacoes')).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            aria-current={activeTab === item.id ? 'page' : undefined}
            className={`relative flex h-11 shrink-0 items-center justify-center gap-2 px-0.5 text-xs font-bold uppercase tracking-wide transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              activeTab === item.id
                ? 'text-[#001a33] after:scale-x-100 after:bg-emerald-500'
                : 'text-slate-400 after:scale-x-0 after:bg-emerald-500 hover:text-emerald-700 hover:after:scale-x-50'
            }`}
          >
            <Icon size={14} className={activeTab === item.id ? 'text-emerald-600' : undefined} />
            {item.label}
          </button>
        );
      })}
    </nav>
  </div>
);

export default WhatsAppPanelHeader;
