// clientes.hooks.ts
// ✅ Query keys tipadas e centralizadas (não strings soltas)
// ✅ Invalidação cirúrgica após mutação
// ✅ staleTime configurado para este tipo de dado
// ✅ onError com log e feedback ao usuário

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clienteService } from './clientes.service';
import { useOrganizacao } from '@/store/organizacao.store';
import type { CreateClienteInput, UpdateClienteInput } from './clientes.types';

// ─── Query Keys (centralizadas aqui — nunca strings soltas nos componentes) ─

export const clienteQueryKeys = {
  all: (orgId: string) =>
    ['clientes', orgId] as const,
  list: (orgId: string, pagina: number, busca?: string) =>
    ['clientes', orgId, 'list', pagina, busca] as const,
  detail: (orgId: string, id: string) =>
    ['clientes', orgId, 'detail', id] as const,
};

// ─── Hooks de Leitura ─────────────────────────────────────────────────────

export function useClientes(pagina = 0, busca?: string) {
  const { organizationId } = useOrganizacao();

  return useQuery({
    queryKey: clienteQueryKeys.list(organizationId, pagina, busca),
    queryFn: () => clienteService.getAll({ organizationId, pagina, busca }),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,          // clientes: cache de 5 minutos
    placeholderData: (prev) => prev,    // mantém dados anteriores ao paginar
  });
}

export function useCliente(id: string) {
  const { organizationId } = useOrganizacao();

  return useQuery({
    queryKey: clienteQueryKeys.detail(organizationId, id),
    queryFn: () => clienteService.getById(id),
    enabled: !!organizationId && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Hooks de Escrita ─────────────────────────────────────────────────────

export function useCriarCliente() {
  const queryClient = useQueryClient();
  const { organizationId } = useOrganizacao();

  return useMutation({
    mutationFn: (input: CreateClienteInput) => clienteService.create(input),
    onSuccess: () => {
      // Invalida apenas as queries de lista — detail não precisa
      queryClient.invalidateQueries({
        queryKey: clienteQueryKeys.all(organizationId),
      });
    },
    onError: (error: Error) => {
      console.error('[useCriarCliente]', error.message);
      // O componente exibe o toast via onError do próprio useMutation
    },
  });
}

export function useAtualizarCliente() {
  const queryClient = useQueryClient();
  const { organizationId } = useOrganizacao();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateClienteInput }) =>
      clienteService.update(id, input),
    onSuccess: (clienteAtualizado) => {
      // Atualiza cache do detail sem refetch
      queryClient.setQueryData(
        clienteQueryKeys.detail(organizationId, clienteAtualizado.id),
        clienteAtualizado
      );
      // Invalida a lista para refletir mudanças
      queryClient.invalidateQueries({
        queryKey: clienteQueryKeys.all(organizationId),
      });
    },
  });
}

export function useDesativarCliente() {
  const queryClient = useQueryClient();
  const { organizationId } = useOrganizacao();

  return useMutation({
    mutationFn: (id: string) => clienteService.desativar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: clienteQueryKeys.all(organizationId),
      });
    },
  });
}
