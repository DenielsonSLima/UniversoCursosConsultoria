import React from 'react';
import { Check, Clock, Info, Loader2, ShieldAlert } from 'lucide-react';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' }
];

const MODULE_OPTIONS = [
  { id: 'inicio', label: 'Início (Dashboard)' },
  { id: 'parceiros', label: 'Parceiros' },
  { id: 'cadastros', label: 'Cadastros' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'secretaria', label: 'Secretaria' },
  { id: 'caixa', label: 'Caixa' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'configuracoes', label: 'Configurações' }
];

const CADASTROS_SUB_TABS = [
  { id: 'cadastros-checklist', label: 'Check List Estágio' },
  { id: 'cadastros-ead', label: 'Cursos EAD' },
  { id: 'cadastros-especializacao', label: 'Cursos Especialização' },
  { id: 'cadastros-livres', label: 'Cursos Livres' },
  { id: 'cadastros-tecnicos', label: 'Cursos Técnicos' },
  { id: 'cadastros-superior', label: 'Ensino Superior' },
  { id: 'cadastros-ficha', label: 'Ficha Matrícula' },
  { id: 'cadastros-modelos', label: 'Modelos Documentos' }
];

const FINANCEIRO_TABS = [
  { id: 'resumo', label: 'Resumo / Visão Geral' },
  { id: 'receber', label: 'Contas a Receber' },
  { id: 'despesas', label: 'Contas a Pagar (Despesas)' },
  { id: 'transferencias', label: 'Transferências' },
  { id: 'outros-debitos', label: 'Outros Débitos' },
  { id: 'outros-creditos', label: 'Outros Créditos' }
];

const SECRETARIA_TABS = [
  { id: 'solicitacoes', label: 'Solicitações' },
  { id: 'carteirinhas', label: 'Carteirinhas de Estudante' },
  { id: 'declaracoes', label: 'Declaração de Matrícula' },
  { id: 'historico', label: 'Histórico de Emissões' },
  { id: 'recebimentos', label: 'Recebimentos / Baixa' }
];

const COMUNICACAO_TABS = [
  { id: 'comunicacao-mensagem', label: 'Mensagens internas' },
  { id: 'comunicacao-whatsapp', label: 'WhatsApp' }
];

interface PerfilAcessoFormProps {
  editingId: string | null;
  nome: string;
  descricao: string;
  selectedModules: string[];
  selectedTabs: Record<string, string[]>;
  horarioAtivo: boolean;
  diasHorario: number[];
  horarioInicio: string;
  horarioFim: string;
  isSaving: boolean;
  setNome: (value: string) => void;
  setDescricao: (value: string) => void;
  setHorarioAtivo: (value: boolean) => void;
  setHorarioInicio: (value: string) => void;
  setHorarioFim: (value: string) => void;
  onToggleModule: (moduleId: string) => void;
  onToggleTab: (moduleId: string, tabId: string) => void;
  onToggleDay: (day: number) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

const PerfilAcessoForm: React.FC<PerfilAcessoFormProps> = ({
  editingId,
  nome,
  descricao,
  selectedModules,
  selectedTabs,
  horarioAtivo,
  diasHorario,
  horarioInicio,
  horarioFim,
  isSaving,
  setNome,
  setDescricao,
  setHorarioAtivo,
  setHorarioInicio,
  setHorarioFim,
  onToggleModule: toggleModule,
  onToggleTab: toggleTab,
  onToggleDay: toggleDay,
  onClose: handleCloseForm,
  onSubmit: handleSave,
}) => (
<form onSubmit={handleSave} className="space-y-8 animate-fadeIn">
          <div className="bg-slate-50/60 p-6 rounded-[2rem] border border-slate-100 space-y-6">
            <h4 className="text-base font-bold text-[#001a33]">
              {editingId ? 'Editar Perfil de Acesso' : 'Criar Novo Perfil de Acesso'}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 space-y-2">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Nome do Perfil</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Recepcionista, Secretário"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-[#001a33] font-medium outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Descrição</label>
                <input
                  type="text"
                  placeholder="Resumo das responsabilidades ou limitações deste perfil"
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-[#001a33] font-medium outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* PERMISSÕES DE MÓDULOS */}
          <div className="space-y-6">
            <h4 className="text-base font-bold text-[#001a33] border-b border-slate-100 pb-3 flex items-center gap-2">
              <ShieldAlert size={18} className="text-blue-600" />
              Telas e Módulos Permitidos
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {MODULE_OPTIONS.map(mod => {
                const isChecked = selectedModules.includes(mod.id);
                return (
                  <div
                    key={mod.id}
                    onClick={() => toggleModule(mod.id)}
                    className={`p-4 rounded-2xl border cursor-pointer select-none transition-all flex items-center justify-between ${
                      isChecked
                        ? 'bg-blue-50 border-blue-200 text-[#001a33]'
                        : 'bg-white border-slate-100 hover:border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className="text-sm font-semibold">{mod.label}</span>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isChecked && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONTROLE DE ABAS INTERNAS */}
          {(selectedModules.includes('cadastros') || selectedModules.includes('financeiro') || selectedModules.includes('secretaria') || selectedModules.includes('comunicacao')) && (
            <div className="space-y-6">
              <h4 className="text-base font-bold text-[#001a33] border-b border-slate-100 pb-3 flex items-center gap-2">
                <Info size={18} className="text-amber-500" />
                Abas Internas e Submódulos
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Abas do Financeiro */}
                {selectedModules.includes('financeiro') && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h5 className="text-sm font-bold text-[#001a33]">Acesso Interno: Financeiro</h5>
                    <div className="space-y-3">
                      {FINANCEIRO_TABS.map(tab => {
                        const isTabChecked = (selectedTabs['financeiro'] || []).includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={isTabChecked}
                              onChange={() => toggleTab('financeiro', tab.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Abas da Secretaria */}
                {selectedModules.includes('secretaria') && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h5 className="text-sm font-bold text-[#001a33]">Acesso Interno: Secretaria</h5>
                    <div className="space-y-3">
                      {SECRETARIA_TABS.map(tab => {
                        const isTabChecked = (selectedTabs['secretaria'] || []).includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={isTabChecked}
                              onChange={() => toggleTab('secretaria', tab.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Abas do Cadastro */}
                {selectedModules.includes('cadastros') && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h5 className="text-sm font-bold text-[#001a33]">Acesso Interno: Cadastros</h5>
                    <div className="space-y-3">
                      {CADASTROS_SUB_TABS.map(tab => {
                        const isTabChecked = (selectedTabs['cadastros'] || []).includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={isTabChecked}
                              onChange={() => toggleTab('cadastros', tab.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedModules.includes('comunicacao') && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h5 className="text-sm font-bold text-[#001a33]">Canais: Comunicação</h5>
                    <div className="space-y-3">
                      {COMUNICACAO_TABS.map(tab => {
                        const isTabChecked = (selectedTabs.comunicacao || []).includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={isTabChecked}
                              onChange={() => toggleTab('comunicacao', tab.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RESTRIÇÃO DE HORÁRIOS */}
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold text-[#001a33] flex items-center gap-2">
                <Clock size={18} className="text-purple-600" />
                Restrições de Dias e Horários
              </h4>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={horarioAtivo}
                  onChange={e => setHorarioAtivo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                <span className="ml-3 text-xs font-bold text-slate-600 uppercase">
                  {horarioAtivo ? 'Restrição Ativada' : 'Livre (Qualquer Horário)'}
                </span>
              </label>
            </div>

            {horarioAtivo && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-6 bg-purple-50/40 border border-purple-100 rounded-2xl animate-fadeIn">
                <div className="md:col-span-2 space-y-3">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Dias Permitidos</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => {
                      const isSelected = diasHorario.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-1 space-y-3">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Janela de Horário Permitida</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={horarioInicio}
                      onChange={e => setHorarioInicio(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[#001a33] font-medium outline-none focus:border-purple-500 text-sm w-full"
                    />
                    <span className="text-slate-400 text-sm font-bold">às</span>
                    <input
                      type="time"
                      value={horarioFim}
                      onChange={e => setHorarioFim(e.target.value)}
                      className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[#001a33] font-medium outline-none focus:border-purple-500 text-sm w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BOTÕES DO FORMULÁRIO */}
          <div className="pt-6 border-t border-slate-100 flex justify-end items-center gap-4">
            <button
              type="button"
              onClick={handleCloseForm}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" size={14} /> Salvando...
                </>
              ) : (
                'Salvar Perfil'
              )}
            </button>
          </div>
        </form>
);

export default PerfilAcessoForm;
