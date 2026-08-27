import { profileOperationalExample } from './banese-profile-examples';
import type {
  BanesePollingConfig,
  BanesePollingProfile,
} from './consulta-api-banese.types';

interface BaneseConsoleHeaderProps {
  environment: 'sandbox' | 'production';
  config: BanesePollingConfig;
  effective?: BanesePollingProfile;
  previousProfileId?: number | null;
}

const stateTone = (state: string) => (
  ['SUSPENDED', 'COOLDOWN'].includes(state)
    ? 'border-red-200 bg-red-50 text-red-700'
    : state === 'STABLE'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'
);

const BaneseConsoleHeader = ({
  environment,
  config,
  effective,
  previousProfileId,
}: BaneseConsoleHeaderProps) => (
  <header className="overflow-hidden rounded-[2rem] bg-[#001a33] text-white shadow-xl shadow-blue-950/10">
    <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">
            Ambiente {environment === 'production' ? 'Produção' : 'Homologação'}
          </span>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${stateTone(config.state)}`}>
            {config.state}
          </span>
        </div>
        <h2 className="mt-4 text-3xl font-black uppercase tracking-tight">Consulta API Banese</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
          Confirma pagamentos de títulos já emitidos, prioriza EAD e ajusta o ritmo com rollback automático.
          Este módulo não cria, reemite, cancela nem gera cobranças.
        </p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Anterior</p>
            <p className="mt-1 text-xl font-black text-slate-200">
              {previousProfileId ? `P${previousProfileId}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-blue-200">Teto configurado</p>
            <p className="mt-1 text-xl font-black text-blue-200">P{config.selected_profile_id}</p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-emerald-200">Efetivo agora</p>
            <p className="mt-1 text-3xl font-black text-emerald-300">P{config.effective_profile_id}</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-black text-white">
          {effective?.name} • {effective?.titles_per_minute || 0} títulos/min
        </p>
        <p className="mt-2 border-t border-white/10 pt-3 text-[11px] font-semibold leading-relaxed text-slate-300">
          Exemplo real: {profileOperationalExample(effective, 20)}
        </p>
        <p className="mt-1 text-[9px] font-bold text-slate-400">
          Estimativa de capacidade; não é prazo de compensação nem SLA do Banese.
        </p>
      </div>
    </div>
  </header>
);

export default BaneseConsoleHeader;
