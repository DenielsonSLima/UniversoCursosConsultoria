import React, { useState } from 'react';
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
  GatewayProviderCode,
} from './integracao-bancaria.service';

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
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (value: string) => void;
  configured?: boolean;
  type?: 'text' | 'password';
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
    </span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={configured ? 'xxxxxxxxxxxx' : ''}
      className={`h-11 w-full rounded-md border px-3 font-mono text-sm text-slate-700 outline-none transition-all focus:border-blue-500 focus:bg-white ${
        configured ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      }`}
    />
  </label>
);

export const ProviderLogo = ({
  code,
  compact = false,
  hero = false,
  className = '',
}: {
  code: GatewayProviderCode;
  compact?: boolean;
  hero?: boolean;
  className?: string;
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const brand = PROVIDER_BRANDS[code];
  const Icon = brand.icon;
  const foreground = code === 'banese_card' ? '#ffffff' : brand.text;
  const showPngLogo = Boolean(brand.logoUrl && !imageFailed);
  const label = code === 'mercado_pago'
    ? 'Mercado'
    : code === 'banese_card'
      ? 'Banese Card'
      : brand.shortLabel;

  if (hero) {
    return (
      <div
        className={`relative isolate flex min-h-[112px] overflow-hidden rounded-lg border p-5 shadow-sm ${className}`}
        style={{
          background: code === 'banese_card'
            ? 'linear-gradient(135deg, #006b35 0%, #00843d 48%, #0fbf69 100%)'
            : code === 'mercado_pago'
              ? 'linear-gradient(135deg, #dcf7ff 0%, #f3fbff 46%, #fff5a8 100%)'
              : 'linear-gradient(135deg, #eaf2ff 0%, #ffffff 45%, #d9e8ff 100%)',
          borderColor: `${brand.accent}33`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-20"
          style={{ background: code === 'mercado_pago' ? '#ffdf00' : brand.accent }}
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-16 w-44 opacity-20"
          style={{
            backgroundImage: `linear-gradient(135deg, transparent 25%, ${code === 'banese_card' ? '#ffffff' : brand.accent} 25%, ${code === 'banese_card' ? '#ffffff' : brand.accent} 32%, transparent 32%, transparent 57%, ${code === 'banese_card' ? '#ffffff' : brand.accent} 57%, ${code === 'banese_card' ? '#ffffff' : brand.accent} 64%, transparent 64%)`,
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative flex min-w-0 w-full items-center justify-between gap-4">
          {showPngLogo ? (
            <img
              src={brand.logoUrl}
              alt={`Logo ${brand.label}`}
              className={`min-w-0 object-contain ${
                code === 'banese_card' ? 'max-w-[78%]' : 'max-w-[72%]'
              } ${code === 'asaas' ? 'max-h-[86px]' : 'max-h-[72px]'}`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <BrandWordmark code={code} size="lg" />
          )}
          <span
            className="hidden rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-widest sm:inline-flex"
            style={{
              background: code === 'banese_card' ? 'rgba(255,255,255,0.16)' : '#ffffffcc',
              color: code === 'banese_card' ? '#ffffff' : brand.text,
            }}
          >
            {brand.bestFor}
          </span>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-md border px-2.5 shadow-sm ${
        compact ? 'h-12 w-[clamp(96px,32vw,132px)]' : 'h-12 w-[min(100%,160px)]'
      } ${className}`}
      style={{
        background: code === 'mercado_pago'
          ? '#e8f8ff'
          : brand.logoBackground,
        borderColor: `${brand.accent}33`,
      }}
    >
      {showPngLogo ? (
        <img
          src={brand.logoUrl}
          alt={`Logo ${brand.label}`}
          className={`${compact ? 'max-h-8 max-w-full' : 'max-h-9 max-w-full'} min-w-0 object-contain`}
          onError={() => setImageFailed(true)}
        />
      ) : compact ? (
        <BrandWordmark code={code} size="sm" />
      ) : (
        <span className="min-w-0 leading-none">
          <BrandWordmark code={code} size="md" />
        </span>
      )}
      {!compact && code !== 'mercado_pago' && code !== 'asaas' && (
        <span className="sr-only">
          <Icon size={16} style={{ color: foreground }} />
          {label}
        </span>
      )}
    </span>
  );
};

const BrandWordmark = ({
  code,
  size,
}: {
  code: GatewayProviderCode;
  size: 'sm' | 'md' | 'lg';
}) => {
  const brand = PROVIDER_BRANDS[code];
  const scale = {
    sm: {
      icon: 'h-5 w-5',
      primary: 'text-[12px]',
      secondary: 'text-[8px]',
      gap: 'gap-1.5',
    },
    md: {
      icon: 'h-7 w-7',
      primary: 'text-[15px]',
      secondary: 'text-[9px]',
      gap: 'gap-2',
    },
    lg: {
      icon: 'h-14 w-14',
      primary: 'text-[34px]',
      secondary: 'text-[13px]',
      gap: 'gap-4',
    },
  }[size];

  if (code === 'asaas') {
    return (
      <span className={`inline-flex min-w-0 items-center ${scale.gap}`} aria-label="Asaas">
        <span className={`${scale.icon} relative inline-flex shrink-0 items-center justify-center rounded-md`} style={{ background: brand.softAccent }}>
          <span className="absolute h-2/3 w-2/3 rounded-full border-2" style={{ borderColor: brand.accent }} />
          <span className="absolute h-1/3 w-1/3 rounded-full" style={{ background: brand.accent }} />
        </span>
        <span
          className={`${scale.primary} min-w-0 truncate font-black lowercase leading-none tracking-normal`}
          style={{ color: brand.text }}
        >
          asaas
        </span>
      </span>
    );
  }

  if (code === 'mercado_pago') {
    return (
      <span className={`inline-flex min-w-0 items-center ${scale.gap}`} aria-label="Mercado Pago">
        <span className={`${scale.icon} relative inline-flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm`}>
          <span className="absolute left-[17%] top-[28%] h-[44%] w-[44%] rounded-full border-2 border-white" style={{ background: brand.accent }} />
          <span className="absolute right-[17%] top-[28%] h-[44%] w-[44%] rounded-full border-2 border-white" style={{ background: '#ffdf00' }} />
          <span className="absolute bottom-[28%] left-[32%] h-[16%] w-[36%] rounded-full bg-white/90" />
        </span>
        <span className="min-w-0 leading-none">
          <span
            className={`${scale.primary} block truncate font-black leading-none tracking-normal`}
            style={{ color: brand.text }}
          >
            mercado
          </span>
          <span
            className={`${scale.secondary} mt-0.5 block truncate font-black uppercase tracking-widest`}
            style={{ color: brand.text }}
          >
            pago
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex min-w-0 items-center ${scale.gap}`} aria-label="Banese Card">
      <span className={`${scale.icon} inline-flex shrink-0 items-center justify-center rounded-md bg-white/15`}>
        <svg viewBox="0 0 32 32" className="h-2/3 w-2/3" aria-hidden="true">
          <path d="M16 4 4 10v3h24v-3L16 4Z" fill="#ffffff" />
          <path d="M7 15h4v8H7v-8Zm7 0h4v8h-4v-8Zm7 0h4v8h-4v-8ZM5 25h22v3H5v-3Z" fill="#ffffff" opacity="0.92" />
        </svg>
      </span>
      <span
        className={`${scale.primary} min-w-0 truncate font-black uppercase leading-none tracking-wider text-white`}
      >
        Banese Card
      </span>
    </span>
  );
};

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
              ? 'Banese Card não aceita cartão de crédito neste fluxo'
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
          <SecretState key={field.label} label={field.label} configured={field.configured} />
        ))}
      </div>
    </button>
  );
};
