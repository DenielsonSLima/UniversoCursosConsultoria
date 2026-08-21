
import React, { useState } from 'react';
import {
  ArrowLeft,
  Edit3,
  Mail,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import UserFormAdd from './UserFormAdd';
import { buildGestorPermissionsPayload, normalizeFinanceiroTabs, normalizeGestorModules } from '../../../access-control';
import {
  useUsuariosByContextQuery,
  useUsuariosManagementStatesQuery,
} from '../hooks/useUsuariosConfigQueries';
import {
  useCreateUsuarioMutation,
  useDeleteUsuarioMutation,
  useToggleUsuarioStatusMutation,
  useUpdateUsuarioMutation,
} from '../hooks/useUsuariosMutations';
import { NovoUsuarioFormData, UsuarioSistema, UsuarioSistemaInput } from '../usuarios.types';
import ConfirmModal from '../../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../../components/ToastNotification';

interface UsersListProps {
  contextId: string; // 'global' ou ID da empresa
  contextTitle: string;
  onBack: () => void;
}

type UserConfirmation =
  | {
      kind: 'status';
      user: UsuarioSistema;
      nextStatus: 'Ativo' | 'Inativo';
    }
  | {
      kind: 'delete';
      user: UsuarioSistema;
    };

const UsersList: React.FC<UsersListProps> = ({ contextId, contextTitle, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UsuarioSistema | null>(null);
  const [userConfirmation, setUserConfirmation] = useState<UserConfirmation | null>(null);

  const { data: users = [], isLoading, isError, error } = useUsuariosByContextQuery(contextId);
  const managementStatesQuery = useUsuariosManagementStatesQuery(contextId, users);

  const createUserMutation = useCreateUsuarioMutation(contextId, (createdUser) => {
    setIsAddingUser(false);
    toast.success(
      'Usuário cadastrado',
      createdUser.access_message || 'O novo acesso foi criado com sucesso.',
    );
  });

  const updateUserMutation = useUpdateUsuarioMutation(contextId, () => {
    setEditingUser(null);
    toast.success('Usuário atualizado', 'As alterações do acesso foram salvas.');
  });
  const toggleStatusMutation = useToggleUsuarioStatusMutation(contextId);
  const deleteUserMutation = useDeleteUsuarioMutation(contextId);

  const buildPayload = (newUser: NovoUsuarioFormData): UsuarioSistemaInput => {
    const modules = normalizeGestorModules(newUser.permissoes);
    const financeiroTabs = normalizeFinanceiroTabs(newUser.financeiroAbas);
    const isFinanceiro = modules.includes('financeiro') || modules.includes('caixa');
    const isGestor = modules.includes('configuracoes') || modules.includes('relatorios');
    const perfil = isGestor ? 'Gestor' : isFinanceiro ? 'Financeiro' : 'Operacional';

    const permissions = buildGestorPermissionsPayload({
      modules,
      financeiroTabs,
      allPolos: newUser.todosPolos,
      tabs: newUser.abasModulos,
    });

    return {
      nome: `${newUser.nome} ${newUser.sobrenome}`.trim(),
      email: newUser.email,
      cpf: newUser.cpf,
      telefone: newUser.telefone,
      perfil,
      status: editingUser?.status || 'Ativo',
      context: contextId,
      polo_ids: newUser.todosPolos ? [] : newUser.polosAcesso,
      permissoes: permissions,
      perfil_acesso_id: newUser.perfil_acesso_id,
      personalizar_permissoes: Boolean(newUser.perfil_acesso_id && newUser.personalizarPermissoes),
      restricao_horario: newUser.personalizarHorario
        ? {
            ativo: newUser.horarioAtivo,
            dias: newUser.diasHorario,
            horario_inicio: newUser.horarioInicio,
            horario_fim: newUser.horarioFim,
          }
        : null,
      setor_comunicacao: newUser.setorComunicacao,
      polo_comunicacao_id: newUser.podeVisualizarTodosSetores || newUser.podeVisualizarTodosPolos
        ? null
        : newUser.poloComunicacaoId,
      pode_visualizar_todos_polos: newUser.podeVisualizarTodosPolos,
      pode_visualizar_todos_setores: newUser.podeVisualizarTodosSetores,
    };
  };

  const handleSaveUser = async (newUser: NovoUsuarioFormData) => {
    const payload = buildPayload(newUser);
    if (editingUser?.id) {
      updateUserMutation.mutate(
        { id: editingUser.id, user: payload },
        {
          onError: (err: any) => toast.error('Erro ao atualizar usuário', err.message),
        },
      );
      return;
    }

    createUserMutation.mutate(payload, {
      onError: (err: any) => toast.error('Erro ao cadastrar usuário', err.message),
    });
  };

  const filteredUsers = users.filter(user => 
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCloseForm = () => {
    setIsAddingUser(false);
    setEditingUser(null);
  };

  const handleEditUser = (user: UsuarioSistema) => {
    setEditingUser(user);
  };

  const handleToggleStatus = (user: UsuarioSistema) => {
    if (!user.id) return;
    const nextStatus = user.status === 'Ativo' ? 'Inativo' : 'Ativo';
    setUserConfirmation({ kind: 'status', user, nextStatus });
  };

  const handleDeleteUser = (user: UsuarioSistema) => {
    if (!user.id) return;
    setUserConfirmation({ kind: 'delete', user });
  };

  const confirmUserAction = () => {
    if (!userConfirmation?.user.id) return;

    if (userConfirmation.kind === 'status') {
      const { user, nextStatus } = userConfirmation;
      toggleStatusMutation.mutate(
        { id: user.id, status: nextStatus },
        {
          onSuccess: () => toast.success(
            nextStatus === 'Inativo' ? 'Usuário inativado' : 'Usuário reativado',
            `O acesso de ${user.nome} foi ${nextStatus === 'Inativo' ? 'inativado' : 'reativado'} com sucesso.`,
          ),
          onError: (mutationError: Error) => toast.error(
            'Não foi possível alterar o acesso',
            mutationError.message,
          ),
        },
      );
      return;
    }

    const { user } = userConfirmation;
    deleteUserMutation.mutate(user.id, {
      onSuccess: () => toast.success(
        'Usuário excluído',
        `O acesso sem atividade de ${user.nome} foi excluído com sucesso.`,
      ),
      onError: (mutationError: Error) => toast.error(
        'Não foi possível excluir o usuário',
        mutationError.message,
      ),
    });
  };

  if (isAddingUser || editingUser) {
    return (
      <>
        <ToastNotification toasts={toasts} onRemove={removeToast} />
        <UserFormAdd
          contextId={contextId}
          initialUser={editingUser || undefined}
          onSave={handleSaveUser}
          onCancel={handleCloseForm}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando colaboradores...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <p className="text-red-600 font-bold">Erro ao carregar colaboradores:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      {/* Header da Lista */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">{contextTitle}</h3>
            <p className="text-slate-500 text-sm">
              Gerenciando usuários com acesso a este nível.
            </p>
          </div>
        </div>
        
        <button 
            onClick={() => setIsAddingUser(true)}
            className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Adicionar Usuário
        </button>
      </div>

      {/* Barra de Busca */}
      <div className="bg-white p-4 rounded-2xl mb-8 flex items-center gap-3 border border-slate-100 shadow-sm">
        <Search size={20} className="text-slate-400" />
        <input 
          type="text" 
          placeholder="Buscar por nome ou e-mail..."
          className="bg-transparent w-full outline-none text-slate-700 font-medium placeholder-slate-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid de Cards de Usuários */}
      {managementStatesQuery.isError && users.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
          Não foi possível verificar o histórico dos usuários. As ações de inativar e excluir ficaram indisponíveis por segurança.
        </div>
      )}
      {filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm">
            <Shield size={32} />
          </div>
          <p className="text-slate-500 font-medium">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredUsers.map((user) => {
            const managementState = user.id
              ? managementStatesQuery.data?.[user.id]
              : undefined;
            const isManaging = toggleStatusMutation.isPending || deleteUserMutation.isPending;

            return (
            <div 
              key={user.id} 
              className="bg-white rounded-[2rem] border border-slate-100 p-6 hover:shadow-xl hover:shadow-blue-900/5 hover:border-blue-200 transition-all duration-300 group flex flex-col items-center relative overflow-hidden"
            >
               {/* Decoração Hover */}
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              {/* Avatar */}
              <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4 text-2xl font-black text-slate-300 shadow-sm group-hover:scale-105 transition-transform">
                {user.nome.charAt(0)}
              </div>

              {/* Info Principal */}
              <div className="text-center mb-6 w-full">
                <h3 className="font-bold text-[#001a33] text-lg mb-1 truncate px-2" title={user.nome}>
                  {user.nome}
                </h3>
                <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs font-medium bg-slate-50 py-1 px-3 rounded-full w-fit mx-auto border border-slate-100">
                  <Mail size={12} />
                  <span className="truncate max-w-[150px]">{user.email}</span>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  Perfil de Acesso: {user.perfil_nome || 'Não vinculado (permissões individuais)'}
                </p>
              </div>

              {/* Badges e Status */}
              <div className="w-full flex items-center justify-between border-t border-slate-50 pt-4 mt-auto">
                 <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                     user.perfil === 'Gestor' 
                     ? 'bg-purple-50 text-purple-700 border-purple-100' 
                     : 'bg-blue-50 text-blue-700 border-blue-100'
                 }`}>
                    {user.perfil}
                </span>

                 {user.status === 'Ativo' ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div> 
                      Ativo
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <div className="w-2 h-2 bg-slate-300 rounded-full"></div> 
                      Inativo
                    </div>
                  )}
              </div>

              <div className="mt-4 grid w-full grid-cols-2 gap-2 border-t border-slate-50 pt-4">
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Polos</p>
                  <p className="mt-1 text-[11px] font-black text-[#001a33]">
                    {user.permissoes?.allPolos ? 'Todos' : `${user.polo_ids?.length || 0}`}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Modulos</p>
                  <p className="mt-1 text-[11px] font-black text-[#001a33]">
                    {user.permissoes?.modules.length || 0}
                  </p>
                </div>
              </div>

              <div className="mt-4 w-full space-y-2">
                <button
                  onClick={() => handleEditUser(user)}
                  className="w-full rounded-xl bg-[#001a33] text-white text-xs uppercase tracking-wider py-2.5 font-bold inline-flex items-center justify-center gap-2 hover:bg-blue-900 transition-colors shadow-md"
                >
                  <Edit3 size={14} /> Editar
                </button>

                {managementStatesQuery.isLoading && (
                  <div className="flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <RefreshCw className="animate-spin" size={12} />
                    Verificando histórico
                  </div>
                )}

                {managementState?.canChangeStatus && (
                  <div className={`grid gap-2 ${managementState.canDelete ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <button
                      type="button"
                      disabled={isManaging}
                      onClick={() => handleToggleStatus(user)}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        user.status === 'Ativo'
                          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {user.status === 'Ativo'
                        ? <><Power size={13} /> Inativar</>
                        : <><RotateCcw size={13} /> Reativar</>}
                    </button>

                    {managementState.canDelete && (
                      <button
                        type="button"
                        disabled={isManaging}
                        onClick={() => handleDeleteUser(user)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={13} /> Excluir
                      </button>
                    )}
                  </div>
                )}

                {managementState?.hasActivity && managementState.canChangeStatus && (
                  <p className="px-1 text-center text-[10px] font-semibold leading-relaxed text-slate-400">
                    Possui histórico: exclusão bloqueada, somente inativação.
                  </p>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        isOpen={userConfirmation !== null}
        title={
          userConfirmation?.kind === 'delete'
            ? 'Excluir usuário'
            : userConfirmation?.nextStatus === 'Inativo'
              ? 'Inativar usuário'
              : 'Reativar usuário'
        }
        message={
          userConfirmation?.kind === 'delete'
            ? `Excluir permanentemente ${userConfirmation.user.nome}? Esta ação só é permitida para usuários sem nenhuma atividade.`
            : userConfirmation?.nextStatus === 'Inativo'
              ? `Deseja inativar o acesso de ${userConfirmation?.user.nome}?`
              : `Deseja reativar o acesso de ${userConfirmation?.user.nome}?`
        }
        confirmText={
          userConfirmation?.kind === 'delete'
            ? 'Excluir'
            : userConfirmation?.nextStatus === 'Inativo'
              ? 'Inativar'
              : 'Reativar'
        }
        cancelText="Cancelar"
        variant={userConfirmation?.kind === 'delete' ? 'danger' : 'warning'}
        onClose={() => setUserConfirmation(null)}
        onConfirm={confirmUserAction}
      />
    </div>
  );
};

export default UsersList;
