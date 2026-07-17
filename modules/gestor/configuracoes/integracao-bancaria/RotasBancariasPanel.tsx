import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers3,
  Loader2,
  Route,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  METHODS,
  MODALIDADES,
  PROVIDER_BRANDS,
  environmentLabel,
  methodLabel,
  modalidadeLabel,
  credentialReadyForRoute,
  requiredFieldsForRoute,
} from './integracao-bancaria.constants';
import {
  EnvironmentBadge,
  EnvironmentBanner,
  MethodBadge,
  PaymentMethodImage,
  ProviderChoiceCard,
  ProviderLogo,
  SecretState,
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
  GatewayRoute,
} from './integracao-bancaria.service';

interface RotasBancariasPanelProps {
  overview?: GatewayOverview;
  providers: GatewayProvider[];
  modalidade: GatewayModalidade;
  routeEnvironment: GatewayEnvironment;
  paymentMethod: GatewayPaymentMethod;
  routeProviderCode: GatewayProviderCode;
  routeProvider?: GatewayProvider;
  routedProvider?: GatewayProvider;
  routeCredential?: GatewayCredential;
  selectedRoute?: GatewayRoute;
  selectedProviderSupportsMethod: boolean;
  selectedRouteCredentialReady: boolean;
  routeMutationPending: boolean;
  getCredential: (providerCode: GatewayProviderCode, environment: GatewayEnvironment) => GatewayCredential | undefined;
  setRouteEnvironment: (value: GatewayEnvironment) => void;
  setPaymentMethod: (value: GatewayPaymentMethod) => void;
  setRouteProviderCode: (value: GatewayProviderCode) => void;
  activateRoute: () => void;
}

const routeForMethod = (
  overview: GatewayOverview | undefined,
  modalidade: GatewayModalidade,
  environment: GatewayEnvironment,
  method: GatewayPaymentMethod,
) => overview?.routes.find(
  (routeItem) => routeItem.modalidade === modalidade
    && routeItem.paymentMethod === method
    && routeItem.environment === environment,
);

const RotasBancariasPanel: React.FC<RotasBancariasPanelProps> = ({
  overview,
  providers,
  modalidade,
  routeEnvironment,
  paymentMethod,
  routeProviderCode,
  routeProvider,
  routedProvider,
  routeCredential,
  selectedRoute,
  selectedProviderSupportsMethod,
  selectedRouteCredentialReady,
  routeMutationPending,
  getCredential,
  setRouteEnvironment,
  setPaymentMethod,
  setRouteProviderCode,
  activateRoute,
}) => {
  const brand = PROVIDER_BRANDS[routeProviderCode];
  const modalidadeConfig = MODALIDADES.find((item) => item.value === modalidade);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
              <Layers3 size={14} />
              Aba da modalidade
            </p>
            <h4 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
              {modalidadeLabel(modalidade)}
            </h4>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">
              {modalidadeConfig?.description} Configure abaixo quais bancos esta modalidade usa para Pix, boleto e cartão.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {ENVIRONMENTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setRouteEnvironment(item.value)}
                className={`inline-flex min-h-[42px] items-center justify-center rounded-md border px-4 text-xs font-black uppercase tracking-wider ${
                  routeEnvironment === item.value ? item.chip : 'border-transparent text-slate-500 hover:bg-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <EnvironmentBanner
            environment={routeEnvironment}
            title={`Rotas de ${modalidadeLabel(modalidade)}`}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {METHODS.map((method) => {
            const route = routeForMethod(overview, modalidade, routeEnvironment, method.value);
            const provider = providers.find((item) => item.code === route?.providerCode);
            const credential = route?.providerCode ? getCredential(route.providerCode, routeEnvironment) : undefined;
            const routeCredentialReady = credentialReadyForRoute(route?.providerCode, credential, method.value);
            const active = paymentMethod === method.value;

            return (
              <button
                key={method.value}
                type="button"
                onClick={() => {
                  setPaymentMethod(method.value);
                  if (route?.providerCode) setRouteProviderCode(route.providerCode);
                }}
                className={`min-h-[148px] min-w-0 overflow-hidden rounded-lg border p-4 text-left transition-all ${
                  active ? method.selected : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:text-[#001a33]'
                }`}
              >
                <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
                  <PaymentMethodImage method={method.value} />
                  {provider && <ProviderLogo code={provider.code} compact className="max-w-[48%]" />}
                </div>
                <div className="mb-2 flex min-w-0 flex-wrap gap-2">
                  <span className="block min-w-0 truncate text-sm font-black uppercase tracking-wider">{method.label}</span>
                  <EnvironmentBadge environment={routeEnvironment} />
                </div>
                <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">
                  {provider ? `Hoje usa ${provider.name}.` : 'Ainda sem banco definido.'}
                </span>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <StatusPill active={route?.enabled === true} label={route?.enabled ? 'Ativa' : 'Off'} />
                  <StatusPill active={routeCredentialReady} label={routeCredentialReady ? 'Chave ok' : 'Sem chave'} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid min-w-0 gap-3 lg:grid-cols-3">
        {providers.map((item) => (
          <React.Fragment key={item.code}>
            <ProviderChoiceCard
              provider={item}
              selected={routeProviderCode === item.code}
              active={selectedRoute?.providerCode === item.code}
              credential={getCredential(item.code, routeEnvironment)}
              paymentMethod={paymentMethod}
              environment={routeEnvironment}
              onClick={() => setRouteProviderCode(item.code)}
            />
          </React.Fragment>
        ))}
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <ProviderLogo code={routeProviderCode} hero className="mb-4 w-full" />
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: brand.text }}>
                Rota selecionada
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h4 className="text-xl font-black uppercase tracking-tight text-[#001a33]">
                  {methodLabel(paymentMethod)} · {modalidadeLabel(modalidade)}
                </h4>
                <EnvironmentBadge environment={routeEnvironment} />
              </div>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                Ao aplicar, apenas esta forma de pagamento desta aba será alterada.
              </p>
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            {requiredFieldsForRoute(routeProviderCode, routeCredential, paymentMethod).map((field) => (
              <React.Fragment key={field.label}>
                <SecretState label={field.label} configured={field.configured} />
              </React.Fragment>
            ))}
          </div>

          {routeProviderCode === 'banese_card' && (
            <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={18} />
              <p className="text-xs font-bold leading-relaxed text-amber-700">
                Na homologação, o Banese devolve somente linha digitável e código de barras. Em produção, o banco ativará o Pix dentro do mesmo boleto; por isso o BolePix usa a rota BOLETO e não exige uma rota Pix separada. Cartão não é suportado neste fluxo.
              </p>
            </div>
          )}

          {!selectedRouteCredentialReady && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold leading-relaxed text-red-700">
              Antes de aplicar esta rota, cadastre as chaves de {routeProvider?.name || 'banco'} em {environmentLabel(routeEnvironment)} na aba Parametrização.
            </div>
          )}

          <button
            type="button"
            onClick={activateRoute}
            disabled={routeMutationPending || !selectedProviderSupportsMethod || !selectedRouteCredentialReady}
            className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all disabled:opacity-40 ${brand.action}`}
          >
            {routeMutationPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Aplicar rota
          </button>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
                <Route size={14} />
                Resumo desta aba
              </p>
              <h4 className="mt-1 text-sm font-black uppercase tracking-widest text-[#001a33]">
                {modalidadeLabel(modalidade)} · {environmentLabel(routeEnvironment)}
              </h4>
            </div>
            <StatusPill active={selectedRoute?.enabled === true} label={selectedRoute?.enabled ? 'Rota ativa' : 'Sem rota'} />
          </div>

          <div className="grid gap-3">
            {METHODS.map((method) => {
              const route = routeForMethod(overview, modalidade, routeEnvironment, method.value);
              const provider = providers.find((item) => item.code === route?.providerCode);
              const routeBrand = provider ? PROVIDER_BRANDS[provider.code] : undefined;
              const credential = route?.providerCode ? getCredential(route.providerCode, routeEnvironment) : undefined;
              const routeCredentialReady = credentialReadyForRoute(route?.providerCode, credential, method.value);
              const active = paymentMethod === method.value;

              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method.value);
                    if (route?.providerCode) setRouteProviderCode(route.providerCode);
                  }}
                  className={`flex min-h-[76px] min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border px-4 py-3 text-left transition-all ${
                    active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <PaymentMethodImage method={method.value} compact />
                      <MethodBadge method={method.value} selected={active} />
                      <EnvironmentBadge environment={routeEnvironment} />
                      {provider && (
                        <span
                          className="inline-flex min-h-[28px] max-w-full items-center rounded-md px-2 text-[10px] font-black uppercase tracking-wider"
                          style={{
                            background: routeBrand?.softAccent || '#f8fafc',
                            color: routeBrand?.text || '#64748b',
                          }}
                        >
                          <span className="truncate">{provider.name}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {route?.enabled ? 'Ativa para esta modalidade.' : 'Rota ainda desligada.'}
                    </p>
                  </div>
                  <span className="min-w-0 max-w-[34%] shrink-0">
                    <StatusPill active={routeCredentialReady} label={routeCredentialReady ? 'Chave ok' : 'Sem chave'} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default RotasBancariasPanel;
