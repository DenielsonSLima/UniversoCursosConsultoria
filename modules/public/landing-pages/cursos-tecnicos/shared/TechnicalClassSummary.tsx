import React from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarRange,
  Check,
  Clock,
  Info,
  MapPin,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import type { TechnicalLandingConfig, TechnicalLandingData } from '../technicalLanding.types';
import {
  formatLandingDate,
  formatLandingMoney,
  getTechnicalFinancialSummary,
} from './technicalLanding.utils';

interface TechnicalClassSummaryProps {
  data: TechnicalLandingData;
  config: TechnicalLandingConfig;
}

const TechnicalClassSummary: React.FC<TechnicalClassSummaryProps> = ({ data }) => {
  const financial = getTechnicalFinancialSummary(data.turma);
  const hasFinancialDetails = data.turma.enrollmentFee > 0
    || data.turma.reEnrollmentFee > 0
    || financial.hasInstallment;
  const items = [
    { icon: MapPin, label: 'Polo de Ensino', value: `${data.polo.name} · ${data.polo.city}/${data.polo.state}` },
    { icon: Clock, label: 'Turno das Aulas', value: data.turma.shift },
    { icon: CalendarRange, label: 'Previsão de Início', value: formatLandingDate(data.turma.startDate) },
    {
      icon: BookOpenCheck,
      label: 'Carga Horária',
      value: data.course.workloadHours > 0 ? `${data.course.workloadHours} horas` : 'Consulte a coordenação',
    },
  ];
  const paymentSequence = [
    data.turma.enrollmentFee > 0 ? `Matrícula ${formatLandingMoney(data.turma.enrollmentFee)}` : null,
    data.turma.installments > 0 ? `${data.turma.installments} mensalidades por ciclo` : null,
    data.turma.reEnrollmentFee > 0 ? `Rematrícula ${formatLandingMoney(data.turma.reEnrollmentFee)}` : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <section className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-md motion-reduce:transform-none"
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

      {hasFinancialDetails ? (
        <section
          aria-labelledby="investment-title"
          className="relative overflow-hidden rounded-[2.5rem] bg-[#001532] px-6 py-8 text-white shadow-[0_28px_80px_-34px_rgba(0,31,91,0.85)] md:px-10 md:py-11"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border-[42px] border-blue-500/15" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-2/5 bg-[radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_68%)]" />

          <div className="relative grid gap-9 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-300/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100">
                <ShieldCheck size={15} /> Investimento transparente
              </div>
              <h2 id="investment-title" className="mt-4 text-3xl font-black leading-tight tracking-[-0.035em] md:text-4xl">
                Quanto você vai investir
              </h2>
              <p className="mt-3 max-w-md text-sm font-semibold leading-relaxed text-blue-100/70">
                Valores e condição de pontualidade cadastrados diretamente nesta turma.
              </p>

              {data.turma.enrollmentFee > 0 || data.turma.reEnrollmentFee > 0 ? (
                <div className="mt-6 grid max-w-md gap-3 sm:grid-cols-2">
                  {data.turma.enrollmentFee > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Matrícula</p>
                      <p className="mt-1 text-lg font-black">{formatLandingMoney(data.turma.enrollmentFee)}</p>
                    </div>
                  ) : null}
                  {data.turma.reEnrollmentFee > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Rematrícula</p>
                      <p className="mt-1 text-lg font-black">{formatLandingMoney(data.turma.reEnrollmentFee)}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {financial.hasInstallment ? (
              <div>
                <div className={`grid overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.07] ${financial.hasPunctualDiscount ? 'sm:grid-cols-[0.82fr_1.18fr]' : ''}`}>
                  <div className="p-5 sm:p-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.17em] text-blue-200">Mensalidade cadastrada na turma</p>
                    <p className={`mt-2 text-2xl font-black ${financial.hasPunctualDiscount ? 'text-white/75 line-through decoration-red-400 decoration-2' : 'text-white'}`}>
                      {formatLandingMoney(financial.regularInstallmentValue)}
                    </p>
                    {data.turma.installments > 0 ? (
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-100/55">
                        {data.turma.installments} mensalidades por ciclo.
                      </p>
                    ) : null}
                  </div>
                  {financial.hasPunctualDiscount ? (
                    <div className="border-t border-emerald-300/40 bg-emerald-400 p-5 text-emerald-950 sm:border-l sm:border-t-0 sm:p-6">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.17em]"><Check size={16} strokeWidth={3} /> Pagando até o vencimento</p>
                      <p className="mt-1 text-4xl font-black tracking-[-0.04em]">{formatLandingMoney(financial.payableInstallmentValue)}</p>
                      <p className="mt-1 text-xs font-black">por mensalidade</p>
                    </div>
                  ) : null}
                </div>

                {financial.hasPunctualDiscount ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4">
                      <Tag className="shrink-0 text-emerald-300" size={21} />
                      <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-200">Desconto por mensalidade</p><p className="text-xl font-black">{formatLandingMoney(financial.punctualDiscount)}</p></div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <ShieldCheck className="shrink-0 text-blue-300" size={21} />
                      <div><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Quando o desconto vale</p><p className="text-xl font-black">Até o vencimento</p></div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {paymentSequence.length > 0 ? (
            <div className="relative mt-8 border-t border-white/10 pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wide text-blue-100/70">
                  {paymentSequence.map((label, index) => (
                    <React.Fragment key={label}>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2">{label}</span>
                      {index < paymentSequence.length - 1 ? <ArrowRight size={14} className="text-blue-300/50" /> : null}
                    </React.Fragment>
                  ))}
                </div>
                {financial.hasPunctualDiscount ? (
                  <p className="flex max-w-lg items-start gap-2 text-[11px] font-semibold leading-relaxed text-blue-100/55">
                    <Info className="mt-0.5 shrink-0" size={14} />
                    O desconto cadastrado é aplicado à mensalidade paga até o vencimento. Depois disso, permanece o valor integral, sujeito às regras financeiras revisadas na matrícula.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
};

export default TechnicalClassSummary;
