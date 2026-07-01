
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Search, Shield, Mail, RefreshCw } from 'lucide-react';
import UserFormAdd from './UserFormAdd';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import { buildGestorPermissionsPayload, normalizeFinanceiroTabs, normalizeGestorModules } from '../../../access-control';
import { usuariosKeys } from '../usuarios.keys';
import { useUsuariosByContextQuery } from '../hooks/useUsuariosConfigQueries';
import { useCreateUsuarioMutation } from '../hooks/useUsuariosMutations';
import { NovoUsuarioFormData, UsuarioSistemaInput } from '../usuarios.types';

interface UsersListProps {
  contextId: string; // 'global' ou ID da empresa
  contextTitle: string;
  onBack: () => void;
}

const UsersList: React.FC<UsersListProps> = ({ contextId, contextTitle, onBack }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  const { data: users = [], isLoading, isError, error } = useUsuariosByContextQuery(contextId);

  // 2. Escuta Realtime focada neste contexto de usuários
  useEffect(() => {
    const channel = supabase
      .channel(`users_list_realtime_${contextId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios_sistema', filter: `context=eq.${contextId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: usuariosKeys.byContext(contextId) });
          queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contextId, queryClient]);

  const createUserMutation = useCreateUsuarioMutation(contextId, () => {
      setIsAddingUser(false);
      alert('Usuário cadastrado com sucesso!');
  });

  const handleSaveUser = async (newUser: NovoUsuarioFormData) => {
    const modules = normalizeGestorModules(newUser.permissoes);
    const financeiroTabs = normalizeFinanceiroTabs(newUser.financeiroAbas);
    const isFinanceiro = modules.includes('financeiro') || modules.includes('caixa');
    const isGestor = modules.includes('configuracoes') || modules.includes('relatorios');
    const perfil = isGestor ? 'Gestor' : isFinanceiro ? 'Financeiro' : 'Operacional';
    const permissions = buildGestorPermissionsPayload({
      modules,
      financeiroTabs,
      allPolos: newUser.todosPolos,
    });
    
    const payload: UsuarioSistemaInput = {
      nome: `${newUser.nome} ${newUser.sobrenome}`.trim(),
      email: newUser.email,
      senha: newUser.senha,
      cpf: newUser.cpf,
      telefone: newUser.telefone,
      perfil,
      status: 'Ativo',
      context: contextId,
      polo_ids: newUser.todosPolos ? [] : newUser.polosAcesso,
      permissoes: permissions,
    };

    createUserMutation.mutate(payload, {
      onError: (err: any) => alert(`Erro ao cadastrar usuário: ${err.message}`),
    });
  };

  const filteredUsers = users.filter(user => 
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isAddingUser) {
    return (
      <UserFormAdd 
        contextId={contextId}
        onSave={handleSaveUser} 
        onCancel={() => setIsAddingUser(false)} 
      />
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
      {filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm">
            <Shield size={32} />
          </div>
          <p className="text-slate-500 font-medium">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredUsers.map((user) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UsersList;
