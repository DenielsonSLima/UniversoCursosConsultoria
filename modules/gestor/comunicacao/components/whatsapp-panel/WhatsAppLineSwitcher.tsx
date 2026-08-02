import React from 'react';
import { CheckCircle2, CircleDashed, Phone } from 'lucide-react';
import {
  isWhatsAppConnectionReady,
  WhatsAppConexao,
} from '../whatsapp/whatsapp.types';

const institutionTone: Record<string, string> = {
  universo: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  anhanguera: 'border-blue-200 bg-blue-50 text-blue-900',
  unopar: 'border-violet-200 bg-violet-50 text-violet-900',
};

interface WhatsAppLineSwitcherProps {
  connections: WhatsAppConexao[];
  activeConnectionId: string | null;
  loading: boolean;
  onChange: (connectionId: string) => void;
}

const WhatsAppLineSwitcher: React.FC<WhatsAppLineSwitcherProps> = ({
  connections,
  activeConnectionId,
  loading,
  onChange,
}) => (
  <div
    role="tablist"
    aria-label="Alternar número do WhatsApp"
    className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {loading ? (
      <div className="flex h-11 items-center gap-2 rounded-xl bg-slate-50 px-4 text-xs font-bold text-slate-400">
        <CircleDashed size={14} className="animate-spin" />
        Carregando linhas...
      </div>
    ) : connections.map((connection) => {
      const active = connection.id === activeConnectionId;
      const ready = isWhatsAppConnectionReady(connection);
      return (
        <button
          key={connection.id}
          type="button"
          role="tab"
          aria-selected={active}
          title={`${connection.nome} — ${connection.telefone || 'número ainda não informado'}`}
          onClick={() => onChange(connection.id)}
          className={`group shrink-0 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
            active
              ? `min-w-[260px] px-3.5 py-2 ${institutionTone[connection.instituicao] || institutionTone.universo} shadow-sm`
              : 'h-10 px-3 border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-800'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${
              ready ? 'bg-emerald-500' : 'bg-amber-400'
            }`} />
            <span className="min-w-0">
              <span className={`block truncate font-black tracking-tight ${
                active ? 'text-sm' : 'text-xs uppercase tracking-wide'
              }`}>
                {connection.nome}
              </span>
              {active ? (
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] font-semibold opacity-65">
                  <Phone size={11} />
                  {connection.telefone || 'Número pendente'} · configuração própria deste número
                </span>
              ) : null}
            </span>
            {active ? (
              ready
                ? <CheckCircle2 size={15} className="ml-auto shrink-0 text-emerald-600" />
                : <CircleDashed size={15} className="ml-auto shrink-0 text-amber-500" />
            ) : null}
          </span>
        </button>
      );
    })}
  </div>
);

export default WhatsAppLineSwitcher;
