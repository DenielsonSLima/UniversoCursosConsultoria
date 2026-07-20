import React from 'react';
import { ArrowDown, CalendarDays, Clock3, GraduationCap, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import type { TechnicalLandingConfig, TechnicalLandingData } from '../technicalLanding.types';
import { formatLandingDate } from './technicalLanding.utils';

interface TechnicalLandingHeroProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
}

const TechnicalLandingHero: React.FC<TechnicalLandingHeroProps> = ({ data, config }) => {
  const onlineEnrollmentAvailable = data.turma.onlineEnrollmentAvailable;

  return (
    <section className="relative overflow-hidden bg-[#000d1a] text-white">
      {/* Background ambient lighting and gradient overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-900/40 via-[#001833] to-[#000d1a]" />
      <div className="pointer-events-none absolute -left-32 top-0 h-[30rem] w-[30rem] rounded-full bg-blue-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* Optional Course Image background overlay with dark filter */}
      {data.course.imageUrl ? (
        <div className="absolute inset-0 opacity-20 mix-blend-luminosity">
          <img src={data.course.imageUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#000d1a] via-[#000d1a]/80 to-transparent" />
        </div>
      ) : null}

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.25fr_0.75fr] lg:py-24 items-center">
        {/* Left Column: Hero Content */}
        <div>
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-blue-300 backdrop-blur-md">
            <Sparkles size={14} className="text-blue-400 animate-pulse" />
            <span>{config.eyebrow || 'Formação Técnica Profissional'}</span>
          </div>

          {/* Title with sleek gradient */}
          <h1 className="mt-6 text-4xl font-black uppercase leading-[1.08] tracking-tight text-white md:text-6xl lg:text-6xl">
            <span className="bg-gradient-to-r from-white via-blue-50 to-blue-200 bg-clip-text text-transparent">
              {data.course.name}
            </span>
          </h1>

          {/* Description */}
          <p className="mt-6 max-w-2xl text-base font-medium leading-relaxed text-blue-100/80 md:text-lg">
            {config.description}
          </p>

          {/* Feature Pills */}
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-md shadow-sm">
              <MapPin size={16} className="text-blue-400" />
              <span>{data.polo.name} · {data.polo.city}/{data.polo.state}</span>
            </span>
            <span className="inline-flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-md shadow-sm">
              <Clock3 size={16} className="text-blue-400" />
              <span>Turno: {data.turma.shift}</span>
            </span>
            <span className="inline-flex items-center gap-2.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-bold backdrop-blur-md shadow-sm">
              <CalendarDays size={16} className="text-blue-400" />
              <span>Início: {formatLandingDate(data.turma.startDate)}</span>
            </span>
          </div>
        </div>

        {/* Right Column: Quick Enrollment Card */}
        <div className="flex items-center">
          <div className="relative w-full overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/10 p-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {/* Ambient Card Light */}
            <div className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-2xl ${
              onlineEnrollmentAvailable ? 'bg-emerald-500/25' : 'bg-blue-500/25'
            }`} />

            <div className="flex items-center gap-3.5">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner ${
                onlineEnrollmentAvailable ? 'bg-emerald-400/20 text-emerald-300' : 'bg-blue-400/20 text-blue-200'
              }`}>
                <GraduationCap size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    onlineEnrollmentAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-blue-300'
                  }`} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-200/80">
                    Status da Turma
                  </span>
                </div>
                <p className="mt-0.5 text-xl font-black text-white">{data.turma.availabilityLabel}</p>
              </div>
            </div>

            <p className="mt-6 text-xs font-semibold leading-relaxed text-blue-100/80 border-t border-white/10 pt-5">
              {onlineEnrollmentAvailable
                ? `Inscrições online abertas até ${formatLandingDate(data.turma.enrollmentEndDate)}. Garanta sua vaga com matrícula imediata no portal.`
                : 'Esta turma está disponível para consulta. A pré-matrícula e orientações são realizadas presencialmente na unidade.'}
            </p>

            {onlineEnrollmentAvailable ? (
              <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-emerald-300/90">
                <ShieldCheck size={16} className="shrink-0 text-emerald-400" />
                <span>Processo 100% online com confirmação rápida</span>
              </div>
            ) : null}

            <a
              href="#inscricao-tecnica"
              className={`mt-7 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-xl ${
                onlineEnrollmentAvailable
                  ? 'bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 text-emerald-950 hover:brightness-110 shadow-emerald-500/20'
                  : 'bg-white text-blue-900 hover:bg-blue-50'
              }`}
            >
              <span>{onlineEnrollmentAvailable ? 'Inscrever-se Agora' : 'Ver Atendimento Presencial'}</span>
              <ArrowDown size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TechnicalLandingHero;
