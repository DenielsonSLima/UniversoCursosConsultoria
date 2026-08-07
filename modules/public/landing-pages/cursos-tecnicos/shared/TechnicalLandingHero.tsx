import React from 'react';
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  GraduationCap,
  MapPin,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import type { TechnicalLandingConfig, TechnicalLandingData } from '../technicalLanding.types';
import {
  formatLandingDate,
  formatLandingMoney,
  getTechnicalFinancialSummary,
} from './technicalLanding.utils';

interface TechnicalLandingHeroProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
}

const getEligibilityLabel = (data: TechnicalLandingData) => {
  const minimumGrade = `${data.turma.minimumHighSchoolGrade}º ano`;
  if (data.turma.acceptsConcurrent && data.turma.acceptsSubsequent) {
    return `Para quem concluiu o Ensino Médio ou está cursando, no mínimo, o ${minimumGrade}.`;
  }
  if (data.turma.acceptsConcurrent) {
    return `Para estudantes que estão cursando, no mínimo, o ${minimumGrade} do Ensino Médio.`;
  }
  return 'Para quem já concluiu o Ensino Médio.';
};

const getPoloLocationLabel = (data: TechnicalLandingData) => {
  const location = [data.polo.city, data.polo.state?.toLocaleUpperCase('pt-BR')]
    .filter(Boolean)
    .join('/');
  return [data.polo.name, location].filter(Boolean).join(' · ');
};

const TechnicalLandingHero: React.FC<TechnicalLandingHeroProps> = ({ data, config }) => {
  const onlineEnrollmentAvailable = data.turma.onlineEnrollmentAvailable;
  const campaign = config.marketingCampaign;
  const heroImageUrl = campaign?.heroImageUrl || data.course.imageUrl;
  const financial = getTechnicalFinancialSummary(data.turma);
  const durationLabel = data.course.durationMonths && data.course.durationMonths > 0
    ? `${data.course.durationMonths} meses`
    : null;

  return (
    <section className="relative isolate overflow-hidden bg-[#001532] text-white">
      {heroImageUrl ? (
        <img
          src={heroImageUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover object-center lg:block"
          fetchPriority="high"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(26,96,190,0.35),transparent_31%),radial-gradient(circle_at_78%_86%,rgba(13,148,136,0.16),transparent_27%)]" />
      <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,#001532_0%,rgba(0,21,50,.98)_46%,rgba(0,21,50,.62)_66%,rgba(0,21,50,.05)_100%)] lg:block" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.055] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto grid max-w-[90rem] lg:min-h-[39rem] lg:grid-cols-[1.08fr_0.92fr]">
        <div className="z-10 flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14 lg:py-14 xl:pl-20">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-300/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur">
              <Sparkles size={14} className="text-[#73b9ff]" /> {config.eyebrow}
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${
                onlineEnrollmentAvailable
                  ? 'bg-emerald-400 text-emerald-950'
                  : 'border border-blue-200/20 bg-blue-200/10 text-blue-100'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${onlineEnrollmentAvailable ? 'bg-emerald-900' : 'bg-blue-300'}`} />
              {data.turma.availabilityLabel}
            </div>
          </div>

          {campaign?.promise ? (
            <p className="mt-6 text-lg font-black text-[#7ec0ff] md:text-xl">{campaign.promise}</p>
          ) : null}
          <h1
            id="technical-landing-title"
            tabIndex={-1}
            className={`${campaign?.promise ? 'mt-2' : 'mt-7'} max-w-3xl text-5xl font-black leading-[0.94] tracking-[-0.05em] text-white outline-none sm:text-6xl xl:text-[4.5rem]`}
          >
            {data.course.name}
          </h1>
          <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-blue-100/75 md:text-lg">
            {data.course.description || config.description}
          </p>
          <p className="mt-4 flex max-w-2xl items-start gap-2.5 text-sm font-bold leading-relaxed text-blue-50">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-400" size={19} />
            {campaign?.eligibility || getEligibilityLabel(data)}
          </p>

          <div className="mt-7 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-xs font-bold text-blue-50 backdrop-blur">
              <MapPin size={15} className="text-blue-300" /> {getPoloLocationLabel(data)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-xs font-bold text-blue-50 backdrop-blur">
              <Clock3 size={15} className="text-blue-300" /> {data.turma.shift}
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-2.5 text-xs font-bold text-blue-50 backdrop-blur">
              <CalendarDays size={15} className="text-blue-300" /> Início {formatLandingDate(data.turma.startDate)}
            </span>
          </div>

          {financial.hasInstallment ? (
            <div className="mt-6 max-w-[39rem] overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/[0.08] shadow-2xl shadow-black/20 backdrop-blur-md">
              <div className="grid sm:grid-cols-[1fr_auto] sm:items-stretch">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Mensalidade</span>
                    {financial.hasPunctualDiscount ? (
                      <span className="text-sm font-bold text-blue-100/60 line-through decoration-red-400 decoration-2">
                        {formatLandingMoney(financial.regularInstallmentValue)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-end gap-2">
                    <strong className="text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                      {formatLandingMoney(financial.payableInstallmentValue)}
                    </strong>
                    <span className="pb-1 text-xs font-bold text-blue-100/65">por mês</span>
                  </div>
                  {financial.hasPunctualDiscount ? (
                    <p className="mt-2 flex items-center gap-2 text-sm font-black text-emerald-300">
                      <Check size={17} strokeWidth={3} /> pagando até o vencimento
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-bold text-blue-100/60">Valor cadastrado para esta turma.</p>
                  )}
                </div>
                {financial.hasPunctualDiscount ? (
                  <div className="flex items-center border-t border-white/10 bg-emerald-400 px-5 py-4 text-emerald-950 sm:w-44 sm:border-l sm:border-t-0">
                    <div>
                      <Tag size={20} />
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.15em]">Desconto cadastrado</p>
                      <p className="text-xl font-black">{formatLandingMoney(financial.punctualDiscount)}</p>
                      <p className="text-[11px] font-bold">em cada mensalidade</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {onlineEnrollmentAvailable ? (
              <a
                href="#inscricao-tecnica"
                className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-xs font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-blue-950/25 transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-200"
              >
                Fazer inscrição online
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 transition-transform group-hover:translate-y-0.5 motion-reduce:transform-none">
                  <ArrowDown size={17} />
                </span>
              </a>
            ) : null}
            <a
              href={onlineEnrollmentAvailable ? '/contato' : '#inscricao-tecnica'}
              className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-7 py-4 text-xs font-black uppercase tracking-[0.12em] text-white shadow-xl shadow-black/10 backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              Falar com a secretaria
              {onlineEnrollmentAvailable ? <ArrowRight size={18} /> : <ArrowDown size={18} />}
            </a>
          </div>
        </div>

        <div className="relative min-h-[25rem] overflow-hidden lg:min-h-full">
          {heroImageUrl ? (
            <img
              src={heroImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover object-center lg:hidden"
              fetchPriority="high"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(59,130,246,.28),transparent_60%)] lg:hidden">
              <GraduationCap size={120} className="text-blue-200/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#001532] via-transparent to-[#001532]/10 lg:hidden" />
          <div className="absolute inset-x-6 bottom-6 grid gap-3 sm:grid-cols-2 lg:left-12 lg:right-10">
            {data.turma.enrollmentFee > 0 ? (
              <div className="rounded-3xl border border-white/30 bg-white/95 p-5 text-[#001a4d] shadow-2xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-red-600">Matrícula</p>
                <p className="mt-1 text-3xl font-black">{formatLandingMoney(data.turma.enrollmentFee)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-600">Valor cadastrado na turma</p>
              </div>
            ) : null}
            {durationLabel ? (
              <div className="rounded-3xl border border-white/20 bg-[#001f5b]/90 p-5 text-white shadow-2xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.17em] text-blue-200">Duração cadastrada</p>
                <p className="mt-1 text-2xl font-black">{durationLabel}</p>
                {data.turma.installments > 0 ? (
                  <p className="mt-1 text-xs font-bold text-blue-100/70">{data.turma.installments} mensalidades por ciclo</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechnicalLandingHero;
