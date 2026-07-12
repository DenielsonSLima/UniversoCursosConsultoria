import React, { useState, useEffect } from 'react';
import { 
  Lock, Plus, Edit3, Trash2, Clock, Calendar, Check, X, 
  AlertCircle, Loader2, Info, ShieldAlert
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { perfisAcessoService, PerfilAcesso } from './perfis-acesso.service';

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
  { id: 'historico', label: 'Histórico de Emissões' }
];

const PerfisAcessoConfig: React.FC = () => {
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de formulário
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Record<string, string[]>>({});
  const [horarioAtivo, setHorarioAtivo] = useState(false);
  const [diasHorario, setDiasHorario] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horarioInicio, setHorarioInicio] = useState('08:00');
  const [horarioFim, setHorarioFim] = useState('18:00');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await perfisAcessoService.getAll();
      setPerfis(data);

      // Buscar contagem de usuários por perfil
      const { data: countData, error: countError } = await supabase
        .from('usuarios_sistema')
        .select('perfil_acesso_id');

      if (!countError && countData) {
        const counts: Record<string, number> = {};
        countData.forEach((row: any) => {
          if (row.perfil_acesso_id) {
            counts[row.perfil_acesso_id] = (counts[row.perfil_acesso_id] || 0) + 1;
          }
        });
        setUserCounts(counts);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar perfis de acesso.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenForm = (perfil?: PerfilAcesso) => {
    setErrorMsg(null);
    if (perfil) {
      setEditingId(perfil.id || null);
      setNome(perfil.nome);
      setDescricao(perfil.descricao || '');
      setSelectedModules(perfil.permissoes?.modules || []);
      setSelectedTabs(perfil.permissoes?.tabs || {});
      setHorarioAtivo(perfil.restricao_horario?.ativo || false);
      setDiasHorario(perfil.restricao_horario?.dias || [1, 2, 3, 4, 5]);
      setHorarioInicio(perfil.restricao_horario?.horario_inicio || '08:00');
      setHorarioFim(perfil.restricao_horario?.horario_fim || '18:00');
    } else {
      setEditingId(null);
      setNome('');
      setDescricao('');
      setSelectedModules(['inicio']);
      setSelectedTabs({
        financeiro: ['resumo'],
        secretaria: ['solicitacoes'],
        cadastros: ['cadastros-checklist']
      });
      setHorarioAtivo(false);
      setDiasHorario([1, 2, 3, 4, 5]);
      setHorarioInicio('08:00');
      setHorarioFim('18:00');
    }
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
  };

  const toggleModule = (moduleId: string) => {
    setSelectedModules(prev => 
      prev.includes(moduleId) 
        ? prev.filter(m => m !== moduleId) 
        : [...prev, moduleId]
    );
  };

  const toggleTab = (moduleId: string, tabId: string) => {
    setSelectedTabs(prev => {
      const current = prev[moduleId] || [];
      const updated = current.includes(tabId)
        ? current.filter(t => t !== tabId)
        : [...current, tabId];
      return { ...prev, [moduleId]: updated };
    });
  };

  const toggleDay = (day: number) => {
    setDiasHorario(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErrorMsg('O nome do perfil é obrigatório.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      permissoes: {
        modules: selectedModules,
        financeiroTabs: selectedTabs['financeiro'] || [],
        tabs: selectedTabs,
        allPolos: false
      },
      restricao_horario: {
        dias: diasHorario,
        horario_inicio: horarioInicio,
        horario_fim: horarioFim,
        ativo: horarioAtivo
      }
    };

    try {
      if (editingId) {
        await perfisAcessoService.update(editingId, payload);
      } else {
        await perfisAcessoService.create(payload);
      }
      setIsFormOpen(false);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await perfisAcessoService.delete(id);
      setConfirmDeleteId(null);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir perfil.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-semibold text-sm">Carregando perfis de acesso...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h3 className="text-2xl font-bold text-[#001a33] tracking-tight">Perfis de Acesso</h3>
          <p className="text-slate-500 text-sm mt-1">
            Defina papéis de acesso reutilizáveis com restrições de telas, abas e horários.
          </p>
        </div>
        {!isFormOpen && (
          <button
            onClick={() => handleOpenForm()}
            className="flex items-center gap-2 px-5 py-3 bg-[#001a33] text-white hover:bg-blue-900 rounded-2xl text-xs font-bold uppercase tracking-wider shadow-md shadow-blue-900/10 hover:shadow-lg transition-all"
          >
            <Plus size={16} /> Novo Perfil
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-700 text-sm font-medium rounded-2xl flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* FORMULÁRIO DE CADASTRO/EDIÇÃO */}
      {isFormOpen ? (
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
          {(selectedModules.includes('cadastros') || selectedModules.includes('financeiro') || selectedModules.includes('secretaria')) && (
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
      ) : (
        /* LISTAGEM DE PERFIS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
          {perfis.map(perfil => {
            const usersLinked = userCounts[perfil.id || ''] || 0;
            const hasRestriction = perfil.restricao_horario?.ativo;
            const daysCount = perfil.restricao_horario?.dias?.length || 0;

            return (
              <div 
                key={perfil.id} 
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5 transition-all duration-300 group"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Lock size={22} />
                    </div>
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                      {usersLinked} {usersLinked === 1 ? 'Usuário' : 'Usuários'}
                    </span>
                  </div>

                  <h4 className="text-lg font-bold text-[#001a33] mb-1">{perfil.nome}</h4>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed mb-4">
                    {perfil.descricao || 'Nenhuma descrição fornecida.'}
                  </p>

                  <div className="space-y-2 border-t border-slate-50 pt-4">
                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold uppercase">
                      <Check className="text-emerald-500" size={14} />
                      <span>{perfil.permissoes?.modules?.length || 0} módulos permitidos</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold uppercase">
                      {hasRestriction ? (
                        <>
                          <Clock className="text-purple-500" size={14} />
                          <span>Expediente: {perfil.restricao_horario.horario_inicio} às {perfil.restricao_horario.horario_fim} ({daysCount} dias)</span>
                        </>
                      ) : (
                        <>
                          <Clock className="text-slate-300" size={14} />
                          <span>Horário de acesso livre</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  {confirmDeleteId === perfil.id ? (
                    <div className="flex items-center gap-2 animate-fadeIn">
                      <span className="text-[10px] text-rose-600 font-bold uppercase mr-1">Tem certeza?</span>
                      <button
                        onClick={() => handleDelete(perfil.id || '')}
                        className="p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
                        title="Confirmar exclusão"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleOpenForm(perfil)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Edit3 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(perfil.id || null)}
                        disabled={usersLinked > 0}
                        className={`p-2 rounded-xl border transition-colors ${
                          usersLinked > 0
                            ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-white border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600'
                        }`}
                        title={usersLinked > 0 ? "Não é possível excluir um perfil associado a usuários" : "Excluir perfil"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {perfis.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem]">
              <Lock className="mx-auto text-slate-300 mb-3" size={36} />
              <h4 className="text-base font-bold text-[#001a33]">Nenhum Perfil de Acesso</h4>
              <p className="text-slate-400 text-sm mt-1">Crie o seu primeiro perfil para centralizar o controle de privilégios.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PerfisAcessoConfig;
