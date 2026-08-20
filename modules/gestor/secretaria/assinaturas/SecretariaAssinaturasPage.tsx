import React, { useId, useState } from 'react';
import { Archive, FileSignature } from 'lucide-react';
import ElectronicSignatureInbox from '../../../shared/assinatura-eletronica/ElectronicSignatureInbox';
import SecretariaAssinaturasAcervo from './SecretariaAssinaturasAcervo';

interface SecretariaAssinaturasPageProps {
  contextId: string;
  poloId?: string | null;
}

type WorkspaceTab = 'inbox' | 'archive';

const workspaceTabs = [
  { id: 'inbox' as const, label: 'Caixa de assinaturas', icon: FileSignature },
  { id: 'archive' as const, label: 'Acervo assinado', icon: Archive },
];

const SecretariaAssinaturasPage: React.FC<SecretariaAssinaturasPageProps> = ({ contextId, poloId }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('inbox');
  const tabIdPrefix = `secretaria-signatures-${useId().replace(/:/gu, '')}`;

  const activateTabFromKeyboard = (event: React.KeyboardEvent, currentIndex: number) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % workspaceTabs.length;
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + workspaceTabs.length) % workspaceTabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = workspaceTabs.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    const targetTab = workspaceTabs[targetIndex];
    setActiveTab(targetTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`${tabIdPrefix}-${targetTab.id}-tab`)?.focus();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Áreas de assinaturas e acervo">
        {workspaceTabs.map((tab, index) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${tabIdPrefix}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => activateTabFromKeyboard(event, index)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-black uppercase tracking-wide transition ${
                selected
                  ? 'bg-white text-[#001a33] shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
              }`}
            >
              <Icon size={15} aria-hidden="true" /> {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${tabIdPrefix}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabIdPrefix}-${activeTab}-tab`}
        tabIndex={0}
      >
        {activeTab === 'inbox' ? (
          <ElectronicSignatureInbox
            audience="gestor"
            profile="GESTOR"
            contextId={contextId}
            heading="Caixa da Secretaria"
            poloId={poloId}
          />
        ) : (
          <SecretariaAssinaturasAcervo contextId={contextId} poloId={poloId} />
        )}
      </div>
    </div>
  );
};

export default SecretariaAssinaturasPage;
