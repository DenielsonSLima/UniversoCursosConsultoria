
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Search, Shield, Mail, RefreshCw } from 'lucide-react';
import { usuariosService, UsuarioSistema } from '../usuarios.service';
import UserFormAdd from './UserFormAdd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

interface UsersListProps {
  contextId: string; // 'global' ou ID da empresa
  contextTitle: string;
  onBack: () => void;
}

const UsersList: React.FC<UsersListProps> = ({ contextId, contextTitle, onBack }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // 1. Buscar os usuários deste contexto
  const { data: users = [], isLoading, isError, error } = useQuery<UsuarioSistema[]>({
    queryKey: ['users_by_context', contextId],
    queryFn: () => {
      if (contextId === 'global') {
        return usuariosService.getGlobalUsers();
      } else {
        return usuariosService.getUsersByContext(contextId);
      }
    },
  });

  // 2. Escuta Realtime focada neste contexto de usuários
  useEffect(() => {
    const channel = supabase
      .channel(`users_list_realtime_${contextId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios_sistema', filter: `context=eq.${contextId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['users_by_context', contextId] });
          queryClient.invalidateQueries({ queryKey: ['usuarios_counts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contextId, queryClient]);

  // 3. Mutation para criar usuário
  const createUserMutation = useMutation({
    mutationFn: (newUser: Omit<UsuarioSistema, 'id'>) => usuariosService.createUser(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_by_context', contextId] });
      queryClient.invalidateQueries({ queryKey: ['usuarios_counts'] });
      setIsAddingUser(false);
      alert('Usuário cadastrado com sucesso!');
    },
    onError: (err: any) => alert(`Erro ao cadastrar usuário: ${err.message}`),
  });

  const handleSaveUser = async (newUser: any) => {
    const isGestor = newUser.permissoes.includes('configuracoes') || newUser.permissoes.includes('financeiro');
    
    createUserMutation.mutate({
      nome: `${newUser.nome} ${newUser.sobrenome}`.trim(),
      email: newUser.email,
      cpf: newUser.cpf,
      telefone: newUser.telefone,
      perfil: isGestor ? 'Gestor' : 'Operacional',
      status: 'Ativo',
      context: contextId
    });
  };

  const filteredUsers = users.filter(user => 
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isAddingUser) {
    return (
      <UserFormAdd 
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UsersList;
