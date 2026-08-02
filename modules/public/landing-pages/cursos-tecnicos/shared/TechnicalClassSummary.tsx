import React from 'react';
import { ArrowRight, BookOpenCheck, CalendarRange, Check, Clock, MapPin, ShieldCheck, Shirt } from 'lucide-react';
import type { TechnicalLandingConfig, TechnicalLandingData } from '../technicalLanding.types';
import { formatLandingDate, formatLandingMoney } from './technicalLanding.utils';

interface TechnicalClassSummaryProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
}

const TechnicalClassSummary: React.FC<TechnicalClassSummaryProps> = ({ data, config }) => {
  const campaign = config.marketingCampaign;
  const items = [
    { icon: MapPin, label: 'Polo de Ensino', value: `${data.polo.name} · ${data.polo.city}/${data.polo.state}` },
    { icon: Clock, label: 'Turno das Aulas', value: data.turma.shift },
    { icon: CalendarRange, label: 'Previsão de Início', value: formatLandingDate(data.turma.startDate) },
    { icon: BookOpenCheck, label: 'Carga Horária', value: `${data.course.workloadHours} horas` },
  ];

  return (
    <section className="space-y-8">
      {/* 4 Stats Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
          >
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <Icon size={20} />
              </div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 text-sm font-black leading-snug text-[#001a33]">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {campaign ? (
        <section
          aria-labelledby="investment-title"
          className="relative overflow-hidden rounded-[2rem] bg-[#001f5b] px-6 py-8 text-white shadow-[0_24px_60px_-30px_rgba(0,31,91,0.7)] md:px-9 md:py-10"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border-[42px] border-red-500/90" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-2/5 bg-[radial-gradient(circle_at_bottom_right,rgba(46,128,255,0.35),transparent_68%)]" />

          <div className="relative grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-300/10 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-blue-100">
                <ShieldCheck size={16} /> Investimento transparente
              </div>
              <h2 id="investment-title" className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
                Seu caminho até a formação
              </h2>
              <p className="mt-3 max-w-md text-sm font-semibold leading-relaxed text-blue-100/80 md:text-base">
                Dois ciclos de mensalidades, com a rematrícula apresentada separadamente — exatamente como a formação acontece.
              </p>

              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[#001f5b] shadow-lg">
                <Shirt className="text-red-600" size={22} />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide">Matrícula {formatLandingMoney(campaign.enrollmentFee)}</p>
                  <p className="text-xs font-bold text-slate-500">{campaign.enrollmentBenefit}</p>
                </div>
              </div>
            </div>

            <div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-center">
                {[
                  `Matrícula`,
                  `${campaign.installmentsPerCycle} mensalidades`,
                  'Rematrícula',
                  `${campaign.installmentsPerCycle} mensalidades`,
                ].map((label, index) => (
                  <React.Fragment key={label + index}>
                    <div className={`rounded-2xl border p-4 ${index === 0 ? 'border-red-400/50 bg-red-500/15' : 'border-white/15 bg-white/10'}`}>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${index === 0 ? 'bg-red-500' : 'bg-blue-500'}`}>
                          {index + 1}
                        </span>
                        {label}
                      </div>
                      {index === 0 ? <p className="mt-2 text-lg font-black">{formatLandingMoney(campaign.enrollmentFee)}</p> : null}
                      {index === 2 ? <p className="mt-2 text-xs font-bold text-blue-100/70">{campaign.reEnrollmentLabel}</p> : null}
                    </div>
                    {index < 3 ? <ArrowRight className="hidden text-blue-300/70 sm:block" size={18} /> : null}
                  </React.Fragment>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-5">
                  <p className="text-xs font-black uppercase tracking-widest text-blue-200">Mensalidade regular</p>
                  <p className="mt-1 text-2xl font-black">{formatLandingMoney(campaign.regularMonthlyValue)}</p>
                </div>
                <div className="rounded-2xl border-2 border-red-400 bg-red-500 p-5 shadow-xl shadow-red-950/20">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white"><Check size={16} /> Até o vencimento</p>
                  <p className="mt-1 text-3xl font-black">{formatLandingMoney(campaign.punctualMonthlyValue)}</p>
                </div>
              </div>
              <p className="mt-4 text-xs font-semibold leading-relaxed text-blue-100/70">
                A oferta acima é informativa e exclusiva desta página. A confirmação da vaga e das condições é realizada com a secretaria.
              </p>
            </div>
          </div>
        </section>
      ) : data.turma.enrollmentFee > 0 ? (
        <div className="relative overflow-hidden rounded-[2.5rem] border border-blue-900/40 bg-gradient-to-r from-[#001a33] via-[#002b52] to-[#001a33] p-7 md:p-9 text-white shadow-xl">
          <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-300">
                <ShieldCheck size={14} className="text-blue-400" />
                <span>Plano de Investimento Transparente</span>
              </div>
              <h3 className="text-2xl font-black text-white md:text-3xl">Valores da Formação</h3>
              <p className="text-xs font-semibold text-blue-100/70">
                Matrícula garantida com processamento seguro e mensalidades sem juros abusivos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 md:gap-6">
              {/* Enrollment Fee Box */}
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md min-w-[160px]">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Taxa de Matrícula</p>
                <p className="mt-1 text-2xl font-black text-white">{formatLandingMoney(data.turma.enrollmentFee)}</p>
              </div>

              {/* Installments Box */}
              {data.turma.installments > 0 && data.turma.installmentValue > 0 ? (
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Mensalidades do Curso</p>
                  <p className="mt-1 text-lg font-black text-white">
                    {data.turma.installments}x de <span className="text-emerald-400">{formatLandingMoney(data.turma.installmentValue)}</span>
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default TechnicalClassSummary;
