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
  <header className="config-card overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700">
    <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr] lg:p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Ambiente {environment === 'production' ? 'Produção' : 'Homologação'}
          </span>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${stateTone(config.state)}`}>
            {config.state}
          </span>
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">Consulta API Banese</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-600">
          Confirma pagamentos de títulos já emitidos, prioriza EAD e ajusta o ritmo com rollback automático.
          Este módulo não cria, reemite, cancela nem gera cobranças.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-slate-500">Anterior</p>
            <p className="mt-1 text-xl font-black text-slate-700">
              {previousProfileId ? `P${previousProfileId}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-blue-700">Teto configurado</p>
            <p className="mt-1 text-xl font-black text-blue-700">P{config.selected_profile_id}</p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-wider text-emerald-700">Efetivo agora</p>
            <p className="mt-1 text-3xl font-black text-emerald-700">P{config.effective_profile_id}</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-black text-slate-900">
          {effective?.name} • {effective?.titles_per_minute || 0} títulos/min
        </p>
        <p className="mt-2 border-t border-slate-200 pt-3 text-[11px] font-semibold leading-relaxed text-slate-600">
          Exemplo real: {profileOperationalExample(effective, 20)}
        </p>
        <p className="mt-1 text-[9px] font-bold text-slate-500">
          Estimativa de capacidade; não é prazo de compensação nem SLA do Banese.
        </p>
      </div>
    </div>
  </header>
);

export default BaneseConsoleHeader;
