import React from 'react';
import { AlertTriangle, Building2, Check, Clock, Headphones, Layers, Lock, TrendingUp } from 'lucide-react';
import { PerfilAcesso } from '../../perfis-acesso/perfis-acesso.service';
import { NovoUsuarioFormData } from '../usuarios.types';
import {
  USER_FORM_FINANCEIRO_TABS,
  USER_FORM_MODULES,
  USER_FORM_MODULE_TABS,
  USER_FORM_SCHEDULE_DAYS,
} from './user-access-options';
import { normalizeSecretariaAccessTabs } from '../../../secretaria/secretaria-access';
import { DEFAULT_GESTAO_TURMA_TABS } from '../../../access-control';

interface UserAccessSectionsProps {
  contextId: string;
  formData: NovoUsuarioFormData;
  perfis: PerfilAcesso[];
  selectedPerfil?: PerfilAcesso;
  companies: Array<{
    id: string;
    nomeFantasia: string;
    cidade: string;
    uf: string;
  }>;
  setFormData: React.Dispatch<React.SetStateAction<NovoUsuarioFormData>>;
  onTogglePermission: (id: string) => void;
  onToggleFinanceiroTab: (id: string) => void;
  onToggleModuleTab: (moduleId: string, tabId: string) => void;
  onToggleScheduleDay: (day: number) => void;
}

const UserAccessSections: React.FC<UserAccessSectionsProps> = ({
  contextId,
  formData,
  perfis,
  selectedPerfil,
  companies,
  setFormData,
  onTogglePermission,
  onToggleFinanceiroTab,
  onToggleModuleTab,
  onToggleScheduleDay,
}) => (
  <section className="mb-6">
    <div className="flex items-center gap-2 mb-6 text-blue-600 border-t border-slate-100 pt-8">
      <Lock size={20} />
      <h4 className="text-sm font-black uppercase tracking-wider">Permissões e Acessos</h4>
    </div>

    <div className="mb-8 space-y-2">
      <label className="text-xs font-bold text-slate-500 uppercase ml-1">Perfil de Acesso</label>
      <select
        name="perfil_acesso_id"
        value={formData.perfil_acesso_id || ''}
        onChange={event => {
          const profileId = event.target.value;
          const nextProfile = perfis.find(perfil => perfil.id === profileId);
          const profileAllowsAllPolos = contextId === 'global'
            && Boolean(nextProfile?.permissoes?.allPolos);
          const inheritedPoloIds = nextProfile?.permissoes?.poloIds || [];
          const communicationScope = nextProfile?.permissoes?.communicationScope;
          const inheritedTabs: Record<string, string[]> = nextProfile?.permissoes?.tabs
            ? {
                ...nextProfile.permissoes.tabs,
                secretaria: normalizeSecretariaAccessTabs(
                  nextProfile.permissoes.tabs.secretaria,
                ),
              }
            : {};
          if (
            nextProfile?.permissoes?.modules?.includes('gestao')
            && !Object.prototype.hasOwnProperty.call(inheritedTabs, 'gestao')
          ) {
            inheritedTabs.gestao = DEFAULT_GESTAO_TURMA_TABS;
          }
          setFormData(previous => ({
            ...previous,
            perfil_acesso_id: profileId || null,
            personalizarPermissoes: false,
            personalizarHorario: profileId ? false : true,
            permissoes: nextProfile?.permissoes?.modules || previous.permissoes,
            financeiroAbas: nextProfile?.permissoes?.financeiroTabs?.length
              ? nextProfile?.permissoes.financeiroTabs
              : nextProfile?.permissoes?.tabs?.financeiro || [],
            abasModulos: inheritedTabs,
            todosPolos: nextProfile ? profileAllowsAllPolos : previous.todosPolos,
            polosAcesso: nextProfile
              ? profileAllowsAllPolos
                ? []
                : inheritedPoloIds.length > 0
                  ? inheritedPoloIds
                  : contextId === 'global'
                    ? previous.polosAcesso
                    : [contextId]
              : previous.polosAcesso,
            setorComunicacao: communicationScope?.sector || previous.setorComunicacao,
            poloComunicacaoId: communicationScope
              ? communicationScope.canViewAll ? null : communicationScope.poloId
              : previous.poloComunicacaoId,
            podeVisualizarTodosPolos: communicationScope?.canViewAll
              ?? previous.podeVisualizarTodosPolos,
            podeVisualizarTodosSetores: communicationScope?.canViewAll
              ?? previous.podeVisualizarTodosSetores,
          }));
        }}
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all text-sm"
      >
        <option value="">Personalizado (Definir permissões manuais abaixo)</option>
        {perfis.map(perfil => <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>)}
      </select>
      {formData.perfil_acesso_id && (
        <div className="mt-1 space-y-1 text-[11px] text-blue-600 font-semibold">
          <p>✓ Módulos, polos, setor do WhatsApp e horário foram herdados do perfil. Você ainda pode ajustar este usuário.</p>
          <p>
            Perfil ativo: {selectedPerfil?.nome || 'Carregando perfil'}
            {selectedPerfil && (
              <span className="text-slate-500 font-medium ml-1">
                ({selectedPerfil.permissoes?.modules?.length || 0} módulo(s), horário {selectedPerfil.restricao_horario?.ativo ? 'bloqueado' : 'liberado'})
              </span>
            )}
          </p>
        </div>
      )}
    </div>

    {formData.perfil_acesso_id && (
      <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <input type="checkbox" checked={formData.personalizarPermissoes} onChange={event => setFormData(previous => ({ ...previous, personalizarPermissoes: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
        <span>
          <span className="block text-xs font-black uppercase tracking-wider text-blue-900">Personalizar módulos deste usuário</span>
          <span className="mt-1 block text-xs leading-relaxed text-blue-700">Quando ativo, esta seleção substitui os módulos do perfil somente para este usuário.</span>
        </span>
      </label>
    )}

    {!formData.perfil_acesso_id || formData.personalizarPermissoes ? (
      <>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle className="text-yellow-600 shrink-0" size={20} />
          <div>
            <p className="text-xs font-bold text-yellow-800 uppercase mb-1">Atenção</p>
            <p className="text-xs text-yellow-700 leading-relaxed">O usuário só conseguirá acessar os módulos selecionados abaixo. Caso tente acessar uma área não permitida, o sistema exibirá uma mensagem de &quot;Acesso Negado&quot;.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {USER_FORM_MODULES.map(module => (
            <div key={module.id} onClick={() => onTogglePermission(module.id)} className={`cursor-pointer rounded-xl border p-4 flex flex-col items-center justify-center text-center gap-2 transition-all duration-200 h-32 ${formData.permissoes.includes(module.id) ? 'bg-[#001a33] border-[#001a33] text-white shadow-lg' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-400 hover:bg-slate-50'}`}>
              <div className={formData.permissoes.includes(module.id) ? 'text-blue-400' : 'text-slate-300'}>{module.icon}</div>
              <p className="text-xs font-bold uppercase tracking-widest">{module.label}</p>
              {formData.permissoes.includes(module.id) && <span className="text-[9px] bg-blue-500/20 text-blue-200 px-2 py-0.5 rounded-full font-medium">Liberado</span>}
            </div>
          ))}
        </div>

        {formData.permissoes.includes('financeiro') && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="mb-4 flex items-center gap-2 text-emerald-700"><TrendingUp size={18} /><h5 className="text-xs font-black uppercase tracking-widest">Abas do Financeiro</h5></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {USER_FORM_FINANCEIRO_TABS.map(tab => (
                <button key={tab.id} type="button" onClick={() => onToggleFinanceiroTab(tab.id)} className={`flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${formData.financeiroAbas.includes(tab.id) ? 'border-emerald-500 bg-white text-emerald-800 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200'}`}>
                  <span className="flex items-center gap-2"><span className={formData.financeiroAbas.includes(tab.id) ? 'text-emerald-600' : 'text-slate-300'}>{tab.icon}</span><span className="text-[11px] font-black uppercase tracking-widest">{tab.label}</span></span>
                  {formData.financeiroAbas.includes(tab.id) && <span className="rounded-full bg-emerald-500 p-1 text-white"><Check size={11} /></span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {(['gestao', 'cadastros', 'secretaria', 'comunicacao'] as const).map(moduleId => {
          if (!formData.permissoes.includes(moduleId)) return null;
          const title = moduleId === 'gestao'
            ? 'Abas das Turmas da Gestão'
            : moduleId === 'cadastros'
              ? 'Abas de Cadastros'
              : moduleId === 'secretaria'
                ? 'Abas da Secretaria'
                : 'Canais de Comunicação';
          return (
            <div key={moduleId} className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="mb-4 flex items-center gap-2 text-blue-700"><Layers size={18} /><h5 className="text-xs font-black uppercase tracking-widest">{title}</h5></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {USER_FORM_MODULE_TABS[moduleId].map(tab => {
                  const selected = (formData.abasModulos[moduleId] || []).includes(tab.id);
                  return <button key={tab.id} type="button" onClick={() => onToggleModuleTab(moduleId, tab.id)} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${selected ? 'border-blue-500 bg-white text-blue-800 shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200'}`}><span className="text-[11px] font-black uppercase tracking-wider">{tab.label}</span>{selected && <span className="rounded-full bg-blue-500 p-1 text-white"><Check size={11} /></span>}</button>;
                })}
              </div>
            </div>
          );
        })}
      </>
    ) : <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">Módulos herdados do perfil selecionado.</div>}

    {formData.permissoes.includes('comunicacao')
      && (formData.abasModulos.comunicacao || []).includes('comunicacao-whatsapp')
      && (
        <div className="mt-8 border-t border-slate-100 pt-8">
          <div className="mb-5 flex items-center gap-2 text-emerald-700">
            <Headphones size={20} />
            <h4 className="text-sm font-black uppercase tracking-wider">Escopo do atendimento WhatsApp</h4>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
            <span>
              <span className="block text-xs font-black uppercase tracking-wider text-emerald-900">Gestor de todos os atendimentos</span>
              <span className="mt-1 block text-xs leading-relaxed text-emerald-700">
                Visualiza todos os polos e setores. Indicado para supervisores e gestores gerais.
              </span>
            </span>
            <input
              type="checkbox"
              checked={formData.podeVisualizarTodosSetores}
              onChange={event => setFormData(previous => ({
                ...previous,
                podeVisualizarTodosSetores: event.target.checked,
                podeVisualizarTodosPolos: event.target.checked
                  ? true
                  : false,
                setorComunicacao: event.target.checked ? 'todos' : previous.setorComunicacao,
                poloComunicacaoId: event.target.checked ? null : previous.poloComunicacaoId,
              }))}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>

          {!formData.podeVisualizarTodosSetores && (
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Headphones size={14} /> Setor permitido
                </span>
                <select
                  value={formData.setorComunicacao}
                  onChange={event => setFormData(previous => ({
                    ...previous,
                    setorComunicacao: event.target.value as NovoUsuarioFormData['setorComunicacao'],
                  }))}
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
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <Building2 size={14} /> Polo permitido
                </span>
                <select
                  value={formData.podeVisualizarTodosPolos ? '__all__' : formData.poloComunicacaoId || ''}
                  onChange={event => setFormData(previous => ({
                    ...previous,
                    podeVisualizarTodosPolos: event.target.value === '__all__',
                    poloComunicacaoId: event.target.value === '__all__'
                      ? null
                      : event.target.value || null,
                  }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-emerald-500"
                >
                  <option value="">Selecione o polo</option>
                  <option value="__all__">Todos os polos</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>
                      {company.nomeFantasia} — {company.cidade}/{company.uf}
                    </option>
                  ))}
                </select>
              </label>

              <p className="md:col-span-2 text-[11px] font-semibold leading-relaxed text-slate-500">
                O bloqueio é aplicado também no banco: conversas de outro polo ou setor não são retornadas para este usuário.
              </p>
            </div>
          )}
        </div>
      )}

    <div className="mt-8 border-t border-slate-100 pt-8">
      <div className="mb-5 flex items-center gap-2 text-purple-600"><Clock size={20} /><h4 className="text-sm font-black uppercase tracking-wider">Dias e horários deste usuário</h4></div>
      {formData.perfil_acesso_id && (
        <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/70 p-4">
          <input type="checkbox" checked={formData.personalizarHorario} onChange={event => setFormData(previous => ({ ...previous, personalizarHorario: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
          <span><span className="block text-xs font-black uppercase tracking-wider text-purple-900">Usar horário individual</span><span className="mt-1 block text-xs leading-relaxed text-purple-700">Desative para herdar automaticamente os dias e horários do perfil.</span></span>
        </label>
      )}
      {formData.personalizarHorario && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span><span className="block text-xs font-black uppercase tracking-wider text-[#001a33]">Restringir acesso</span><span className="mt-1 block text-xs text-slate-500">Quando desligado, o horário individual fica livre.</span></span>
            <input type="checkbox" checked={formData.horarioAtivo} onChange={event => setFormData(previous => ({ ...previous, horarioAtivo: event.target.checked }))} className="h-5 w-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
          </label>
          {formData.horarioAtivo && (
            <>
              <div className="flex flex-wrap gap-2">
                {USER_FORM_SCHEDULE_DAYS.map(([day, label]) => <button key={day} type="button" onClick={() => onToggleScheduleDay(day)} className={`rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-wider transition-colors ${formData.diasHorario.includes(day) ? 'border-purple-500 bg-purple-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-purple-200'}`}>{label}</button>)}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2"><span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Início</span><input type="time" value={formData.horarioInicio} onChange={event => setFormData(previous => ({ ...previous, horarioInicio: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-purple-500" /></label>
                <label className="space-y-2"><span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Fim</span><input type="time" value={formData.horarioFim} onChange={event => setFormData(previous => ({ ...previous, horarioFim: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-purple-500" /></label>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  </section>
);

export default UserAccessSections;
