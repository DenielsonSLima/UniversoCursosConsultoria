import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  CreditCard,
  GraduationCap,
  Home,
  Quote,
  UserRound,
} from 'lucide-react';

const PROESC_LOGIN_URL = 'https://app.proesc.com/universo-cursos-e-consultoria/login';

type HeroProps = {
  formattedDate: string;
  formattedTime: string;
  dailyPhrase: string;
  navigateTo: (path: string) => void;
};

export const AlunoLoginHero: React.FC<HeroProps> = ({
  formattedDate,
  formattedTime,
  dailyPhrase,
  navigateTo,
}) => (
  <section className="relative hidden min-h-screen overflow-hidden bg-[#001a33] text-white lg:flex lg:flex-col">
    <img src="/banner1.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(135deg, rgba(0,26,51,0.98) 0%, rgba(0,73,172,0.86) 54%, rgba(37,99,235,0.62) 100%)',
        mixBlendMode: 'multiply',
      }}
    />
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(90deg, rgba(0,26,51,0.96) 0%, rgba(0,58,133,0.78) 48%, rgba(0,26,51,0.22) 100%)',
      }}
    />
    <div className="relative z-20 flex items-start justify-between gap-3 px-10 pt-8 xl:px-16 xl:pt-10">
      <button
        type="button"
        onClick={() => navigateTo('/')}
        className="shrink-0 rounded-2xl bg-white px-3 py-3 shadow-2xl shadow-black/20 transition hover:scale-[1.02] xl:px-5"
      >
        <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-9 w-auto object-contain xl:h-12" />
      </button>
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white/15 xl:px-4"
        >
          <Home size={14} /> Site
        </button>
        <button
          type="button"
          onClick={() => navigateTo('/sistema/login')}
          className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md transition hover:bg-white/15 xl:px-4"
        >
          Institucional
        </button>
      </div>
    </div>
    <div className="relative z-10 flex flex-1 flex-col justify-center px-10 pb-8 pt-8 xl:px-16 xl:pb-10">
      <div className="w-full max-w-[720px]">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-blue-100">
          <GraduationCap size={14} /> Portal do aluno
        </span>
        <h1 className="mt-5 w-full max-w-[620px] text-[1.9rem] font-black uppercase leading-[0.98] tracking-tight sm:text-[2.55rem] lg:text-[2.85rem] xl:text-[3.15rem] 2xl:text-[3.2rem]">
          Comece seu curso sem esperar atendimento.
        </h1>
        <p className="mt-5 w-full max-w-[620px] text-sm font-semibold leading-relaxed text-blue-50/85 sm:text-base">
          Crie seu cadastro, pague online e acesse seus cursos EAD, livres e especializações. Cursos técnicos continuam com ficha completa quando necessário.
        </p>

        <div className="mt-7 w-full max-w-[620px] rounded-3xl border border-blue-100/15 bg-white/10 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/90">{formattedDate}</p>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black tabular-nums tracking-widest text-white">
              <Clock size={13} className="text-blue-200" />
              {formattedTime}
            </span>
          </div>
          <div className="mt-3 flex gap-3 text-sm font-semibold leading-relaxed text-blue-50/90">
            <Quote size={18} className="mt-0.5 shrink-0 text-blue-200" />
            <p>{dailyPhrase}</p>
          </div>
        </div>

        <div className="mt-6 grid w-full max-w-[620px] grid-cols-3 gap-3">
          {[
            { icon: UserRound, label: 'Cadastro' },
            { icon: CreditCard, label: 'Checkout' },
            { icon: BookOpen, label: 'Portal' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur-md">
              <Icon size={18} className="text-blue-200" />
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 w-full max-w-[620px] rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Alunos de cursos até 2026</p>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-200">
            Use o Proesc se você fez curso técnico ou presencial até 2026.
          </p>
          <a
            href={PROESC_LOGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-sm font-black text-white transition hover:text-blue-200"
          >
            Acessar portal Proesc <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    </div>
  </section>
);

export const AlunoLoginMobileHeader: React.FC<HeroProps> = ({
  formattedDate,
  formattedTime,
  dailyPhrase,
  navigateTo,
}) => (
  <>
    <div className="mx-auto w-full max-w-[560px] lg:hidden">
      <div className="mb-5 rounded-3xl bg-[#001a33] p-5 text-white shadow-xl">
        <div className="mb-5 inline-flex rounded-2xl bg-white px-4 py-3 shadow-lg">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-11 w-auto object-contain" />
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-100">
          <GraduationCap size={13} /> Portal do aluno
        </span>
        <h1 className="mt-4 text-3xl font-black uppercase leading-tight tracking-tight">
          Acesse seus cursos online.
        </h1>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-blue-100">
            <span>{formattedDate}</span>
            <span className="tabular-nums">{formattedTime}</span>
          </div>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-blue-50/90">{dailyPhrase}</p>
        </div>
      </div>
    </div>
    <div className="mb-4 flex w-full max-w-[560px] items-center justify-between lg:hidden">
      <button
        type="button"
        onClick={() => navigateTo('/')}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
      >
        <Home size={14} /> Site
      </button>
      <button
        type="button"
        onClick={() => navigateTo('/sistema/login')}
        className="rounded-full bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md transition hover:bg-blue-700"
      >
        Institucional
      </button>
    </div>
  </>
);
