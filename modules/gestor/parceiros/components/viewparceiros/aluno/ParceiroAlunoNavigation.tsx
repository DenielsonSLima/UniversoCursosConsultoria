import { useRef, type ComponentRef } from 'react';
import { BookOpen, ChevronDown, ClipboardList, DollarSign, FileText, KeyRound, ScrollText, Syringe, User } from 'lucide-react';

export const alunoTabs = [
  { id: 'dados', label: 'Cadastro', icon: User },
  { id: 'cursos', label: 'Cursos', icon: BookOpen },
  { id: 'matriculas', label: 'Matrículas', icon: ClipboardList },
  { id: 'docs', label: 'Documentos', icon: FileText },
  { id: 'vacinas', label: 'Vacinas', icon: Syringe },
  { id: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { id: 'secretaria', label: 'Secretaria', icon: ScrollText },
  { id: 'acesso', label: 'Acesso', icon: KeyRound },
] as const;

export type AlunoTab = typeof alunoTabs[number]['id'];

interface Props {
  activeTab: AlunoTab;
  disabled: boolean;
  onSelect: (tab: AlunoTab) => void;
}

export default function ParceiroAlunoNavigation({ activeTab, disabled, onSelect }: Props) {
  const tabRefs = useRef<Array<ComponentRef<'button'> | null>>([]);

  return (
    <>
      <div className="pb-4 xl:hidden">
        <label htmlFor="aluno-area" className="mb-1.5 block text-xs font-medium text-slate-600">Área do aluno</label>
        <div className="relative">
        <select id="aluno-area" value={activeTab} disabled={disabled}
          onChange={(event) => onSelect(event.target.value as AlunoTab)}
          className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-base text-[#001a33] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
          {alunoTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 text-slate-500" />
        </div>
      </div>
      <div role="tablist" aria-label="Áreas do aluno" className="hidden items-center gap-1 xl:flex">
        {alunoTabs.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} ref={(element) => { tabRefs.current[index] = element; }}
              id={`aluno-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id}
              aria-controls={`aluno-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
              disabled={disabled} onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                let next: number;
                if (event.key === 'ArrowRight') next = (index + 1) % alunoTabs.length;
                else if (event.key === 'ArrowLeft') next = (index - 1 + alunoTabs.length) % alunoTabs.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = alunoTabs.length - 1;
                else return;
                event.preventDefault();
                tabRefs.current[next]?.focus();
              }}
              className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-60 ${activeTab === tab.id
                ? 'border-blue-600 text-[#001a33]'
                : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-[#001a33]'}`}>
              <Icon size={16} aria-hidden="true" />{tab.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
