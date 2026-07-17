import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  ENVIRONMENTS,
  METHODS,
  PROVIDER_BRANDS,
  credentialReadyForProvider,
  credentialReadyForRoute,
  environmentLabel,
  methodLabel,
  requiredFieldsFor,
  statusLabel,
  supportsMethod,
} from './integracao-bancaria.constants';
import {
  GatewayCredential,
  GatewayEnvironment,
  GatewayPaymentMethod,
  GatewayProvider,
} from './integracao-bancaria.service';
import ProviderLogo from './ProviderLogo';

export { ProviderLogo };

export const StatusPill = ({ active, label }: { active: boolean; label: string }) => (
  <span
    className={`inline-flex min-h-[24px] max-w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${
      active
        ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
        : 'bg-red-50 text-red-700 ring-red-100'
    }`}
  >
    {active ? <CheckCircle2 className="shrink-0" size={12} /> : <XCircle className="shrink-0" size={12} />}
    <span className="min-w-0 truncate">{label}</span>
  </span>
);

export const EnvironmentBadge = ({ environment }: { environment: GatewayEnvironment }) => {
  const config = ENVIRONMENTS.find((item) => item.value === environment);
  const Icon = environment === 'production' ? ShieldCheck : AlertTriangle;

  return (
    <span className={`inline-flex min-h-[28px] max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${config?.chip}`}>
      <Icon className="shrink-0" size={13} />
      <span className="min-w-0 truncate">{config?.headline || environmentLabel(environment)}</span>
    </span>
  );
};

export const EnvironmentBanner = ({
  environment,
  title,
}: {
  environment: GatewayEnvironment;
  title: string;
}) => {
  const config = ENVIRONMENTS.find((item) => item.value === environment);
  const Icon = environment === 'production' ? ShieldCheck : AlertTriangle;

  return (
    <div className={`rounded-lg border p-4 ${config?.banner}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/80 shadow-sm">
            <Icon size={20} />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest">Ambiente ativo</p>
            <h4 className="mt-1 text-xl font-black uppercase tracking-tight">
              {config?.headline || environmentLabel(environment)}
            </h4>
            <p className="mt-1 text-xs font-bold leading-relaxed opacity-80">{config?.description}</p>
          </div>
        </div>
        <span className="rounded-md bg-white/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest shadow-sm">
          {title}
        </span>
      </div>
    </div>
  );
};

export const SecretState = ({ label, configured }: { label: string; configured: boolean }) => (
  <div
    className={`flex min-h-[42px] items-center justify-between gap-3 rounded-md border px-3 py-2 ${
      configured ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
    }`}
  >
    <span className={`flex items-center gap-2 text-xs font-black ${configured ? 'text-emerald-800' : 'text-red-800'}`}>
      {configured ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </span>
    <code className={`text-[11px] font-black uppercase tracking-widest ${configured ? 'text-emerald-700' : 'text-red-500'}`}>
      {configured ? 'xxxxxxxxxxxx' : 'em branco'}
    </code>
  </div>
);

export const TextInput = ({
  icon: Icon,
  label,
  value,
  onChange,
  configured,
  type = 'text',
  readOnly = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (value: string) => void;
  configured?: boolean;
  type?: 'text' | 'password';
  readOnly?: boolean;
}) => (
  <label className="space-y-2">
    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
      <Icon size={14} />
      {label}
      {configured !== undefined && (
        <span className={`rounded-md px-2 py-0.5 text-[9px] ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {configured ? 'cadastrado' : 'vazio'}
        </span>
      )}
      {readOnly && (
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] text-slate-600">
          fixo Universo
        </span>
      )}
    </span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      aria-readonly={readOnly}
      placeholder={configured ? 'xxxxxxxxxxxx' : ''}
      className={`h-11 w-full rounded-md border px-3 font-mono text-sm text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white ${
        readOnly
          ? 'cursor-default border-slate-200 bg-slate-100 text-slate-600'
          : configured ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      }`}
    />
  </label>
);

export const InfoCard = ({
  icon: Icon = Info,
  title,
  children,
  tone = 'slate',
}: {
  icon?: React.ElementType;
  title: string;
  children: React.ReactNode;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber';
}) => {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-600',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/80">
          <Icon size={16} />
        </span>
        <p className="text-[11px] font-black uppercase tracking-widest">{title}</p>
      </div>
      <div className="text-xs font-semibold leading-relaxed">{children}</div>
    </div>
  );
};

export const MethodBadge = ({
  method,
  selected = false,
}: {
  method: GatewayPaymentMethod;
  selected?: boolean;
}) => {
  const methodConfig = METHODS.find((item) => item.value === method);
  const Icon = methodConfig?.icon || Info;

  return (
    <span
      className={`inline-flex min-h-[28px] max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-[10px] font-black uppercase tracking-wider ${
        selected ? methodConfig?.selected : methodConfig?.chip
      }`}
    >
      {methodConfig?.imageUrl ? (
        <img src={methodConfig.imageUrl} alt="" className="h-4 w-5 object-contain" />
      ) : (
        <Icon size={13} />
      )}
      <span className="min-w-0 truncate">{methodLabel(method)}</span>
    </span>
  );
};

export const PaymentMethodImage = ({
  method,
  compact = false,
}: {
  method: GatewayPaymentMethod;
  compact?: boolean;
}) => {
  const methodConfig = METHODS.find((item) => item.value === method);
  const Icon = methodConfig?.icon || Info;

  if (!methodConfig?.imageUrl) {
    return (
      <span className={`${compact ? 'h-10 w-12' : 'h-16 w-20'} inline-flex items-center justify-center rounded-md bg-white shadow-sm`}>
        <Icon size={compact ? 18 : 24} />
      </span>
    );
  }

  return (
    <span className={`${compact ? 'h-10 w-14' : 'h-16 w-24'} inline-flex items-center justify-center overflow-hidden rounded-md bg-white shadow-sm`}>
      <img
        src={methodConfig.imageUrl}
        alt={methodConfig.label}
        className="h-full w-full object-cover"
      />
    </span>
  );
};

export const ProviderSupportPills = ({ provider }: { provider: GatewayProvider }) => (
  <div className="flex min-w-0 flex-wrap gap-1.5">
    {METHODS.map((method) => {
      const supported = supportsMethod(provider, method.value);
      const Icon = method.icon;
      return (
        <span
          key={method.value}
          className={`inline-flex min-h-[24px] max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-[10px] font-black uppercase tracking-wider ${
            supported
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-400'
          }`}
        >
          {method.imageUrl ? (
            <img src={method.imageUrl} alt="" className="h-3.5 w-4 object-contain" />
          ) : (
            <Icon size={12} />
          )}
          <span className="min-w-0 truncate">{method.label}</span>
        </span>
      );
    })}
  </div>
);

export const ProviderChoiceCard = ({
  provider,
  selected,
  active,
  credential,
  paymentMethod,
  environment,
  onClick,
}: {
  provider: GatewayProvider;
  selected: boolean;
  active?: boolean;
  credential?: GatewayCredential;
  paymentMethod?: GatewayPaymentMethod;
  environment?: GatewayEnvironment;
  onClick: () => void;
}) => {
  const brand = PROVIDER_BRANDS[provider.code];
  const supported = paymentMethod ? supportsMethod(provider, paymentMethod) : true;
  const credentialReady = paymentMethod
    ? credentialReadyForRoute(provider.code, credential, paymentMethod)
    : credentialReadyForProvider(provider.code, credential);

  return (
    <button
      type="button"
      onClick={supported ? onClick : undefined}
      disabled={!supported}
      aria-disabled={!supported}
      className={`group min-w-0 overflow-hidden rounded-lg border bg-white p-4 text-left transition-all ${
        selected ? brand.selected : 'border-slate-200 hover:border-slate-300'
      } ${!supported ? 'cursor-not-allowed opacity-60 grayscale-[0.25]' : ''}`}
      style={selected ? { boxShadow: `0 18px 34px ${brand.shadow}` } : undefined}
    >
      <div className="relative mb-4 min-w-0 overflow-hidden">
        <ProviderLogo code={provider.code} hero className="w-full" />
        <div className="absolute right-3 top-3 flex max-w-[58%] min-w-0 flex-wrap justify-end gap-1.5">
          {environment && <EnvironmentBadge environment={environment} />}
          {active && <StatusPill active label="Na rota" />}
          <StatusPill active={credentialReady} label={statusLabel(credential)} />
        </div>
      </div>
      <div className="mt-4 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-base font-black text-[#001a33]">{provider.name}</h4>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{brand.description}</p>
        </div>
        <span className="max-w-[42%] shrink-0 truncate rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider" style={{ background: brand.softAccent, color: brand.text }}>
          {brand.bestFor}
        </span>
      </div>
      <div className="mt-3">
        <ProviderSupportPills provider={provider} />
      </div>
      {paymentMethod && (
        <p className={`mt-3 text-xs font-black ${supported ? 'text-emerald-700' : 'text-red-700'}`}>
          {supported
            ? `${methodLabel(paymentMethod)} disponível neste banco`
            : provider.code === 'banese_card' && paymentMethod === 'CREDIT_CARD'
              ? 'Banese não aceita cartão de crédito neste fluxo'
              : `${methodLabel(paymentMethod)} não disponível neste banco`}
        </p>
      )}
    </button>
  );
};

export const CredentialProviderCard = ({
  provider,
  credential,
  selected,
  environment,
  onClick,
}: {
  provider: GatewayProvider;
  credential?: GatewayCredential;
  selected: boolean;
  environment?: GatewayEnvironment;
  onClick: () => void;
}) => {
  const brand = PROVIDER_BRANDS[provider.code];
  const credentialReady = credentialReadyForProvider(provider.code, credential);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 overflow-hidden rounded-lg border bg-white p-4 text-left transition-all ${
        selected ? brand.selected : 'border-slate-200 hover:border-slate-300'
      }`}
      style={selected ? { boxShadow: `0 18px 34px ${brand.shadow}` } : undefined}
    >
      <div className="relative mb-4 min-w-0 overflow-hidden">
        <ProviderLogo code={provider.code} hero className="w-full" />
        <div className="absolute right-3 top-3 flex max-w-[58%] min-w-0 flex-wrap justify-end gap-1.5">
          {environment && <EnvironmentBadge environment={environment} />}
          <StatusPill active={credentialReady} label={statusLabel(credential)} />
        </div>
      </div>
      <h4 className="truncate text-base font-black text-[#001a33]">{provider.name}</h4>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{brand.description}</p>
      <div className="mt-3 grid gap-2">
        {requiredFieldsFor(provider.code, credential).map((field) => (
          <React.Fragment key={field.label}>
            <SecretState label={field.label} configured={field.configured} />
          </React.Fragment>
        ))}
      </div>
    </button>
  );
};
