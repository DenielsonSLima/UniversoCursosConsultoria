import React from 'react';
import { Building2, Headphones, LayoutDashboard, Lock, Edit3, Trash2, Clock, Check, X } from 'lucide-react';
import type { PerfilAcesso } from './perfis-acesso.service';
import { normalizeGestorPermissions, getAllowedDashboardWidgets } from '../../access-control';
interface PerfisAcessoListProps {
 perfis: PerfilAcesso[];
 userCounts: Record<string, number>;
 confirmDeleteId: string | null;
 handleDelete: (id: string) => void;
 handleOpenForm: (perfil?: PerfilAcesso) => void;
 setConfirmDeleteId: React.Dispatch<React.SetStateAction<string | null>>;
}
const PerfisAcessoList: React.FC<PerfisAcessoListProps> = ({ perfis, userCounts, confirmDeleteId, handleDelete, handleOpenForm, setConfirmDeleteId }) => (
<div className="config-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
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
                className="config-card config-access-card bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5 transition-all duration-300 group"
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
);

export default PerfisAcessoList;
