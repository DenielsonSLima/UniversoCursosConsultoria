import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, Headphones, LayoutDashboard, Lock, Plus, Edit3, Trash2, Clock, Check, X,
  AlertCircle, Loader2
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { polosService } from '../polos/polos.service';
import {
  perfisAcessoService,
  PerfilAcesso,
  PerfilSetorComunicacao,
} from './perfis-acesso.service';
import PerfilAcessoForm from './PerfilAcessoForm';
import { normalizeSecretariaAccessTabs } from '../../secretaria/secretaria-access';
import {
  DashboardWidgetId,
  DEFAULT_GESTAO_TURMA_TABS,
  getAllowedDashboardWidgets,
  getEligibleDashboardWidgets,
  normalizeDashboardWidgets,
  normalizeGestorPermissions,
} from '../../access-control';

const PerfisAcessoConfig: React.FC = () => {
  const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
  const [polos, setPolos] = useState<Array<{
    id: string;
    nomeFantasia: string;
    cidade: string;
    uf: string;
  }>>([]);
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
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgetId[]>([]);
  const [todosPolos, setTodosPolos] = useState(false);
  const [polosAcesso, setPolosAcesso] = useState<string[]>([]);
  const [setorComunicacao, setSetorComunicacao] = useState<PerfilSetorComunicacao>('todos');
  const [poloComunicacaoId, setPoloComunicacaoId] = useState<string | null>(null);
  const [podeVisualizarTodosSetores, setPodeVisualizarTodosSetores] = useState(false);
  const [horarioAtivo, setHorarioAtivo] = useState(false);
  const [diasHorario, setDiasHorario] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horarioInicio, setHorarioInicio] = useState('08:00');
  const [horarioFim, setHorarioFim] = useState('18:00');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const draftPermissions = useMemo(
    () => normalizeGestorPermissions({
      modules: selectedModules,
      financeiroTabs: selectedTabs.financeiro || [],
      tabs: selectedTabs,
      allPolos: todosPolos,
    }, { fallbackFullAccess: false }),
    [selectedModules, selectedTabs, todosPolos],
  );
  const eligibleDashboardWidgets = useMemo(
    () => getEligibleDashboardWidgets(draftPermissions),
    [draftPermissions],
  );

  useEffect(() => {
    const eligibleSet = new Set(eligibleDashboardWidgets);
    setDashboardWidgets((current) => current.filter((widgetId) => eligibleSet.has(widgetId)));
  }, [eligibleDashboardWidgets]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [data, polosData] = await Promise.all([
        perfisAcessoService.getAll(),
        polosService.getAll(),
      ]);
      setPerfis(data);
      setPolos(polosData
        .filter((polo): polo is typeof polo & { id: string } => Boolean(polo.id))
        .map((polo) => ({
          id: polo.id,
          nomeFantasia: polo.nomeFantasia || polo.nome,
          cidade: polo.cidade,
          uf: polo.uf || polo.estado,
        })));

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
      const profileTabs = perfil.permissoes?.tabs || {};
      setSelectedTabs({
        ...profileTabs,
        gestao: Object.prototype.hasOwnProperty.call(profileTabs, 'gestao')
          ? profileTabs.gestao
          : perfil.permissoes?.modules?.includes('gestao')
            ? DEFAULT_GESTAO_TURMA_TABS
            : [],
        secretaria: normalizeSecretariaAccessTabs(perfil.permissoes?.tabs?.secretaria),
        financeiro: perfil.permissoes?.tabs?.financeiro
          ?? perfil.permissoes?.financeiroTabs
          ?? [],
      });
      const profilePermissions = normalizeGestorPermissions(perfil.permissoes, {
        fallbackFullAccess: false,
      });
      setDashboardWidgets(
        perfil.permissoes?.dashboardWidgets !== undefined
          ? normalizeDashboardWidgets(perfil.permissoes.dashboardWidgets)
          : getEligibleDashboardWidgets(profilePermissions),
      );
      setTodosPolos(Boolean(perfil.permissoes?.allPolos));
      setPolosAcesso(perfil.permissoes?.poloIds || []);
      setSetorComunicacao(perfil.permissoes?.communicationScope?.sector || 'todos');
      setPoloComunicacaoId(perfil.permissoes?.communicationScope?.poloId || null);
      setPodeVisualizarTodosSetores(Boolean(perfil.permissoes?.communicationScope?.canViewAll));
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
        cadastros: ['cadastros-checklist'],
        comunicacao: ['comunicacao-mensagem']
      });
      setDashboardWidgets([]);
      setTodosPolos(false);
      setPolosAcesso([]);
      setSetorComunicacao('todos');
      setPoloComunicacaoId(null);
      setPodeVisualizarTodosSetores(false);
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
    const enablingModule = !selectedModules.includes(moduleId);
    setSelectedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    );
    if (enablingModule && moduleId === 'gestao') {
      setSelectedTabs(current => ({
        ...current,
        gestao: (current.gestao || []).length > 0
          ? current.gestao
          : DEFAULT_GESTAO_TURMA_TABS,
      }));
    }
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

  const toggleDashboardWidget = (widgetId: DashboardWidgetId) => {
    if (!eligibleDashboardWidgets.includes(widgetId)) return;
    setDashboardWidgets((current) => current.includes(widgetId)
      ? current.filter((id) => id !== widgetId)
      : [...current, widgetId]);
  };

  const togglePolo = (poloId: string) => {
    if (todosPolos) return;
    setPolosAcesso((current) => current.includes(poloId)
      ? current.filter((id) => id !== poloId)
      : [...current, poloId]);
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
    if (selectedModules.length === 0) {
      setErrorMsg('Selecione ao menos um módulo para o perfil.');
      return;
    }
    if (selectedModules.includes('financeiro') && (selectedTabs.financeiro || []).length === 0) {
      setErrorMsg('Selecione ao menos uma aba do Financeiro.');
      return;
    }
    if (selectedModules.includes('gestao') && (selectedTabs.gestao || []).length === 0) {
      setErrorMsg('Selecione ao menos uma aba das turmas do módulo Gestão.');
      return;
    }
    if (selectedModules.includes('secretaria') && (selectedTabs.secretaria || []).length === 0) {
      setErrorMsg('Selecione ao menos uma aba da Secretaria.');
      return;
    }
    if (selectedModules.includes('cadastros') && (selectedTabs.cadastros || []).length === 0) {
      setErrorMsg('Selecione ao menos uma aba de Cadastros.');
      return;
    }
    if (selectedModules.includes('comunicacao') && (selectedTabs.comunicacao || []).length === 0) {
      setErrorMsg('Selecione ao menos um canal de Comunicação.');
      return;
    }
    if (!todosPolos && polosAcesso.length === 0) {
      setErrorMsg('Selecione ao menos um polo para o perfil.');
      return;
    }
    const hasWhatsApp = selectedModules.includes('comunicacao')
      && (selectedTabs.comunicacao || []).includes('comunicacao-whatsapp');
    if (hasWhatsApp && !podeVisualizarTodosSetores && !poloComunicacaoId) {
      setErrorMsg('Selecione o polo de atendimento do WhatsApp para o perfil.');
      return;
    }
    if (horarioAtivo && diasHorario.length === 0) {
      setErrorMsg('Selecione ao menos um dia permitido para o expediente.');
      return;
    }
    if (horarioAtivo && horarioInicio === horarioFim) {
      setErrorMsg('O início e o fim do expediente não podem ser iguais.');
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
        dashboardWidgets,
        allPolos: todosPolos,
        poloIds: todosPolos ? [] : polosAcesso,
        communicationScope: {
          sector: podeVisualizarTodosSetores ? 'todos' : setorComunicacao,
          poloId: podeVisualizarTodosSetores ? null : poloComunicacaoId,
          canViewAll: podeVisualizarTodosSetores,
        },
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
            Defina módulos, polos, setor do WhatsApp e horários que serão herdados pelos usuários.
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
        <PerfilAcessoForm
          editingId={editingId}
          nome={nome}
          descricao={descricao}
          selectedModules={selectedModules}
          selectedTabs={selectedTabs}
          dashboardWidgets={dashboardWidgets}
          eligibleDashboardWidgets={eligibleDashboardWidgets}
          horarioAtivo={horarioAtivo}
          diasHorario={diasHorario}
          horarioInicio={horarioInicio}
          horarioFim={horarioFim}
          polos={polos}
          todosPolos={todosPolos}
          polosAcesso={polosAcesso}
          setorComunicacao={setorComunicacao}
          poloComunicacaoId={poloComunicacaoId}
          podeVisualizarTodosSetores={podeVisualizarTodosSetores}
          isSaving={isSaving}
          setNome={setNome}
          setDescricao={setDescricao}
          setTodosPolos={(value) => {
            setTodosPolos(value);
            if (value) setPolosAcesso([]);
          }}
          setSetorComunicacao={setSetorComunicacao}
          setPoloComunicacaoId={setPoloComunicacaoId}
          setPodeVisualizarTodosSetores={(value) => {
            setPodeVisualizarTodosSetores(value);
            if (value) {
              setSetorComunicacao('todos');
              setPoloComunicacaoId(null);
            }
          }}
          setHorarioAtivo={setHorarioAtivo}
          setHorarioInicio={setHorarioInicio}
          setHorarioFim={setHorarioFim}
          onToggleModule={toggleModule}
          onToggleTab={toggleTab}
          onToggleDashboardWidget={toggleDashboardWidget}
          onTogglePolo={togglePolo}
          onToggleDay={toggleDay}
          onClose={handleCloseForm}
          onSubmit={handleSave}
        />
      ) : (
        /* LISTAGEM DE PERFIS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
          {perfis.map(perfil => {
            const usersLinked = userCounts[perfil.id || ''] || 0;
            const hasRestriction = perfil.restricao_horario?.ativo;
            const daysCount = perfil.restricao_horario?.dias?.length || 0;
            const profilePoloIds = perfil.permissoes?.poloIds || [];
            const communicationScope = perfil.permissoes?.communicationScope;
            const profilePermissions = normalizeGestorPermissions(perfil.permissoes, {
              fallbackFullAccess: false,
            });
            const profileDashboardWidgets = getAllowedDashboardWidgets(profilePermissions);
            const poloScopeLabel = perfil.permissoes?.allPolos
              ? 'Todos os polos'
              : profilePoloIds.length === 1
                ? '1 polo permitido'
                : `${profilePoloIds.length} polos permitidos`;
            const communicationLabel = communicationScope?.canViewAll
              ? 'WhatsApp: gestor geral'
              : communicationScope?.poloId
                ? `WhatsApp: ${communicationScope.sector === 'todos'
                  ? 'todos os setores do polo'
                  : communicationScope.sector.replaceAll('_', ' ')}`
                : 'WhatsApp sem escopo padrão';

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
                      <LayoutDashboard className="text-indigo-500" size={14} />
                      <span>{profileDashboardWidgets.length} indicadores na tela inicial</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold uppercase">
                      <Building2 className="text-blue-500" size={14} />
                      <span>{poloScopeLabel}</span>
                    </div>

                    {(perfil.permissoes?.tabs?.comunicacao || []).includes('comunicacao-whatsapp') && (
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 font-semibold uppercase">
                        <Headphones className="text-emerald-500" size={14} />
                        <span>{communicationLabel}</span>
                      </div>
                    )}

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
