import {
  Banknote,
  BookOpenCheck,
  CalendarClock,
  CircleCheckBig,
} from 'lucide-react';
import type { DependenciaAcademica } from '../dependencias-academicas.types';
import { normalizeStatus } from '../dependencias-academicas.utils';

interface DependenciasKpisProps {
  items: DependenciaAcademica[];
}

const DependenciasKpis = ({ items }: DependenciasKpisProps) => {
  const values = {
    encaminhamento: items.filter(
      (item) => normalizeStatus(item.status) === 'PENDENTE_ENCAMINHAMENTO',
    ).length,
    pagamento: items.filter((item) => [
      'AGUARDANDO_PAGAMENTO',
      'PAGAMENTO_PROCESSANDO',
    ].includes(normalizeStatus(item.status))).length,
    programadas: items.filter((item) => [
      'PROGRAMADA',
      'EM_CURSO',
      'AGUARDANDO_RESULTADO',
    ].includes(normalizeStatus(item.status))).length,
    aprovadas: items.filter(
      (item) => normalizeStatus(item.status) === 'CONCLUIDA_APROVADA',
    ).length,
  };
  const cards = [
    {
      label: 'Aguardando encaminhamento',
      value: values.encaminhamento,
      icon: BookOpenCheck,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    {
      label: 'Aguardando pagamento',
      value: values.pagamento,
      icon: Banknote,
      tone: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    },
    {
      label: 'Programadas / em curso',
      value: values.programadas,
      icon: CalendarClock,
      tone: 'border-blue-200 bg-blue-50 text-blue-800',
    },
    {
      label: 'Aprovadas no período',
      value: values.aprovadas,
      icon: CircleCheckBig,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article key={card.label} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="max-w-[12rem] text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-80">
                {card.label}
              </p>
              <Icon size={18} className="shrink-0 opacity-75" />
            </div>
            <p className="mt-3 text-3xl font-black tracking-tight">{card.value}</p>
          </article>
        );
      })}
    </section>
  );
};

export default DependenciasKpis;
