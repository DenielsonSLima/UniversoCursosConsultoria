import { useRef, type ComponentRef, type KeyboardEvent } from 'react';
import { Layers3, UserRound, UsersRound } from 'lucide-react';
import type { CarnesAlunosMode } from '../carnes-alunos.types';

const modes = [
  {
    id: 'individual' as const,
    icon: UserRound,
    title: 'Individual',
    description: 'Escolha uma matrícula e prepare seu documento.',
  },
  {
    id: 'batch' as const,
    icon: UsersRound,
    title: 'Lote',
    description: 'Filtre curso e turma para montar um lote.',
  },
  {
    id: 'custom' as const,
    icon: Layers3,
    title: 'Personalizado',
    description: 'Combine matrículas de cursos diferentes.',
  },
];

interface CarnesModeNavigationProps {
  mode: CarnesAlunosMode;
  disabled?: boolean;
  onChange: (mode: CarnesAlunosMode) => void;
}

const CarnesModeNavigation = ({
  mode,
  disabled,
  onChange,
}: CarnesModeNavigationProps) => {
  const tabRefs = useRef<Array<ComponentRef<'button'> | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<ComponentRef<'button'>>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % modes.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + modes.length) % modes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = modes.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(modes[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-3" role="tablist" aria-label="Modo de seleção dos carnês">
      {modes.map(({ id, icon: Icon, title, description }, index) => {
        const active = mode === id;
        return (
          <button
            key={id}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`carnes-mode-tab-${id}`}
            type="button"
            role="tab"
            aria-controls="carnes-alunos-workspace"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm'
                : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 hover:bg-white'
            }`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              active ? 'bg-emerald-700 text-white' : 'bg-white text-slate-500'
            }`}>
              <Icon size={19} />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-wider">{title}</span>
              <span className="mt-1 block text-[11px] font-semibold leading-snug">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default CarnesModeNavigation;
