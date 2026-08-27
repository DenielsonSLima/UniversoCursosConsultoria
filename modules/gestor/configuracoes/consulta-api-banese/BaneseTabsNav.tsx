export type BaneseTabId =
  | 'overview'
  | 'profiles'
  | 'runs'
  | 'queries'
  | 'settlements'
  | 'errors'
  | 'audit';

const tabs: Array<{ id: BaneseTabId; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'profiles', label: 'Perfis' },
  { id: 'runs', label: 'Execuções' },
  { id: 'queries', label: 'Consultas' },
  { id: 'settlements', label: 'Baixas' },
  { id: 'errors', label: 'Erros' },
  { id: 'audit', label: 'Auditoria' },
];

interface BaneseTabsNavProps {
  activeTab: BaneseTabId;
  onChange: (tab: BaneseTabId) => void;
}

const BaneseTabsNav = ({ activeTab, onChange }: BaneseTabsNavProps) => (
  <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções da consulta Banese">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        aria-pressed={activeTab === tab.id}
        className={`min-h-11 shrink-0 rounded-xl px-4 text-[10px] font-black uppercase tracking-wider transition ${
          activeTab === tab.id
            ? 'bg-blue-600 text-white shadow-md'
            : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

export default BaneseTabsNav;
