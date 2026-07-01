import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usuariosKeys } from '../usuarios.keys';
import { usuariosService } from '../usuarios.service';
import { UsuarioSistemaInput } from '../usuarios.types';

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
