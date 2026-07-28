import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosKeys } from '../usuarios.keys';
import { usuariosService } from '../usuarios.service';
import { UsuarioSistemaInput } from '../usuarios.types';

interface UpdateUsuarioPayload {
  id: string;
  user: UsuarioSistemaInput;
}

export const useCreateUsuarioMutation = (contextId: string, onSuccess?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newUser: UsuarioSistemaInput) => usuariosService.createUser(newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usuariosKeys.byContext(contextId) });
      queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
      onSuccess?.();
    },
  });
};

export const useUpdateUsuarioMutation = (contextId: string, onSuccess?: () => void) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, user }: UpdateUsuarioPayload) => usuariosService.updateUser(id, user),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usuariosKeys.byContext(contextId) });
      queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
      onSuccess?.();
    },
  });
};

export const useToggleUsuarioStatusMutation = (
  contextId: string,
  onSuccess?: () => void,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'Ativo' | 'Inativo' }) =>
      usuariosService.toggleUserStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usuariosKeys.byContext(contextId) });
      queryClient.invalidateQueries({ queryKey: usuariosKeys.management(contextId) });
      onSuccess?.();
    },
  });
};

export const useDeleteUsuarioMutation = (
  contextId: string,
  onSuccess?: () => void,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => usuariosService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usuariosKeys.byContext(contextId) });
      queryClient.invalidateQueries({ queryKey: usuariosKeys.counts() });
      queryClient.invalidateQueries({ queryKey: usuariosKeys.management(contextId) });
      onSuccess?.();
    },
  });
};
