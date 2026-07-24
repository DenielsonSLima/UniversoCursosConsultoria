import { Layers3, UserRound, UsersRound } from 'lucide-react';
import type { FinanceMode } from '../secretaria-financeira.types';

const modeItems = [
  {
    key: 'individual' as const,
    icon: UserRound,
    title: 'Individual',
    description: 'Consulte o financeiro completo de um aluno.',
  },
  {
    key: 'lote' as const,
    icon: UsersRound,
    title: 'Lote',
    description: 'Agrupe por curso e confira os alunos vinculados.',
  },
  {
    key: 'custom' as const,
    icon: Layers3,
    title: 'Personalizado',
    description: 'Monte uma seleção de alunos e cursos.',
  },
];

type FinanceModeNavigationProps = {
  mode: FinanceMode;
  onChange: (mode: FinanceMode) => void;
};

const FinanceModeNavigation = ({
  mode,
  onChange,
}: FinanceModeNavigationProps) => (
  <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-3">
    {modeItems.map(({ key, icon: Icon, title, description }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${
          mode === key
            ? 'border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm'
            : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'
        }`}
      >
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
          mode === key ? 'bg-cyan-700 text-white' : 'bg-white text-slate-500'
        }`}>
          <Icon size={19} />
        </span>
        <span>
          <span className="block text-xs font-black uppercase tracking-wider">{title}</span>
          <span className="mt-1 block text-[11px] font-semibold leading-snug">{description}</span>
        </span>
      </button>
    ))}
  </div>
);

export default FinanceModeNavigation;
