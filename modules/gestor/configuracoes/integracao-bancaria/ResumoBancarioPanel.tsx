import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Landmark,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  METHODS,
  MODALIDADES,
  PROVIDER_BRANDS,
  credentialReadyForRoute,
  environmentLabel,
  modalidadeLabel,
} from './integracao-bancaria.constants';
import {
  EnvironmentBadge,
  MethodBadge,
  PaymentMethodImage,
  ProviderLogo,
  StatusPill,
} from './integracao-bancaria.ui';
import {
  GatewayCredential,
  GatewayEnvironment,
  GatewayModalidade,
  GatewayOverview,
  GatewayPaymentMethod,
  GatewayProvider,
  GatewayProviderCode,
} from './integracao-bancaria.service';

interface ResumoBancarioPanelProps {
  overview?: GatewayOverview;
  providers: GatewayProvider[];
  routeEnvironment: GatewayEnvironment;
  getCredential: (providerCode: GatewayProviderCode, environment: GatewayEnvironment) => GatewayCredential | undefined;
  onSelectRoute: (
    modalidade: GatewayModalidade,
    method: GatewayPaymentMethod,
    environment: GatewayEnvironment,
    providerCode?: GatewayProviderCode,
  ) => void;
}

const routeFor = (
  overview: GatewayOverview | undefined,
  modalidade: GatewayModalidade,
  method: GatewayPaymentMethod,
  environment: GatewayEnvironment,
) => overview?.routes.find(
  (routeItem) => routeItem.modalidade === modalidade
  && routeItem.paymentMethod === method
  && routeItem.environment === environment,
);

const routeForDisplay = (
  overview: GatewayOverview | undefined,
  modalidade: GatewayModalidade,
  method: GatewayPaymentMethod,
  environment: GatewayEnvironment,
) => {
  const exact = routeFor(overview, modalidade, method, environment);
  if (exact?.enabled === true) return exact;

  const fallback = (overview?.routes || []).find(
    (routeItem) =>
      routeItem.modalidade === modalidade
      && routeItem.paymentMethod === method
      && routeItem.enabled === true
      && routeItem.environment !== environment,
  );

  return fallback || exact;
};

const SummaryStat = ({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'blue';
}) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-white/85 shadow-sm">
        <Icon size={18} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black uppercase tracking-tight">{value}</p>
    </div>
  );
};

const ResumoBancarioPanel: React.FC<ResumoBancarioPanelProps> = ({
  overview,
  providers,
  routeEnvironment,
  getCredential,
  onSelectRoute,
}) => {
  const summaryRoutes = MODALIDADES.flatMap((modalidade) =>
    METHODS.map((method) => {
      const route = routeForDisplay(
        overview,
        modalidade.value,
        method.value,
        routeEnvironment,
      );
      const provider = providers.find((item) => item.code === route?.providerCode);
      const credential = route?.providerCode
        ? getCredential(route.providerCode, route.environment || routeEnvironment)
        : undefined;
      const credentialReady = credentialReadyForRoute(route?.providerCode, credential, method.value);
      return { modalidade, method, route, provider, credentialReady };
    }),
  );
  const activeCount = summaryRoutes.filter((item) => item.route?.enabled === true).length;
  const missingCredentialCount = summaryRoutes.filter(
    (item) => item.route?.enabled === true && !item.credentialReady,
  ).length;
  const providerCount = new Set(summaryRoutes.map((item) => item.route?.providerCode).filter(Boolean)).size;
  const environmentConfig = ENVIRONMENTS.find((item) => item.value === routeEnvironment);
  const totalRoutes = MODALIDADES.length * METHODS.length;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <Gauge size={14} />
              Painel de conferência atual
            </p>
            <h4 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
              Resumo das rotas bancárias
            </h4>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              Visão geral do ambiente que o sistema está usando agora.
            </p>
          </div>

          <EnvironmentBadge environment={routeEnvironment} />
        </div>

        <div className={`mt-4 rounded-lg border p-4 ${environmentConfig?.banner}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/80 shadow-sm">
                {routeEnvironment === 'production' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest">Ambiente atual do sistema</p>
                <h4 className="mt-1 text-xl font-black uppercase tracking-tight">
                  {environmentConfig?.headline || environmentLabel(routeEnvironment)}
                </h4>
                <p className="mt-1 text-xs font-bold leading-relaxed opacity-80">
                  Todas as rotas abaixo são do ambiente atualmente usado nas cobranças.
                </p>
              </div>
            </div>
            <span className="rounded-md bg-white/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm">
              Pix · Boleto · Cartão
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          icon={routeEnvironment === 'production' ? ShieldCheck : AlertTriangle}
          label="Ambiente"
          value={environmentConfig?.headline || environmentLabel(routeEnvironment)}
          tone={routeEnvironment === 'production' ? 'emerald' : 'amber'}
        />
        <SummaryStat
          icon={CheckCircle2}
          label="Rotas ativas"
          value={`${activeCount}/${totalRoutes}`}
          tone="emerald"
        />
        <SummaryStat
          icon={AlertTriangle}
          label="Sem chave"
          value={`${missingCredentialCount}`}
          tone={missingCredentialCount > 0 ? 'amber' : 'blue'}
        />
        <SummaryStat
          icon={Landmark}
          label="Bancos usados"
          value={`${providerCount || 0}`}
          tone="slate"
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-2">
        {MODALIDADES.map((modalidade) => {
          const modalidadeRoutes = METHODS.map((method) => {
            const route = routeForDisplay(
              overview,
              modalidade.value,
              method.value,
              routeEnvironment,
            );
            const provider = providers.find((item) => item.code === route?.providerCode);
            const routeEnvironmentForMethod = route?.environment || routeEnvironment;
            const credential = route?.providerCode
              ? getCredential(route.providerCode, routeEnvironmentForMethod)
              : undefined;
            const credentialReady = credentialReadyForRoute(route?.providerCode, credential, method.value);
            return { method, route, provider, credentialReady };
          });
          const readyCount = modalidadeRoutes.filter(
            (item) => item.route?.enabled === true && item.credentialReady,
          ).length;

          return (
            <article key={modalidade.value} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                    <Layers3 size={14} />
                    {modalidade.shortLabel}
                  </p>
                  <h5 className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">
                    {modalidadeLabel(modalidade.value)}
                  </h5>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    {modalidade.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                <EnvironmentBadge environment={routeEnvironment} />
                <StatusPill active={readyCount === METHODS.length} label={`${readyCount}/${METHODS.length} ok`} />
                </div>
              </div>

            <div className="grid gap-2">
                {modalidadeRoutes.map(({ method, route, provider, credentialReady }) => {
                  const routeEnvironmentForMethod = route?.environment || routeEnvironment;
                  const providerCode = route?.providerCode;
                  const brand = providerCode ? PROVIDER_BRANDS[providerCode] : undefined;
                  const routeReady = route?.enabled === true && credentialReady;
                  const routeLabel = !route?.enabled
                    ? 'Rota desligada'
                    : credentialReady
                      ? 'Pronto para usar'
                      : 'Chave pendente';

                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => onSelectRoute(
                        modalidade.value,
                        method.value,
                        routeEnvironmentForMethod,
                        providerCode,
                      )}
                      className="group flex min-h-[78px] min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-all hover:border-blue-200 hover:bg-white"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <PaymentMethodImage method={method.value} compact />
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <MethodBadge method={method.value} />
                            <span
                              className={`inline-flex min-h-[24px] items-center rounded-md px-2 text-[9px] font-black uppercase tracking-widest ${
                                routeReady
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                              }`}
                            >
                              {routeLabel}
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            {providerCode && provider ? (
                              <>
                                <ProviderLogo code={providerCode} compact className="max-w-[132px]" />
                                <span
                                  className="max-w-full truncate rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-widest"
                                  style={{
                                    background: brand?.softAccent || '#f8fafc',
                                    color: brand?.text || '#475569',
                                  }}
                                >
                                  {provider.name}
                                </span>
                              </>
                            ) : (
                              <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                                Sem banco
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="shrink-0 text-slate-300 transition-colors group-hover:text-blue-500" size={18} />
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};

export default ResumoBancarioPanel;
