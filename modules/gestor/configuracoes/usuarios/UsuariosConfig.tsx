
import React, { useEffect, useRef, useState } from 'react';
import AccessGroupCard from './components/AccessGroupCard';
import UsersList from './components/UsersList';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';
import { RefreshCw } from 'lucide-react';
import { usuariosKeys } from './usuarios.keys';
import { useUsuariosCountsQuery, useUsuariosPolosQuery } from './hooks/useUsuariosConfigQueries';

let usuariosConfigRealtimeInstance = 0;

const UsuariosConfig: React.FC = () => {
  const [selectedContext, setSelectedContext] = useState<{id: string, title: string} | null>(null);
  const selectedContextRef = useRef(selectedContext);
  const channelNameRef = useRef<string>();
  const queryClient = useQueryClient();

  if (!channelNameRef.current) {
    usuariosConfigRealtimeInstance += 1;
    channelNameRef.current = `usuarios-config-realtime-v2-${usuariosConfigRealtimeInstance}`;
  }

  const { data: polos = [], isLoading: isLoadingPolos } = useUsuariosPolosQuery();
  const { data: userCounts = {}, isLoading: isLoadingUsers } = useUsuariosCountsQuery();

  useEffect(() => {
    selectedContextRef.current = selectedContext;
  }, [selectedContext]);

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(channelNameRef.current as string)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios_sistema' },
        () => {
          if (!active) return;
          void queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
          if (selectedContextRef.current) {
            void queryClient.invalidateQueries({
              queryKey: usuariosKeys.byContext(selectedContextRef.current.id),
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          if (!active) return;
          void queryClient.invalidateQueries({ queryKey: usuariosKeys.polos() });
        },
      )
      .subscribe((status) => {
        if (!active || status !== 'SUBSCRIBED') return;

        // Postgres Changes não reproduz eventos perdidos durante a troca de
        // conexão. Reconciliar ao assinar mantém o cache canônico atualizado.
        void queryClient.invalidateQueries({ queryKey: usuariosKeys.polos() });
        void queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
        if (selectedContextRef.current) {
          void queryClient.invalidateQueries({
            queryKey: usuariosKeys.byContext(selectedContextRef.current.id),
          });
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (selectedContext) {
    return (
      <UsersList 
        contextId={selectedContext.id} 
        contextTitle={selectedContext.title} 
        onBack={() => setSelectedContext(null)} 
      />
    );
  }

  if (isLoadingPolos || isLoadingUsers) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando dados dos usuários...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Usuários e Permissões</h3>
        <p className="text-slate-500 text-sm mt-1">
          Selecione o nível de acesso para gerenciar os colaboradores.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Acesso Global / Multi-Empresa */}
        <AccessGroupCard 
          title="Acesso Global / Multi-unidade"
          description="Administradores, Diretores e usuários com permissão em múltiplas empresas."
          type="global"
          userCount={userCounts['global'] || 0}
          onClick={() => setSelectedContext({ id: 'global', title: 'Acesso Global / Multi-unidade' })}
        />

        {/* Cards Dinâmicos por Polo */}
        {polos.map((polo) => (
          <AccessGroupCard 
            key={polo.id}
            title={polo.nome}
            description={`Usuários restritos à unidade de ${polo.cidade}.`}
            type="company"
            userCount={userCounts[polo.id] || 0}
            onClick={() => setSelectedContext({ id: polo.id, title: polo.nome })}
          />
        ))}

      </div>
    </div>
  );
};

export default UsuariosConfig;
