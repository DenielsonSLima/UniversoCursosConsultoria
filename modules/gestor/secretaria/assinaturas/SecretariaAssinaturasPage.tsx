import React, { useId, useState } from 'react';
import {
  Archive,
  BookOpenCheck,
  FileCheck2,
  FileSignature,
  GraduationCap,
} from 'lucide-react';
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

const documentCards = [
  {
    id: 'diarios',
    label: 'Diários',
    description: 'Professor e coordenação',
    icon: BookOpenCheck,
    enabled: true,
  },
  {
    id: 'contratos',
    label: 'Contratos',
    description: 'Assinatura ainda não habilitada',
    icon: FileCheck2,
    enabled: false,
  },
  {
    id: 'matriculas',
    label: 'Matrículas',
    description: 'Assinatura ainda não habilitada',
    icon: GraduationCap,
    enabled: false,
  },
] as const;

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
      <section aria-labelledby={`${tabIdPrefix}-document-types`} className="space-y-2">
        <div>
          <p id={`${tabIdPrefix}-document-types`} className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Tipos de documento
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            Selecione o fluxo de assinatura e consulte o respectivo acervo.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {documentCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                disabled={!card.enabled}
                aria-current={card.enabled ? 'page' : undefined}
                title={card.enabled ? card.label : `${card.label}: ${card.description}`}
                className={`flex min-h-24 items-center gap-3 rounded-2xl border p-4 text-left transition ${
                  card.enabled
                    ? 'border-blue-200 bg-blue-50 text-blue-950 shadow-sm ring-1 ring-blue-100'
                    : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.enabled ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-black">{card.label}</span>
                  <span className="mt-1 block text-[10px] font-bold leading-snug">{card.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Áreas do módulo Assinaturas">
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
