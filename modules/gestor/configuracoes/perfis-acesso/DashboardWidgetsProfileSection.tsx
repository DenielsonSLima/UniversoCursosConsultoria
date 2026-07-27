import {
  Activity,
  AlertTriangle,
  Check,
  DollarSign,
  GraduationCap,
  LayoutDashboard,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type { DashboardWidgetId } from '../../access-control';

const WIDGET_OPTIONS: Array<{
  id: DashboardWidgetId;
  label: string;
  description: string;
  requirement: string;
  icon: typeof Users;
  tone: string;
}> = [
  {
    id: 'alunos-ativos',
    label: 'Alunos ativos',
    description: 'Quantidade e variação de alunos ativos.',
    requirement: 'Parceiros, Gestão (Resumo/Alunos) ou Secretaria (Busca de Aluno)',
    icon: Users,
    tone: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'matriculas-mes',
    label: 'Matrículas do mês',
    description: 'Novas matrículas e comparação mensal.',
    requirement: 'Parceiros, Gestão (Resumo/Alunos) ou Secretaria (Busca de Aluno)',
    icon: GraduationCap,
    tone: 'bg-indigo-50 text-indigo-600',
  },
  {
    id: 'receita-mes',
    label: 'Receita do mês',
    description: 'Valor recebido e variação mensal.',
    requirement: 'Financeiro: Resumo ou Contas a Receber',
    icon: DollarSign,
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'inadimplencia',
    label: 'Inadimplência',
    description: 'Percentual consolidado de valores vencidos.',
    requirement: 'Financeiro: Resumo ou Contas a Receber',
    icon: AlertTriangle,
    tone: 'bg-rose-50 text-rose-600',
  },
  {
    id: 'fluxo-caixa',
    label: 'Desempenho de caixa',
    description: 'Entradas e saídas liquidadas dos últimos meses.',
    requirement: 'Financeiro: Resumo / Visão Geral',
    icon: TrendingUp,
    tone: 'bg-cyan-50 text-cyan-700',
  },
  {
    id: 'acoes-rapidas',
    label: 'Ações rápidas',
    description: 'Atalhos compatíveis com os módulos concedidos.',
    requirement: 'Parceiros, Cadastros ou Caixa',
    icon: Zap,
    tone: 'bg-amber-50 text-amber-600',
  },
  {
    id: 'atividade-recente',
    label: 'Atividade recente',
    description: 'Eventos filtrados conforme a área autorizada.',
    requirement: 'Área acadêmica, Financeiro ou Biblioteca',
    icon: Activity,
    tone: 'bg-slate-100 text-slate-600',
  },
];

interface DashboardWidgetsProfileSectionProps {
  selected: DashboardWidgetId[];
  eligible: DashboardWidgetId[];
  onToggle: (widgetId: DashboardWidgetId) => void;
}

const DashboardWidgetsProfileSection = ({
  selected,
  eligible,
  onToggle,
}: DashboardWidgetsProfileSectionProps) => {
  const eligibleSet = new Set(eligible);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-[#f7faff]">
      <div className="flex flex-col gap-4 border-b border-blue-100 bg-[#001a33] px-6 py-5 text-white md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-blue-200">
            <LayoutDashboard size={20} />
          </span>
          <div>
            <h4 className="flex items-center gap-2 text-base font-bold">
              Tela inicial do perfil <Sparkles size={15} className="text-amber-300" />
            </h4>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-blue-100/75">
              Escolha os indicadores que este perfil verá. Um item nunca é liberado sem o módulo
              correspondente, mesmo que esteja marcado.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-100">
          {selected.length} selecionado{selected.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {WIDGET_OPTIONS.map((option) => {
          const available = eligibleSet.has(option.id);
          const checked = available && selected.includes(option.id);
          const Icon = option.icon;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={checked}
              disabled={!available}
              onClick={() => onToggle(option.id)}
              className={`group flex min-h-36 items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                checked
                  ? 'border-blue-400 bg-white shadow-lg shadow-blue-950/5'
                  : available
                    ? 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md'
                    : 'cursor-not-allowed border-slate-100 bg-slate-100/70 opacity-55'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${option.tone}`}>
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-[#001a33]">{option.label}</span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    checked
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-transparent'
                  }`}>
                    <Check size={11} strokeWidth={3} />
                  </span>
                </span>
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">
                  {option.description}
                </span>
                <span className={`mt-3 block text-[9px] font-bold uppercase leading-relaxed tracking-wide ${
                  available ? 'text-blue-600' : 'text-slate-400'
                }`}>
                  {available ? 'Permitido pelo acesso atual' : `Requer: ${option.requirement}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DashboardWidgetsProfileSection;
