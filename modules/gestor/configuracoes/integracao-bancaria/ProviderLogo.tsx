import React, { useState } from 'react';
import { PROVIDER_BRANDS } from './integracao-bancaria.constants';
import { GatewayProviderCode } from './integracao-bancaria.service';

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
    <span className={`inline-flex min-w-0 items-center ${scale.gap}`} aria-label="Banese">
      <span className={`${scale.icon} inline-flex shrink-0 items-center justify-center rounded-md bg-white/15`}>
        <svg viewBox="0 0 32 32" className="h-2/3 w-2/3" aria-hidden="true">
          <path d="M16 4 4 10v3h24v-3L16 4Z" fill="#ffffff" />
          <path d="M7 15h4v8H7v-8Zm7 0h4v8h-4v-8Zm7 0h4v8h-4v-8ZM5 25h22v3H5v-3Z" fill="#ffffff" opacity="0.92" />
        </svg>
      </span>
      <span className={`${scale.primary} min-w-0 truncate font-black uppercase leading-none tracking-wider text-white`}>
        Banese
      </span>
    </span>
  );
};

const ProviderLogo = ({
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
      ? 'Banese'
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
        background: code === 'mercado_pago' ? '#e8f8ff' : brand.logoBackground,
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

export default ProviderLogo;
