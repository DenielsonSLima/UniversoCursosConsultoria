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
  <nav className="config-tabs flex overflow-x-auto" aria-label="Seções da consulta Banese">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        aria-pressed={activeTab === tab.id}
        data-active={activeTab === tab.id}
        className={`min-h-11 shrink-0 border-b-2 border-transparent px-3 text-[13px] font-medium transition ${
          activeTab === tab.id
            ? 'border-blue-600 text-blue-700'
            : 'text-slate-500 hover:text-blue-700'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

export default BaneseTabsNav;
