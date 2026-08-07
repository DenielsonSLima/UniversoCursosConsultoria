import React from 'react';
import { Building2, Check, Clock, Headphones, Info, Loader2, ShieldAlert } from 'lucide-react';
import { PerfilSetorComunicacao } from './perfis-acesso.service';
import { SECRETARIA_ACCESS_OPTIONS } from '../../secretaria/secretaria-access';
import type { DashboardWidgetId } from '../../access-control';
import DashboardWidgetsProfileSection from './DashboardWidgetsProfileSection';
import {
  GESTOR_CADASTRO_NAVIGATION,
  GESTOR_MAIN_NAVIGATION,
} from '../../gestor-navigation.config';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' }
];

const MODULE_OPTIONS = GESTOR_MAIN_NAVIGATION.map(item => ({
  id: item.id,
  label: item.id === 'inicio' ? 'Início (Dashboard)' : item.label,
}));

const CADASTROS_SUB_TABS = GESTOR_CADASTRO_NAVIGATION.map(item => ({ ...item }));

const FINANCEIRO_TABS = [
  { id: 'resumo', label: 'Resumo / Visão Geral' },
  { id: 'receber', label: 'Contas a Receber' },
  { id: 'despesas', label: 'Contas a Pagar' },
  { id: 'emprestimos', label: 'Empréstimos (somente Matriz)' },
  { id: 'transferencias', label: 'Transferências' },
  { id: 'conciliacao-bancaria', label: 'Conciliação Bancária' },
  { id: 'outros-debitos', label: 'Outros Débitos' },
  { id: 'outros-creditos', label: 'Outros Créditos' }
];

const GESTAO_TURMA_TABS = [
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
];

const COMUNICACAO_TABS = [
  { id: 'comunicacao-mensagem', label: 'Atendimento — Portal e app' },
  { id: 'comunicacao-whatsapp', label: 'Atendimento — WhatsApp e operações' },
  { id: 'comunicacao-automacoes', label: 'Automações multicanal' }
];

interface PerfilAcessoFormProps {
  editingId: string | null;
  nome: string;
  descricao: string;
  selectedModules: string[];
  selectedTabs: Record<string, string[]>;
  dashboardWidgets: DashboardWidgetId[];
  eligibleDashboardWidgets: DashboardWidgetId[];
  horarioAtivo: boolean;
  diasHorario: number[];
  horarioInicio: string;
  horarioFim: string;
  polos: Array<{
    id: string;
    nomeFantasia: string;
    cidade: string;
    uf: string;
  }>;
  todosPolos: boolean;
  polosAcesso: string[];
  setorComunicacao: PerfilSetorComunicacao;
  poloComunicacaoId: string | null;
  podeVisualizarTodosSetores: boolean;
  isSaving: boolean;
  setNome: (value: string) => void;
  setDescricao: (value: string) => void;
  setTodosPolos: (value: boolean) => void;
  setSetorComunicacao: (value: PerfilSetorComunicacao) => void;
  setPoloComunicacaoId: (value: string | null) => void;
  setPodeVisualizarTodosSetores: (value: boolean) => void;
  setHorarioAtivo: (value: boolean) => void;
  setHorarioInicio: (value: string) => void;
  setHorarioFim: (value: string) => void;
  onToggleModule: (moduleId: string) => void;
  onToggleTab: (moduleId: string, tabId: string) => void;
  onToggleDashboardWidget: (widgetId: DashboardWidgetId) => void;
  onTogglePolo: (poloId: string) => void;
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
  dashboardWidgets,
  eligibleDashboardWidgets,
  horarioAtivo,
  diasHorario,
  horarioInicio,
  horarioFim,
  polos,
  todosPolos,
  polosAcesso,
  setorComunicacao,
  poloComunicacaoId,
  podeVisualizarTodosSetores,
  isSaving,
  setNome,
  setDescricao,
  setTodosPolos,
  setSetorComunicacao,
  setPoloComunicacaoId,
  setPodeVisualizarTodosSetores,
  setHorarioAtivo,
  setHorarioInicio,
  setHorarioFim,
  onToggleModule: toggleModule,
  onToggleTab: toggleTab,
  onToggleDashboardWidget: toggleDashboardWidget,
  onTogglePolo: togglePolo,
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

          {selectedModules.includes('inicio') && (
            <DashboardWidgetsProfileSection
              selected={dashboardWidgets}
              eligible={eligibleDashboardWidgets}
              onToggle={toggleDashboardWidget}
            />
          )}

          {/* ESCOPO DE POLOS */}
          <div className="space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h4 className="flex items-center gap-2 text-base font-bold text-[#001a33]">
                <Building2 size={18} className="text-blue-600" />
                Polos permitidos
              </h4>
              <p className="mt-1 text-sm font-medium text-slate-500">
                O usuário herda estas unidades ao receber o perfil.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setTodosPolos(!todosPolos)}
              className={`flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors ${
                todosPolos
                  ? 'border-blue-300 bg-blue-50 text-blue-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
              }`}
            >
              <span>
                <span className="block text-sm font-bold">Todos os polos</span>
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  Inclui automaticamente polos criados depois. Use somente para funções com atuação multiunidade.
                </span>
              </span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                todosPolos ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
              }`}>
                {todosPolos && <Check size={13} strokeWidth={3} />}
              </span>
            </button>

            {!todosPolos && (
              <div>
                <p className="mb-3 text-xs font-medium text-slate-500">
                  Perfis restritos mantêm somente as unidades marcadas; polos novos não são concedidos automaticamente.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {polos.map((polo) => {
                  const selected = polosAcesso.includes(polo.id);
                  return (
                    <button
                      key={polo.id}
                      type="button"
                      onClick={() => togglePolo(polo.id)}
                      className={`flex min-h-20 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-blue-400 bg-blue-50 text-blue-950'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-bold">{polo.nomeFantasia}</span>
                        <span className="mt-1 block text-xs font-medium text-slate-500">
                          {polo.cidade}/{polo.uf}
                        </span>
                      </span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        selected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'
                      }`}>
                        {selected && <Check size={13} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
            )}
          </div>

          {/* CONTROLE DE ABAS INTERNAS */}
          {(selectedModules.includes('gestao') || selectedModules.includes('cadastros') || selectedModules.includes('financeiro') || selectedModules.includes('secretaria') || selectedModules.includes('comunicacao')) && (
            <div className="space-y-6">
              <h4 className="text-base font-bold text-[#001a33] border-b border-slate-100 pb-3 flex items-center gap-2">
                <Info size={18} className="text-amber-500" />
                Abas Internas e Submódulos
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Abas das turmas no módulo Gestão */}
                {selectedModules.includes('gestao') && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <div>
                      <h5 className="text-sm font-bold text-[#001a33]">Acesso Interno: Turmas da Gestão</h5>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Aplicado às turmas técnicas, livres, de especialização e EAD.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {GESTAO_TURMA_TABS.map(tab => {
                        const isTabChecked = (selectedTabs.gestao || []).includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={isTabChecked}
                              onChange={() => toggleTab('gestao', tab.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                      {SECRETARIA_ACCESS_OPTIONS.map(tab => {
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
                    <h5 className="text-sm font-bold text-[#001a33]">Acesso Interno: Formações</h5>
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
                    <h5 className="text-sm font-bold text-[#001a33]">Áreas de Comunicação</h5>
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

          {selectedModules.includes('comunicacao')
            && (selectedTabs.comunicacao || []).includes('comunicacao-whatsapp')
            && (
              <div className="space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="flex items-center gap-2 text-base font-bold text-[#001a33]">
                    <Headphones size={18} className="text-emerald-600" />
                    Escopo padrão do WhatsApp
                  </h4>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Define quais conversas o usuário poderá visualizar ao herdar este perfil.
                  </p>
                </div>

                <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
                  <span>
                    <span className="block text-sm font-bold text-emerald-950">Gestor de todos os atendimentos</span>
                    <span className="mt-1 block text-xs font-medium leading-relaxed text-emerald-700">
                      Visualiza conversas de todos os polos e setores.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={podeVisualizarTodosSetores}
                    onChange={(event) => setPodeVisualizarTodosSetores(event.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </label>

                {!podeVisualizarTodosSetores && (
                  <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Headphones size={14} /> Setor permitido
                      </span>
                      <select
                        value={setorComunicacao}
                        onChange={(event) => setSetorComunicacao(event.target.value as PerfilSetorComunicacao)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-500"
                      >
                        <option value="todos">Todos os setores do polo</option>
                        <option value="comercial_matriculas">Comercial / Matrículas</option>
                        <option value="secretaria">Secretaria</option>
                        <option value="financeiro">Financeiro</option>
                        <option value="pedagogico_coordenacao">Coordenação / Pedagógico</option>
                        <option value="atendimento_geral">Atendimento geral</option>
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Building2 size={14} /> Polo do atendimento
                      </span>
                      <select
                        value={poloComunicacaoId || ''}
                        onChange={(event) => setPoloComunicacaoId(event.target.value || null)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-500"
                      >
                        <option value="">Selecione o polo</option>
                        {polos.map((polo) => (
                          <option key={polo.id} value={polo.id}>
                            {polo.nomeFantasia} — {polo.cidade}/{polo.uf}
                          </option>
                        ))}
                      </select>
                    </label>

                    <p className="text-xs font-medium leading-relaxed text-slate-500 md:col-span-2">
                      A restrição é aplicada no banco: mensagens de outro polo ou setor não aparecem para o usuário.
                    </p>
                  </div>
                )}
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
