import React from 'react';
import { CalendarDays, Clock3, GraduationCap, MapPin } from 'lucide-react';
import type { TechnicalLandingConfig, TechnicalLandingData } from '../technicalLanding.types';
import { formatLandingDate } from './technicalLanding.utils';

interface TechnicalLandingHeroProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
}

const TechnicalLandingHero: React.FC<TechnicalLandingHeroProps> = ({ data, config }) => {
  const soldOut = data.turma.totalSeats > 0 && data.turma.availableSeats <= 0;

  return (
  <section className="relative overflow-hidden bg-gradient-to-br from-[#001a33] via-[#003c78] to-blue-600 text-white">
    {data.course.imageUrl ? (
      <div className="absolute inset-0 opacity-15">
        <img src={data.course.imageUrl} alt="" className="h-full w-full object-cover" />
      </div>
    ) : null}
    <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.25fr_0.75fr] lg:py-24">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-200">{config.eyebrow}</p>
        <h1 className="mt-4 text-4xl font-black uppercase leading-tight tracking-tight md:text-6xl">
          {data.course.name}
        </h1>
        <p className="mt-5 max-w-3xl text-base font-semibold leading-relaxed text-blue-50/85 md:text-lg">
          {config.description}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur">
            <MapPin size={15} /> {data.polo.name} · {data.polo.city}/{data.polo.state}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur">
            <Clock3 size={15} /> {data.turma.shift}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur">
            <CalendarDays size={15} /> Início {formatLandingDate(data.turma.startDate)}
          </span>
        </div>
      </div>

      <div className="flex items-center">
        <div className="w-full rounded-[2rem] border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-400/20 p-3 text-emerald-200">
              <GraduationCap size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-100/70">Situação da turma</p>
              <p className="text-lg font-black text-white">{data.turma.availabilityLabel}</p>
            </div>
          </div>
          <p className="mt-6 text-xs font-semibold leading-relaxed text-blue-50/75">
            Inscrições até {formatLandingDate(data.turma.enrollmentEndDate)}. O envio dos documentos ocorre no portal após o pagamento.
          </p>
          {soldOut ? (
            <span className="mt-6 flex w-full items-center justify-center rounded-2xl bg-white/15 px-5 py-4 text-xs font-black uppercase tracking-widest text-white/70">
              Vagas esgotadas
            </span>
          ) : (
            <a
              href="#inscricao-tecnica"
              className="mt-6 flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 text-xs font-black uppercase tracking-widest text-blue-800 transition hover:-translate-y-0.5"
            >
              Quero me inscrever
            </a>
          )}
        </div>
      </div>
    </div>
  </section>
  );
};

export default TechnicalLandingHero;
