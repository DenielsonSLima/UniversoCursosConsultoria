import React from 'react';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  GraduationCap,
  LoaderCircle,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import type { PortalAuthProfile } from '../portal-session';

type PortalProfileSelectorProps = {
  profiles: readonly PortalAuthProfile[];
  isSelecting: boolean;
  pendingProfileKey: string | null;
  onBack: () => void;
  onSelect: (profile: PortalAuthProfile) => void;
  variant?: 'light' | 'dark';
};

const profileMeta = (profile: PortalAuthProfile) => {
  switch (profile.tipo) {
    case 'Responsavel':
      return { label: 'Responsável', icon: UsersRound };
    case 'Coordenador':
      return { label: 'Coordenador', icon: ClipboardCheck };
    case 'Professor':
      return { label: 'Professor', icon: GraduationCap };
    case 'Gestor':
      return { label: 'Gestor', icon: Building2 };
    default:
      return { label: 'Aluno', icon: GraduationCap };
  }
};

export const portalProfileKey = (profile: PortalAuthProfile) => (
  `${profile.tipo}-${profile.contextId || profile.id}`
);

const PortalProfileSelector: React.FC<PortalProfileSelectorProps> = ({
  profiles,
  isSelecting,
  pendingProfileKey,
  onBack,
  onSelect,
  variant = 'light',
}) => {
  const isDark = variant === 'dark';
  const cardClassName = isDark
    ? 'border-white/20 bg-white/[0.08] text-white hover:border-blue-300/60 hover:bg-white/[0.14]'
    : 'border-slate-200 bg-white text-[#001a33] hover:border-blue-200 hover:bg-blue-50';
  const iconClassName = isDark
    ? 'bg-blue-400/15 text-blue-200'
    : 'bg-blue-50 text-blue-600';
  const secondaryClassName = isDark ? 'text-blue-100/65' : 'text-slate-500';

  return (
    <section
      aria-labelledby="portal-profile-selector-title"
      className={isDark
        ? 'mt-5 rounded-3xl border border-white/15 bg-slate-950/20 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.18)] backdrop-blur-md'
        : 'w-full max-w-[560px] rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-8'}
    >
      <div className="mb-6">
        <span className={isDark
          ? 'inline-flex items-center gap-2 rounded-full bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-100'
          : 'inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700'}
        >
          <ShieldCheck size={13} /> Acesso verificado
        </span>
        <h2 id="portal-profile-selector-title" className={`mt-4 text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-[#001a33]'}`}>
          Escolha como deseja entrar
        </h2>
        <p className={`mt-2 text-sm font-medium leading-relaxed ${secondaryClassName}`}>
          Encontramos mais de um perfil ativo para este login. Escolha um portal para esta sessão.
        </p>
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => {
          const meta = profileMeta(profile);
          const Icon = meta.icon;
          const key = portalProfileKey(profile);
          const isPending = key === pendingProfileKey;
          return (
            <button
              key={key}
              type="button"
              disabled={isSelecting}
              aria-busy={isPending}
              onClick={() => onSelect(profile)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition disabled:cursor-wait disabled:opacity-70 ${cardClassName}`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
                  <Icon size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{meta.label}</span>
                  <span className={`mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wider ${secondaryClassName}`}>
                    {isPending ? 'Preparando acesso...' : profile.nome}
                  </span>
                </span>
              </span>
              {isPending ? <LoaderCircle className="animate-spin text-blue-500" size={18} /> : <ArrowRight className="text-blue-500" size={18} />}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={isSelecting}
        onClick={onBack}
        className={`mt-5 w-full rounded-xl border py-3 text-[10px] font-black uppercase tracking-widest transition disabled:cursor-wait disabled:opacity-70 ${isDark ? 'border-white/15 text-blue-100/75 hover:bg-white/10 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
      >
        Voltar para login
      </button>
    </section>
  );
};

export default PortalProfileSelector;
