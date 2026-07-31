import {
  Ban,
  CheckCircle2,
  Clock3,
  CreditCard,
  GraduationCap,
  LoaderCircle,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';
import { normalizeStatus } from '../dependencias-academicas.utils';

const PRESENTATION: Record<string, {
  label: string;
  classes: string;
  icon: typeof Clock3;
}> = {
  PENDENTE_ENCAMINHAMENTO: {
    label: 'Aguardando encaminhamento',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: RotateCcw,
  },
  AGUARDANDO_OFERTA: {
    label: 'Sem oferta disponível',
    classes: 'border-orange-200 bg-orange-50 text-orange-800',
    icon: Clock3,
  },
  AGUARDANDO_PAGAMENTO: {
    label: 'Aguardando pagamento',
    classes: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    icon: CreditCard,
  },
  PAGAMENTO_PROCESSANDO: {
    label: 'Pagamento em processamento',
    classes: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: LoaderCircle,
  },
  PROGRAMADA: {
    label: 'Programada',
    classes: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: Clock3,
  },
  EM_CURSO: {
    label: 'Em curso',
    classes: 'border-sky-200 bg-sky-50 text-sky-800',
    icon: PlayCircle,
  },
  AGUARDANDO_RESULTADO: {
    label: 'Aguardando resultado',
    classes: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    icon: GraduationCap,
  },
  CONCLUIDA_APROVADA: {
    label: 'Concluída · aprovada',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  CONCLUIDA_REPROVADA: {
    label: 'Concluída · reprovada',
    classes: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: Ban,
  },
  CANCELADA: {
    label: 'Cancelada',
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: Ban,
  },
  DISPENSADA: {
    label: 'Dispensada',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  ENCERRADA: {
    label: 'Encerrada',
    classes: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: CheckCircle2,
  },
};

interface DependenciaStatusBadgeProps {
  status: string;
}

const DependenciaStatusBadge = ({ status }: DependenciaStatusBadgeProps) => {
  const normalized = normalizeStatus(status);
  const presentation = PRESENTATION[normalized] || {
    label: normalized.replaceAll('_', ' ').toLowerCase(),
    classes: 'border-slate-200 bg-slate-50 text-slate-700',
    icon: Clock3,
  };
  const Icon = presentation.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${presentation.classes}`}>
      <Icon size={11} className={normalized === 'PAGAMENTO_PROCESSANDO' ? 'animate-spin' : ''} />
      {presentation.label}
    </span>
  );
};

export default DependenciaStatusBadge;
