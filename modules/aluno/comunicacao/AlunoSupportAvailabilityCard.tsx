import { BellRing, Clock3, Wifi, WifiOff } from 'lucide-react';
import type { AlunoAtendimentoConfig } from './comunicacao.types';

export const resolveSupportAvailability = (config?: AlunoAtendimentoConfig) => {
  if (!config) return { online: false, message: 'Consultando o atendimento do seu polo...' };
  if (config.status_modo === 'online') return { online: true, message: config.mensagem_online };
  if (config.status_modo === 'offline') return { online: false, message: config.mensagem_offline };

  const now = new Date();
  const schedule = config.horarios?.[String(now.getDay())];
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const online = Boolean(schedule?.ativo && current >= schedule.inicio && current <= schedule.fim);
  return { online, message: online ? config.mensagem_online : config.mensagem_offline };
};

export const formatAverageResponseTime = (minutes?: number) => {
  const safeMinutes = Math.max(1, minutes || 120);
  if (safeMinutes < 60) return `cerca de ${safeMinutes} min`;
  if (safeMinutes % 60 === 0) return `cerca de ${safeMinutes / 60}h`;
  return `cerca de ${Math.floor(safeMinutes / 60)}h ${safeMinutes % 60}min`;
};

interface AlunoSupportAvailabilityCardProps {
  config?: AlunoAtendimentoConfig;
  loading?: boolean;
  compact?: boolean;
}

const AlunoSupportAvailabilityCard = ({ config, loading = false, compact = false }: AlunoSupportAvailabilityCardProps) => {
  const availability = resolveSupportAvailability(config);

  return (
    <aside className={`border ${availability.online ? 'border-emerald-100 bg-emerald-50/80' : 'border-amber-100 bg-amber-50/80'} ${compact ? 'rounded-2xl p-4' : 'border-x-0 border-t-0 px-6 py-3'}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${availability.online ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {availability.online ? <Wifi size={18} /> : <WifiOff size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong className={`text-xs font-black uppercase tracking-wider ${availability.online ? 'text-emerald-800' : 'text-amber-800'}`}>
              {loading ? 'Consultando disponibilidade' : availability.online ? 'Equipe disponível' : 'Atendimento fora do horário'}
            </strong>
            {config ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <Clock3 size={12} /> Resposta média: {formatAverageResponseTime(config.tempo_medio_resposta_minutos)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">{availability.message}</p>
          {config?.solicitar_notificacao_resposta ? (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] font-bold leading-relaxed text-blue-700">
              <BellRing size={13} className="mt-0.5 shrink-0" /> {config.texto_notificacao_optin}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
};

export default AlunoSupportAvailabilityCard;
