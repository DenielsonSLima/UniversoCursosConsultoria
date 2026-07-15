import React from 'react';
import { BookOpenCheck, CalendarRange, Clock, MapPin, Users } from 'lucide-react';
import type { TechnicalLandingData } from '../technicalLanding.types';
import { formatLandingDate, formatLandingMoney } from './technicalLanding.utils';

interface TechnicalClassSummaryProps {
  data: TechnicalLandingData;
}

const TechnicalClassSummary: React.FC<TechnicalClassSummaryProps> = ({ data }) => {
  const items = [
    { icon: MapPin, label: 'Polo', value: `${data.polo.name} · ${data.polo.city}/${data.polo.state}` },
    { icon: Clock, label: 'Turno', value: data.turma.shift },
    { icon: CalendarRange, label: 'Início', value: formatLandingDate(data.turma.startDate) },
    {
      icon: Users,
      label: 'Vagas',
      value: data.turma.totalSeats > 0
        ? `${data.turma.availableSeats} disponíveis de ${data.turma.totalSeats}`
        : 'Consulte a unidade',
    },
    { icon: BookOpenCheck, label: 'Carga horária', value: `${data.course.workloadHours} horas` },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <Icon className="text-blue-600" size={20} />
          <p className="mt-4 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-black leading-snug text-[#001a33]">{value}</p>
        </div>
      ))}
      {data.turma.enrollmentFee > 0 ? (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 sm:col-span-2 xl:col-span-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Matrícula</p>
          <p className="mt-1 text-lg font-black text-emerald-900">{formatLandingMoney(data.turma.enrollmentFee)}</p>
          {data.turma.installments > 0 && data.turma.installmentValue > 0 ? (
            <p className="mt-1 text-xs font-semibold text-emerald-800/75">
              Mensalidades: {data.turma.installments} parcelas de {formatLandingMoney(data.turma.installmentValue)}.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default TechnicalClassSummary;
