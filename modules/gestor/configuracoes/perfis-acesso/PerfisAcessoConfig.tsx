import '../usuarios/config-access.css';
import PerfisAcessoList from './PerfisAcessoList';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, AlertCircle, Loader2 } from 'lucide-react';
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
      setErrorMsg('Selecione ao menos uma opção de Formações.');
      return;
    }
    if (selectedModules.includes('comunicacao') && (selectedTabs.comunicacao || []).length === 0) {
      setErrorMsg('Selecione ao menos um canal de Comunicação.');
      return;
    }
    if (
      selectedModules.includes('comunicacao')
      && (selectedTabs.comunicacao || []).includes('comunicacao-automacoes')
      && !todosPolos
    ) {
      setErrorMsg('Automações multicanal exigem acesso global a todos os polos.');
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
    <div className="config-section animate-fadeIn">
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
        <PerfisAcessoList perfis={perfis} userCounts={userCounts} confirmDeleteId={confirmDeleteId}
          handleDelete={handleDelete} handleOpenForm={handleOpenForm} setConfirmDeleteId={setConfirmDeleteId} />
      )}
    </div>
  );
};

export default PerfisAcessoConfig;
