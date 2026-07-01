import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Briefcase,
  CalendarClock,
  GraduationCap,
  Loader2,
  MonitorPlay,
  Users,
} from 'lucide-react';
import { type GestaoResumoModalidade, gestaoService } from '../gestao.service';

interface GestaoResumoProps {
  poloId?: string;
}

type ModalidadeKey = GestaoResumoModalidade['modalidade'];

interface ModalidadeVisual {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>;
  border: string;
  iconClass: string;
  valueClass: string;
  markerClass: string;
}

const modalidadeVisual: Record<ModalidadeKey, ModalidadeVisual> = {
  TECNICO: {
    icon: Briefcase,
    border: 'border-blue-100',
    iconClass: 'bg-blue-50 text-blue-700',
    valueClass: 'text-blue-700',
    markerClass: 'bg-blue-600',
  },
  LIVRE: {
    icon: GraduationCap,
    border: 'border-violet-100',
    iconClass: 'bg-violet-50 text-violet-700',
    valueClass: 'text-violet-700',
    markerClass: 'bg-violet-600',
  },
  ESPECIALIZACAO: {
    icon: BookOpen,
    border: 'border-emerald-100',
    iconClass: 'bg-emerald-50 text-emerald-700',
    valueClass: 'text-emerald-700',
    markerClass: 'bg-emerald-600',
  },
  EAD: {
    icon: MonitorPlay,
    border: 'border-orange-100',
    iconClass: 'bg-orange-50 text-orange-700',
    valueClass: 'text-orange-700',
    markerClass: 'bg-orange-600',
  },
};

const fmtNumber = (value: number) => value.toLocaleString('pt-BR');

const defaultCards: GestaoResumoModalidade[] = [
  { modalidade: 'TECNICO', label: 'Técnico', turmasAtivas: 0, alunos: 0, inscricoesMesAtual: null },
  { modalidade: 'LIVRE', label: 'Livre', turmasAtivas: 0, alunos: 0, inscricoesMesAtual: null },
  { modalidade: 'ESPECIALIZACAO', label: 'Especialização', turmasAtivas: 0, alunos: 0, inscricoesMesAtual: null },
  { modalidade: 'EAD', label: 'EAD', turmasAtivas: 0, alunos: 0, inscricoesMesAtual: 0 },
];

const buildCards = (data: any, showEad: boolean): GestaoResumoModalidade[] => {
  const rpcCards = Array.isArray(data?.cards) ? data.cards : [];
  const sourceCards = rpcCards.length > 0 ? rpcCards : defaultCards;

  return sourceCards
    .filter((card) => showEad || card.modalidade !== 'EAD')
    .map((card) => {
      const fallback = defaultCards.find((item) => item.modalidade === card.modalidade)!;
      const turmasFromLegacy = data?.turmasPorTipo?.[card.modalidade];
      const alunosFromLegacy = data?.alunosPorTipo?.[card.modalidade];

      return {
        ...fallback,
        ...card,
        turmasAtivas: Number(card.turmasAtivas ?? turmasFromLegacy ?? fallback.turmasAtivas),
        alunos: Number(card.alunos ?? alunosFromLegacy ?? fallback.alunos),
        inscricoesMesAtual: card.modalidade === 'EAD'
          ? Number(card.inscricoesMesAtual ?? data?.totalInscricoesEadMesAtual ?? fallback.inscricoesMesAtual ?? 0)
          : null,
      };
    });
};

const MetricBlock: React.FC<{
  label: string;
  value: number;
  valueClass?: string;
  icon?: React.ReactNode;
}> = ({ label, value, valueClass = 'text-[#001a33]', icon }) => (
  <div className="min-w-0">
    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <p className={`text-3xl font-black leading-none ${valueClass}`}>{fmtNumber(value)}</p>
  </div>
);

const ModalidadeCard: React.FC<{ card: GestaoResumoModalidade }> = ({ card }) => {
  const visual = modalidadeVisual[card.modalidade];
  const Icon = visual.icon;
  const isEad = card.modalidade === 'EAD';

  return (
    <article className={`relative overflow-hidden rounded-2xl border ${visual.border} bg-white p-5 shadow-sm`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${visual.markerClass}`} />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Modalidade</p>
          <h3 className="mt-1 truncate text-lg font-black uppercase tracking-tight text-[#001a33]">
            {card.label}
          </h3>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${visual.iconClass}`}>
          <Icon size={21} />
        </div>
      </div>

      <div className={`mt-6 grid gap-5 ${isEad ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <MetricBlock
          label="Turmas ativas"
          value={card.turmasAtivas}
          valueClass={visual.valueClass}
          icon={<Briefcase size={12} />}
        />
        <MetricBlock
          label="Alunos"
          value={card.alunos}
          icon={<Users size={12} />}
        />
        {isEad && (
          <MetricBlock
            label="Inscrições mês atual"
            value={card.inscricoesMesAtual ?? 0}
            valueClass="text-orange-700"
            icon={<CalendarClock size={12} />}
          />
        )}
      </div>
    </article>
  );
};

const GestaoResumo: React.FC<GestaoResumoProps> = ({ poloId }) => {
  const queryKey = ['gestao-resumo-kpis', poloId || 'matriz-global'];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => gestaoService.getGestaoResumoKpis(poloId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-sm font-bold text-slate-500">
        <Loader2 className="mr-3 animate-spin text-[#001a33]" size={22} />
        Carregando resumo da gestão...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">
        Não foi possível carregar os indicadores de resumo.
      </div>
    );
  }

  const cards = buildCards(data, !poloId);

  return (
    <div className="animate-fadeIn space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Resumo operacional</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">Modalidades em andamento</h2>
        </div>
        <p className="text-xs font-bold text-slate-400">Atualização em tempo real</p>
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {cards.map((card) => (
          <ModalidadeCard key={card.modalidade} card={card} />
        ))}
      </section>
    </div>
  );
};

export default GestaoResumo;
