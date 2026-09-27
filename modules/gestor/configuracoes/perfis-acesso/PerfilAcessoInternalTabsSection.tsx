import React from 'react';
import { Info } from 'lucide-react';
import { SECRETARIA_ACCESS_OPTIONS } from '../../secretaria/secretaria-access';
import { GESTOR_CADASTRO_NAVIGATION } from '../../gestor-navigation.config';

const INTERNAL_TABS = {
  gestao: [
    { id: 'resumo', label: 'Resumo' },
    { id: 'alunos', label: 'Alunos' },
    { id: 'grade', label: 'Grade e Professores / Aulas' },
    { id: 'atividades', label: 'Atividades' },
    { id: 'diarios', label: 'Diários' },
    { id: 'financeiro', label: 'Financeiro da Turma' },
    { id: 'vacinas', label: 'Vacinas' },
    { id: 'estagio', label: 'Estágio' },
    { id: 'academico', label: 'Ciclo Acadêmico' },
    { id: 'configuracoes', label: 'Configurações da Turma' },
  ],
  financeiro: [
    { id: 'resumo', label: 'Resumo / Visão Geral' },
    { id: 'receber', label: 'Contas a Receber' },
    { id: 'despesas', label: 'Contas a Pagar' },
    { id: 'emprestimos', label: 'Empréstimos (somente Matriz)' },
    { id: 'convenios', label: 'Convênios' },
    { id: 'transferencias', label: 'Transferências' },
    { id: 'conciliacao-bancaria', label: 'Conciliação Bancária' },
    { id: 'outros-debitos', label: 'Outros Débitos' },
    { id: 'outros-creditos', label: 'Outros Créditos' },
  ],
  secretaria: [...SECRETARIA_ACCESS_OPTIONS],
  cadastros: GESTOR_CADASTRO_NAVIGATION.map((item) => ({ ...item })),
  comunicacao: [
    { id: 'comunicacao-mensagem', label: 'Atendimento — Portal e app' },
    { id: 'comunicacao-whatsapp', label: 'Atendimento — WhatsApp e operações' },
    { id: 'comunicacao-automacoes', label: 'Automações multicanal' },
  ],
} as const;

const INTERNAL_SECTIONS: Array<{
  moduleId: keyof typeof INTERNAL_TABS;
  title: string;
  description?: string;
}> = [
  { moduleId: 'gestao', title: 'Acesso Interno: Turmas da Gestão', description: 'Aplicado às turmas técnicas, livres, de especialização e EAD.' },
  { moduleId: 'financeiro', title: 'Acesso Interno: Financeiro' },
  { moduleId: 'secretaria', title: 'Acesso Interno: Secretaria' },
  { moduleId: 'cadastros', title: 'Acesso Interno: Formações' },
  { moduleId: 'comunicacao', title: 'Áreas de Comunicação' },
];

interface PerfilAcessoInternalTabsSectionProps {
  selectedModules: string[];
  selectedTabs: Record<string, string[]>;
  onToggleTab: (moduleId: string, tabId: string) => void;
}

const PerfilAcessoInternalTabsSection: React.FC<PerfilAcessoInternalTabsSectionProps> = ({
  selectedModules,
  selectedTabs,
  onToggleTab,
}) => {
  const visibleSections = INTERNAL_SECTIONS.filter(({ moduleId }) => selectedModules.includes(moduleId));
  if (!visibleSections.length) return null;

  return (
    <section className="space-y-6">
      <h4 className="flex items-center gap-2 border-b border-slate-100 pb-3 text-base font-bold text-[#001a33]">
        <Info size={18} className="text-amber-500" />
        Abas Internas e Submódulos
      </h4>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {visibleSections.map(({ moduleId, title, description }) => (
          <div key={moduleId} className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <div>
              <h5 className="text-sm font-bold text-[#001a33]">{title}</h5>
              {description ? <p className="mt-1 text-xs font-medium text-slate-500">{description}</p> : null}
            </div>
            <div className="space-y-3">
              {INTERNAL_TABS[moduleId].map((tab) => {
                const isChecked = (selectedTabs[moduleId] || []).includes(tab.id);
                return (
                  <label key={tab.id} className="flex cursor-pointer select-none items-center gap-3 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleTab(moduleId, tab.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{tab.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PerfilAcessoInternalTabsSection;
