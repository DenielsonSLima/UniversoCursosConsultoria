import React from 'react';
import { BookOpenCheck, CalendarRange, Clock, MapPin, ShieldCheck } from 'lucide-react';
import type { TechnicalLandingData } from '../technicalLanding.types';
import { formatLandingDate, formatLandingMoney } from './technicalLanding.utils';

interface TechnicalClassSummaryProps {
  data: TechnicalLandingData;
}

const TechnicalClassSummary: React.FC<TechnicalClassSummaryProps> = ({ data }) => {
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

      {/* Investment & Tuition Plan Box - Brand Navy System Style */}
      {data.turma.enrollmentFee > 0 ? (
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
