import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  FlaskConical,
  Loader2,
  Power,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  MODALIDADES,
  credentialReadyForRoute,
  environmentLabel,
  modalidadeLabel,
} from './integracao-bancaria.constants';
import { ProviderLogo, StatusPill } from './integracao-bancaria.ui';
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
  controlModalidade: GatewayModalidade;
  runtimeMutationPending: boolean;
  routeMutationPending: boolean;
  getCredential: (providerCode: GatewayProviderCode, environment: GatewayEnvironment) => GatewayCredential | undefined;
  onChangeControlModalidade: (modalidade: GatewayModalidade) => void;
  onChangeRuntime: (enabled: boolean, environment: GatewayEnvironment) => void;
  onToggleRoute: (
    modalidade: GatewayModalidade,
    method: GatewayPaymentMethod,
    environment: GatewayEnvironment,
    providerCode: GatewayProviderCode,
    enabled: boolean,
  ) => void;
}

const routeFor = (
  overview: GatewayOverview | undefined,
  modalidade: GatewayModalidade,
  method: GatewayPaymentMethod,
  environment: GatewayEnvironment,
) => overview?.routes.find(
  (route) => route.modalidade === modalidade
    && route.paymentMethod === method
    && route.environment === environment,
);

const Switch = ({
  checked,
  disabled,
  pending,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  label: string;
  onChange: () => void;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled || pending}
    onClick={onChange}
    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition ${
      checked
        ? 'border-emerald-600 bg-emerald-600'
        : 'border-slate-300 bg-slate-200'
    } disabled:cursor-not-allowed disabled:opacity-45`}
  >
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition ${
      checked ? 'translate-x-7' : 'translate-x-1'
    }`}>
      {pending ? <Loader2 size={12} className="animate-spin text-slate-500" /> : null}
    </span>
  </button>
);

const ResumoBancarioPanel: React.FC<ResumoBancarioPanelProps> = ({
  overview,
  routeEnvironment,
  controlModalidade,
  runtimeMutationPending,
  routeMutationPending,
  getCredential,
  onChangeControlModalidade,
  onChangeRuntime,
  onToggleRoute,
}) => {
  const integrationEnabled = overview?.integrationEnabled === true;
  const boletoRoute = routeFor(overview, controlModalidade, 'BOLETO', routeEnvironment);
  const pixRoute = routeFor(overview, controlModalidade, 'PIX', routeEnvironment);
  const cardRoute = routeFor(overview, controlModalidade, 'CREDIT_CARD', routeEnvironment);
  const boletoCredential = getCredential('banese_card', routeEnvironment);
  const boletoReady = credentialReadyForRoute('banese_card', boletoCredential, 'BOLETO');
  const isSandbox = routeEnvironment === 'sandbox';

  const methodCards = [
    {
      method: 'BOLETO' as const,
      provider: 'banese_card' as const,
      title: 'Boleto',
      icon: FileText,
      route: boletoRoute,
      ready: boletoReady,
      disabled: !isSandbox || !boletoReady,
      tone: 'border-sky-200 bg-sky-50/70',
      iconTone: 'bg-sky-100 text-sky-700',
      description: isSandbox
        ? 'A API registra o título e devolve linha digitável e código de barras. O PDF privado é montado pela Universo.'
        : 'Produção permanece bloqueada nesta etapa. O BolePix será lido do mesmo retorno do boleto quando autorizado.',
      status: boletoReady ? 'OAuth validado' : 'Credencial pendente',
    },
    {
      method: 'PIX' as const,
      provider: 'banese_card' as const,
      title: 'Pix / BolePix',
      icon: QrCode,
      route: pixRoute,
      ready: false,
      disabled: true,
      tone: 'border-amber-200 bg-amber-50/70',
      iconTone: 'bg-amber-100 text-amber-700',
      description: isSandbox
        ? 'Indisponível no convênio de homologação 15528. Nenhum QR Code deve ser esperado ou gerado.'
        : 'Em produção, o Banese acrescenta o QR Code automaticamente no retorno do próprio boleto.',
      status: isSandbox ? 'Indisponível em homologação' : 'Liberação controlada',
    },
    {
      method: 'CREDIT_CARD' as const,
      provider: 'mercado_pago' as const,
      title: 'Cartão',
      icon: CreditCard,
      route: cardRoute,
      ready: false,
      disabled: true,
      tone: 'border-rose-200 bg-rose-50/60',
      iconTone: 'bg-rose-100 text-rose-700',
      description: 'Mercado Pago permanece sem cobrança real até concluir webhook, idempotência e recuperação de criação ambígua.',
      status: 'Homologação pendente',
    },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#001a33] px-5 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-sky-200">
                <ShieldCheck size={14} />
                Controle canônico do checkout
              </p>
              <h4 className="mt-2 text-2xl font-black uppercase tracking-tight">
                Operação bancária
              </h4>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
                Este painel altera o ambiente usado pelo backend. O checkout nunca procura uma rota em outro ambiente.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 p-3">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-md ${
                integrationEnabled ? 'bg-emerald-400 text-emerald-950' : 'bg-slate-700 text-slate-300'
              }`}>
                <Power size={19} />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Integração
                </p>
                <p className="text-sm font-black uppercase">
                  {integrationEnabled ? 'Ativa' : 'Inativa'}
                </p>
              </div>
              <Switch
                checked={integrationEnabled}
                pending={runtimeMutationPending}
                label={integrationEnabled ? 'Desativar integração bancária' : 'Ativar integração bancária'}
                onChange={() => onChangeRuntime(!integrationEnabled, routeEnvironment)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Ambiente de cobrança
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1.5">
              {ENVIRONMENTS.map((environment) => {
                const active = routeEnvironment === environment.value;
                const productionLocked = environment.value === 'production';
                return (
                  <button
                    key={environment.value}
                    type="button"
                    disabled={runtimeMutationPending || productionLocked}
                    onClick={() => onChangeRuntime(integrationEnabled, environment.value)}
                    className={`min-h-[58px] rounded-lg border px-4 text-left transition ${
                      active
                        ? 'border-amber-300 bg-white text-amber-800 shadow-sm'
                        : 'border-transparent text-slate-500'
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                      {environment.value === 'sandbox' ? <FlaskConical size={15} /> : <ShieldCheck size={15} />}
                      {environmentLabel(environment.value)}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold">
                      {productionLocked ? 'Bloqueado nesta etapa' : 'Convênio 15528 · boleto sem Pix'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="banking-control-modalidade" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Escopo que será configurado
            </label>
            <select
              id="banking-control-modalidade"
              value={controlModalidade}
              onChange={(event) => onChangeControlModalidade(event.target.value as GatewayModalidade)}
              className="mt-3 min-h-[58px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm font-black uppercase text-[#001a33] outline-none focus:border-blue-400"
            >
              {MODALIDADES.filter((item) => item.value === 'EAD').map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Primeiro teste: Cursos EAD em sandbox, somente boleto Banese.
            </p>
          </div>
        </div>
      </section>

      {!integrationEnabled ? (
        <div className="flex gap-3 rounded-xl border border-slate-300 bg-slate-100 p-4 text-slate-700">
          <Power size={19} className="mt-0.5 shrink-0" />
          <p className="text-sm font-bold leading-relaxed">
            A integração está inativa. Nenhum checkout pode criar uma nova cobrança, mesmo que alguma rota permaneça preparada.
          </p>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Meios de pagamento
            </p>
            <h4 className="mt-1 text-xl font-black uppercase tracking-tight text-[#001a33]">
              {modalidadeLabel(controlModalidade)} · {environmentLabel(routeEnvironment)}
            </h4>
          </div>
          <StatusPill active={isSandbox} label={isSandbox ? 'Homologação segura' : 'Produção bloqueada'} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {methodCards.map((item) => {
            const Icon = item.icon;
            const enabled = item.route?.enabled === true;
            return (
              <article key={item.method} className={`flex min-h-[300px] flex-col rounded-xl border p-5 ${item.tone}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${item.iconTone}`}>
                    <Icon size={23} />
                  </span>
                  <Switch
                    checked={enabled}
                    disabled={!enabled && item.disabled}
                    pending={routeMutationPending}
                    label={`${enabled ? 'Desativar' : 'Ativar'} ${item.title}`}
                    onChange={() => onToggleRoute(
                      controlModalidade,
                      item.method,
                      routeEnvironment,
                      item.provider,
                      !enabled,
                    )}
                  />
                </div>

                <div className="mt-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {item.title}
                  </p>
                  <div className="mt-2">
                    <ProviderLogo code={item.provider} compact />
                  </div>
                  <p className="mt-4 text-sm font-semibold leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>

                <div className="mt-auto pt-5">
                  <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${
                    enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : item.disabled
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-white text-slate-600'
                  }`}>
                    {enabled ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span>{enabled ? `Ativo · ${item.status}` : item.status}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={19} />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-800">
              Critério do primeiro teste
            </p>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-900">
              O Banese deve retornar 44 dígitos do código de barras e 47 da linha digitável. O sistema monta e entrega o PDF por rota autenticada; não existe PDF fornecido pelo banco.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ResumoBancarioPanel;
