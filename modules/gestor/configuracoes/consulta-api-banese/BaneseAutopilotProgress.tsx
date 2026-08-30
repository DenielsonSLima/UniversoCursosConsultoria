import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import { formatBaneseDateTime } from './banese-display';
import type {
  BanesePollingConfig,
  BanesePollingDashboard,
} from './consulta-api-banese.types';

interface BaneseAutopilotProgressProps {
  config: Pick<BanesePollingConfig, 'state' | 'cooldown_until'>;
  autopilot: NonNullable<BanesePollingDashboard['autopilot']>;
}

const progressPercent = (value: number, required: number) => (
  required > 0 ? Math.min(100, Math.max(0, (value / required) * 100)) : 0
);

const BaneseAutopilotProgress = ({
  config,
  autopilot,
}: BaneseAutopilotProgressProps) => {
  const cooldownUntil = config.cooldown_until || null;
  const cooldownUntilMs = cooldownUntil ? Date.parse(cooldownUntil) : Number.NaN;
  const cooldownActive = config.state === 'COOLDOWN'
    && Number.isFinite(cooldownUntilMs)
    && cooldownUntilMs > Date.now();

  if (cooldownActive) {
    return (
      <section
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-black uppercase tracking-wider text-amber-700">
              Resfriamento automático • P{autopilot.currentProfileId}
            </p>
            <h3 className="mt-2 text-xl font-black">Consultas temporariamente pausadas</h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed">
              Nenhum novo título é reservado durante este período. A contagem de 60 minutos estáveis
              recomeça do zero na retomada da escada automática P3 → P6; depois disso, o perfil ainda precisa reunir
              {' '}{autopilot.requiredTitles} consultas reais sem erro para avançar.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-black text-amber-800">
            <Clock3 aria-hidden="true" size={16} />
            Resfriamento até
            <time dateTime={cooldownUntil || undefined}>{formatBaneseDateTime(cooldownUntil)}</time>
          </span>
        </div>
      </section>
    );
  }

  const validTitlePercent = progressPercent(autopilot.validTitles, autopilot.requiredTitles);
  const stablePercent = progressPercent(autopilot.stableSeconds, autopilot.requiredSeconds);
  const stableMinutes = Math.min(60, Math.floor(autopilot.stableSeconds / 60));

  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5 text-violet-950">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-black uppercase tracking-wider text-violet-700">
            Progresso automático P{autopilot.currentProfileId} → P{autopilot.nextProfileId || autopilot.currentProfileId}
          </p>
          <h3 className="mt-2 text-xl font-black">
            {autopilot.nextProfileId
              ? `${autopilot.validTitles} de ${autopilot.requiredTitles} títulos válidos`
              : 'Teto automático P6 alcançado'}
          </h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed">
            {autopilot.nextProfileId
              ? `O avanço do P${autopilot.currentProfileId} exige duas condições ao mesmo tempo: ${autopilot.requiredTitles} consultas reais de títulos sem erro e 1 hora de estabilidade. Execuções com fila vazia não contam.`
              : 'O perfil efetivo já está no P6, teto da escada automática conservadora.'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-2 font-black ${
          autopilot.eligibleToPromote ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-violet-800'
        }`}>
          {stableMinutes}/60 min estáveis
        </span>
      </div>
      {autopilot.nextProfileId ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div
            role="progressbar"
            aria-label="Progresso de títulos válidos"
            aria-valuemin={0}
            aria-valuemax={autopilot.requiredTitles}
            aria-valuenow={Math.min(autopilot.validTitles, autopilot.requiredTitles)}
            className="h-2 overflow-hidden rounded-full bg-white"
          >
            <div className="h-full rounded-full bg-violet-600" style={{ width: `${validTitlePercent}%` }} />
          </div>
          <div
            role="progressbar"
            aria-label="Progresso do período estável"
            aria-valuemin={0}
            aria-valuemax={autopilot.requiredSeconds}
            aria-valuenow={Math.min(autopilot.stableSeconds, autopilot.requiredSeconds)}
            className="h-2 overflow-hidden rounded-full bg-white"
          >
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stablePercent}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default BaneseAutopilotProgress;
